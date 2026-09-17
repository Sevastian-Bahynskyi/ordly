import { senseContentVersion, vocabularyTask } from './practice-content'
import { newTargetBudget, practiceStudyDate, type PracticeAttempt, type PracticeSessionState, type PracticeStore, type PracticeTask } from './practice'
import {
  assembleTask, chooseTask, clozeTypedTask, CLOZE_DISTRACTOR_COUNT, MEANING_DISTRACTOR_COUNT, pickMeaningTask, produceSenseTask,
  selectDistractors, selectMeaningDistractors, sentenceAssembleTask, senseTask, WORD_BANK_DISTRACTOR_COUNT,
  type DistractorEntry, type ExerciseInput,
} from './practice-exercises'
import { itemSenses, senseTargetKey, SENSE_PROMOTION_MIN_REPS, TARGET_KEY_MAX_LENGTH, type SenseCandidate } from './practice-senses'
import { scoreTargets, type TargetLevel, type TargetScore } from './practice-targets'
import { synonymNeighbourIds, type SynonymLinkRow } from './synonyms'
import type { EntrySense, ReviewItem, TranslationLanguage } from './types'

/**
 * The local practice engine. No provider call is needed to plan or grade a board.
 *
 * A session is about up to `SESSION_TARGETS` of the learner's own items: new ones first by the
 * daily budget, then the weakest by `scoreTargets`. Each item gets two exercises that climb its
 * ladder, easy to hard (recognise → choose in context → build → type it). All first exercises
 * come before any second one, so every item returns after the others have had a turn: spaced
 * and interleaved within the session (Nakata & Suzuki 2019).
 */

export const SESSION_TARGETS = 10

/** Enough wrong options for the widest board (a cloze) plus the word bank's spare tiles. */
const DISTRACTOR_POOL_SIZE = CLOZE_DISTRACTOR_COUNT + WORD_BANK_DISTRACTOR_COUNT

type Builder = (input: ExerciseInput) => PracticeTask | null

/** Easy to hard, per rung. The planner takes the first that has material, then a harder one. */
const WORD_LADDER: Record<TargetLevel, Builder[]> = {
  0: [pickMeaningTask, chooseTask, assembleTask, clozeTypedTask, produceSenseTask],
  1: [chooseTask, clozeTypedTask, senseTask, assembleTask, produceSenseTask],
  2: [senseTask, assembleTask, clozeTypedTask, produceSenseTask],
  3: [clozeTypedTask, produceSenseTask],
}

const SENTENCE_LADDER: Record<TargetLevel, Builder[]> = {
  0: [pickMeaningTask, sentenceAssembleTask, clozeTypedTask, produceSenseTask],
  1: [sentenceAssembleTask, clozeTypedTask, produceSenseTask],
  2: [clozeTypedTask, sentenceAssembleTask, produceSenseTask],
  3: [clozeTypedTask, produceSenseTask],
}

function coldness(sense: EntrySense): number {
  const parsed = Date.parse(sense.coverage?.last_seen || '')
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

/**
 * The meaning an item is practised on. A meaning whose own objective is due comes first, so its
 * FSRS card is reused (D15). Otherwise a new or barely known item uses its primary meaning, and
 * once its entry is recognised (D18) the coldest meaning takes a turn, the primary one winning ties.
 */
function senseFor(score: TargetScore, senses: EntrySense[], context: PlanContext): EntrySense {
  const entry = score.item.vocabulary_entries
  const due = senses
    .map((sense) => ({ sense, objective: context.store.objectives[senseTargetKey(entry.id, sense.id)] }))
    .filter(({ sense, objective }) => objective && Date.parse(objective.card.due) <= context.now.getTime() && objective.task.contentVersion === senseContentVersion(entry, sense))
    .sort((a, b) => Date.parse(a.objective!.card.due) - Date.parse(b.objective!.card.due))
  if (due.length) return due[0].sense
  if (score.level === 0 || score.item.reps < SENSE_PROMOTION_MIN_REPS) return senses[0]
  return senses.reduce((coldest, sense) => coldness(sense) < coldness(coldest) ? sense : coldest, senses[0])
}

interface PlanContext {
  pool: readonly DistractorEntry[]
  links: readonly SynonymLinkRow[]
  store: PracticeStore
  now: Date
}

/**
 * Wrong Danish options, drawn from the learner's own vocabulary (D6). Direct confirmed synonyms
 * are excluded because they may genuinely fit a gap; their own neighbours are preferred.
 */
function danishDistractors(item: ReviewItem, sense: EntrySense, context: PlanContext, seed: string): string[] {
  const entryId = item.entry_id
  const direct = synonymNeighbourIds(entryId, context.links, { confirmedOnly: true })
  const secondHop = direct.flatMap((id) => synonymNeighbourIds(id, context.links, { confirmedOnly: true }))
  const exclude = new Set([entryId, ...direct.map((id) => id.toLowerCase())])
  return selectDistractors({
    answer: item.vocabulary_entries.danish,
    pos: sense.pos,
    pool: context.pool.filter((entry) => !entry.sentence),
    preferIds: secondHop.filter((id) => !exclude.has(id.toLowerCase())),
    excludeIds: [...exclude],
    count: DISTRACTOR_POOL_SIZE,
    seed,
  })
}

function exercisesFor(score: TargetScore, context: PlanContext): PracticeTask[] {
  const item = score.item
  const entry = item.vocabulary_entries
  const senses = itemSenses(item)
  const recall = score.due && item.reps > 0 ? { ...vocabularyTask(item, 'meaning'), stage: 'build' as const } : null

  // A row without stored senses cannot key a sense objective; it keeps the entry-level pair.
  if (!senses.length) {
    const production = { ...vocabularyTask(item, 'production'), newTarget: score.isNew }
    return recall ? [recall, production] : [production]
  }

  const sense = senseFor(score, senses, context)
  const targetKey = senseTargetKey(entry.id, sense.id)
  if (targetKey.length > TARGET_KEY_MAX_LENGTH) return recall ? [recall] : []
  const candidate: SenseCandidate = { item, entryId: entry.id, sense, primary: sense.id === senses[0].id, targetKey }
  const sentence = entry.entry_kind === 'sentence'
  const seed = `${targetKey}:${item.reps}`
  const exclude = [entry.id, ...synonymNeighbourIds(entry.id, context.links, { confirmedOnly: true })]
  const input: ExerciseInput = {
    candidate,
    senses,
    distractors: danishDistractors(item, sense, context, seed),
    meaningDistractors: selectMeaningDistractors({
      answers: senses.map((candidateSense) => candidateSense.text), pos: sense.pos, sentence,
      pool: context.pool, excludeIds: exclude, count: MEANING_DISTRACTOR_COUNT, seed,
    }),
    newTarget: false,
    reps: context.store.objectives[targetKey]?.card.reps || 0,
  }

  const ladder = (sentence ? SENTENCE_LADDER : WORD_LADDER)[score.level]
  const built: PracticeTask[] = []
  for (const build of ladder) {
    const task = build(input)
    if (!task || built.some((existing) => existing.kind === task.kind)) continue
    built.push(task)
    if (built.length === 2) break
  }
  const [first, second] = built
  if (!first) return recall ? [recall] : []
  const tasks: PracticeTask[] = [{ ...first, stage: 'remember', newTarget: score.isNew }]
  // A due review card is also moved forward by one typed meaning recall, in place of the easier
  // second step, so practising a weak word does not leave its ordinary review waiting.
  const finish = score.level >= 2 && recall ? recall : second || recall
  if (finish) tasks.push({ ...finish, stage: 'build' })
  return tasks
}

/** New and weak items alternate so a session never opens with a block of unfamiliar words. */
function interleave(fresh: TargetScore[], weak: TargetScore[]): TargetScore[] {
  const order: TargetScore[] = []
  let f = 0
  let w = 0
  while (f < fresh.length || w < weak.length) {
    if (f < fresh.length) order.push(fresh[f++])
    if (w < weak.length) order.push(weak[w++])
    if (w < weak.length && f >= fresh.length) order.push(weak[w++])
  }
  return order
}

export function planPractice(input: {
  items: ReviewItem[]; store: PracticeStore; attempts: PracticeAttempt[]; introducedToday: number;
  dailyLimit: number; language: TranslationLanguage; aiEnabled: boolean; now: Date;
  /** `entry_links` rows for this learner. Only `synonym` edges are read, and only confirmed ones. */
  links?: readonly SynonymLinkRow[];
}): PracticeSessionState {
  const { store, attempts, now } = input
  const usable = input.items.filter((item) => item.vocabulary_entries.translation?.trim())
  const scores = scoreTargets({ items: usable, store, attempts, now })
  const dueCount = scores.filter((score) => score.due).length
  const recent = attempts.filter((a) => a.assistance === 'none' && a.result !== 'ungraded' && a.objective !== null && a.kind !== 'teach').slice(-20).map((a) => a.result !== 'incorrect' && a.rating !== 1)
  const budget = newTargetBudget({ dailyLimit: input.dailyLimit, introducedToday: input.introducedToday, dueCount, recent })

  const fresh = scores.filter((score) => score.isNew)
    .sort((a, b) => Date.parse(b.item.vocabulary_entries.created_at) - Date.parse(a.item.vocabulary_entries.created_at) || a.item.entry_id.localeCompare(b.item.entry_id))
    .slice(0, budget)
  const weak = scores.filter((score) => !score.isNew)
    .sort((a, b) => b.priority - a.priority || a.item.entry_id.localeCompare(b.item.entry_id))
    .slice(0, SESSION_TARGETS - fresh.length)

  const context: PlanContext = {
    pool: usable.map((item) => ({ id: item.entry_id, danish: item.vocabulary_entries.danish, senses: itemSenses(item), sentence: item.vocabulary_entries.entry_kind === 'sentence' })),
    links: input.links || [],
    store,
    now,
  }
  const plans = interleave(fresh, weak).map((score) => exercisesFor(score, context)).filter((tasks) => tasks.length)
  const firsts = plans.map((tasks) => tasks[0])
  // Second steps start from the middle of the order, so no item is served twice in a row.
  const offset = Math.ceil(plans.length / 2)
  const seconds = [...plans.slice(offset), ...plans.slice(0, offset)].flatMap((tasks) => tasks.slice(1))
  if (seconds.length > 1 && seconds[0].targetKey === firsts.at(-1)?.targetKey) seconds.push(seconds.shift()!)
  const queue = [...firsts, ...seconds]
  return { version: 1, id: crypto.randomUUID(), queue, attempts: [], completed: 0, elapsedSeconds: 0, createdAt: now.toISOString(), aiEnabled: input.aiEnabled, aiCalls: 0, current: null }
}

export function introducedPracticeTargets(attempts: PracticeAttempt[], now: Date): Set<string> {
  return new Set(attempts.filter((a) => a.newTarget && practiceStudyDate(new Date(a.at)) === practiceStudyDate(now)).map((a) => a.targetKey))
}

/**
 * Senses this plan is admitting for the first time, so the caller can fill in a missing example
 * before the exercise is served (D10). Lazy by design: an example is generated when the meaning
 * first becomes a target, never in bulk for the whole vocabulary.
 */
export function newSenseObjectives(session: PracticeSessionState): PracticeTask[] {
  return session.queue.filter((task) => task.newTarget && task.senseId && task.entryId)
}
