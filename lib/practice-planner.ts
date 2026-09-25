import { attemptOutcomes, PRACTICE_CONTENT_REVISION, queueSeconds, seedHash, type PracticeAttempt, type PracticeSessionState, type PracticeTask } from './practice'
import {
  assembleTask, chooseTask, clozeTypedTask, CLOZE_DISTRACTOR_COUNT, contextAssembleTask, contextClozeTask, MEANING_DISTRACTOR_COUNT, pickMeaningTask, produceSenseTask,
  selectDistractors, selectMeaningDistractors, sentenceAssembleTask, senseTask, WORD_BANK_DISTRACTOR_COUNT,
  type DistractorEntry, type ExerciseInput,
} from './practice-exercises'
import type { CatalogContext } from './practice-contexts'
import { itemSenses, senseExample, senseTargetKey, SENSE_PROMOTION_MIN_REPS, TARGET_KEY_MAX_LENGTH, type SenseCandidate } from './practice-senses'
import { binaryTask, dialogueTasks, flashTask, matchTask, oddTask, sortTask } from './practice-formats'
import { scoreTargets, type TargetLevel, type TargetScore } from './practice-targets'
import { synonymNeighbourIds, type SynonymLinkRow } from './synonyms'
import type { EntrySense, ReviewItem, TranslationLanguage } from './types'

/**
 * The local practice planner. No provider is called to plan or grade a board, and nothing here
 * writes anything: a plan is a persisted queue of prepared exercises (ADR 0001).
 *
 * Targets are the learner's own saved senses. New items come first up to a small per-session cap,
 * then the weakest by `scoreTargets`. Each target gets two exercises that climb its ladder, and
 * targets are added until the queue's estimated length reaches the chosen time. All first
 * exercises come before any second one, so every item returns after the others have had a turn:
 * spaced and interleaved within the session (Nakata & Suzuki 2019).
 */

/** The most never-practised items one session introduces. Review's daily new limit is not used. */
export const NEW_TARGETS_PER_SESSION = 4

/** No queue is longer than this; it also bounds the persisted session's size. */
export const MAX_QUEUE = 90

/** Enough wrong options for the widest board (a cloze) plus the word bank's spare tiles. */
const DISTRACTOR_POOL_SIZE = CLOZE_DISTRACTOR_COUNT + WORD_BANK_DISTRACTOR_COUNT

type Builder = (input: ExerciseInput) => PracticeTask | null

/**
 * Easy to hard, per rung. The planner takes the first that has material, then one harder one
 * chosen by the session seed, so the same word meets different formats across sessions.
 * Recognition (choice, binary) leads; production (type) and self-rated recall (flash) follow.
 */
/** Formats that only ask the learner to recognise a meaning, never to recall or use the word. */
const RECOGNITION_KINDS = new Set<PracticeTask['kind']>(['pick', 'binary', 'flash'])

/** The learner's own example first; a catalog sentence stands in when there is none. */
const ownThenCatalog = (own: Builder, catalog: Builder): Builder => (input) => own(input) || catalog(input)
/** A catalog sentence first, for a word already met: a new context rather than the memorised one. */
const catalogThenOwn = (own: Builder, catalog: Builder): Builder => (input) => catalog(input) || own(input)

const WORD_LADDER: Record<TargetLevel, Builder[]> = {
  0: [pickMeaningTask, binaryTask, chooseTask, ownThenCatalog(assembleTask, contextAssembleTask), ownThenCatalog(clozeTypedTask, contextClozeTask)],
  1: [chooseTask, binaryTask, ownThenCatalog(clozeTypedTask, contextClozeTask), senseTask, catalogThenOwn(assembleTask, contextAssembleTask), flashTask, produceSenseTask],
  2: [senseTask, catalogThenOwn(assembleTask, contextAssembleTask), catalogThenOwn(clozeTypedTask, contextClozeTask), flashTask, produceSenseTask],
  3: [catalogThenOwn(clozeTypedTask, contextClozeTask), flashTask, produceSenseTask],
}

const SENTENCE_LADDER: Record<TargetLevel, Builder[]> = {
  0: [pickMeaningTask, sentenceAssembleTask, clozeTypedTask, produceSenseTask],
  1: [sentenceAssembleTask, clozeTypedTask, produceSenseTask],
  2: [clozeTypedTask, sentenceAssembleTask, produceSenseTask],
  3: [clozeTypedTask, produceSenseTask],
}

interface PlanContext {
  pool: readonly DistractorEntry[]
  links: readonly SynonymLinkRow[]
  /** When each sense target was last practised, from the attempt history. */
  practisedAt: ReadonlyMap<string, number>
  /** Each entry's verified forms, for typed gaps. */
  formsByEntry: Readonly<Record<string, readonly string[]>>
  /** Catalog sentences per saved sense id, already in the learner's language. */
  contextsBySense: Readonly<Record<string, readonly CatalogContext[]>>
  seed: string
}

/**
 * One catalog sentence for this sense, chosen by the session seed so the same word meets a
 * different context in a different session. A sentence identical to the learner's own example
 * adds nothing and is skipped.
 */
function contextFor(candidate: SenseCandidate, context: PlanContext, seed: string): CatalogContext | undefined {
  const own = senseExample(candidate.item, candidate.sense, candidate.primary).sentence.trim().toLocaleLowerCase('da-DK')
  const options = (context.contextsBySense[candidate.sense.id] || []).filter((option) => option.sentence.trim().toLocaleLowerCase('da-DK') !== own)
  return options.length ? options[seedHash(`${seed}:context`) % options.length] : undefined
}

/**
 * The meaning an item is practised on. A new or barely known item uses its primary meaning; once
 * its entry is recognised (D18) the coldest meaning takes a turn — least recently seen in Review
 * or practised — with the primary one winning ties.
 */
function senseFor(score: TargetScore, senses: EntrySense[], context: PlanContext): EntrySense {
  if (score.level === 0 || score.item.reps < SENSE_PROMOTION_MIN_REPS) return senses[0]
  const entryId = score.item.vocabulary_entries.id
  const coldness = (sense: EntrySense): number => {
    const reviewed = Date.parse(sense.coverage?.last_seen || '')
    const practised = context.practisedAt.get(senseTargetKey(entryId, sense.id)) ?? Number.NEGATIVE_INFINITY
    return Math.max(Number.isFinite(reviewed) ? reviewed : Number.NEGATIVE_INFINITY, practised)
  }
  return senses.reduce((coldest, sense) => coldness(sense) < coldness(coldest) ? sense : coldest, senses[0])
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

/** Up to two exercises for one saved item, easy then harder. Empty when nothing safe can be built. */
/** The sense an item is practised on this session, or null when it has no stable target. */
function candidateFor(score: TargetScore, context: PlanContext): SenseCandidate | null {
  const item = score.item
  const entry = item.vocabulary_entries
  const senses = itemSenses(item)
  // A row without stored senses cannot key a stable target; it is not practised until it has one.
  if (!senses.length) return null
  const sense = senseFor(score, senses, context)
  const targetKey = senseTargetKey(entry.id, sense.id)
  if (targetKey.length > TARGET_KEY_MAX_LENGTH) return null
  return { item, entryId: entry.id, sense, primary: sense.id === senses[0].id, targetKey }
}

function exercisesFor(score: TargetScore, context: PlanContext): PracticeTask[] {
  const candidate = candidateFor(score, context)
  if (!candidate) return []
  const { item, sense, targetKey } = candidate
  const entry = item.vocabulary_entries
  const senses = itemSenses(item)
  const sentence = entry.entry_kind === 'sentence'
  const seed = `${context.seed}:${targetKey}`
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
    forms: context.formsByEntry[entry.id],
    context: contextFor(candidate, context, seed),
  }

  const available: PracticeTask[] = []
  for (const build of (sentence ? SENTENCE_LADDER : WORD_LADDER)[score.level]) {
    const task = build(input)
    if (task && !available.some((existing) => existing.kind === task.kind)) available.push(task)
  }
  const [first, ...harder] = available
  if (!first) return []
  // The second step should ask for more than recognition when the ladder offers anything more.
  const productive = harder.filter((task) => !RECOGNITION_KINDS.has(task.kind))
  const options = productive.length ? productive : harder
  const second = options.length ? options[seedHash(seed) % options.length] : null
  return [first, ...(second ? [second] : [])].map((task, index) => ({ ...task, newTarget: index === 0 && score.isNew }))
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

export interface PracticePlanInput {
  /** Owner-scoped Review cards with their saved entries. Read, never written. */
  items: ReviewItem[]
  attempts: readonly PracticeAttempt[]
  targetMinutes: number
  seed: string
  locale: TranslationLanguage
  now: Date
  /** `entry_links` rows for this learner. Only confirmed `synonym` edges are read. */
  links?: readonly SynonymLinkRow[]
  /** Each entry's verified forms, from `word_forms`. */
  formsByEntry?: Readonly<Record<string, readonly string[]>>
  /** Catalog sentences per saved sense id, in the learner's language (`contextsBySense`). */
  contextsBySense?: Readonly<Record<string, readonly CatalogContext[]>>
}

/** Group boards take at most this share of the session, so single-word practice still leads. */
const GROUP_SHARE = 0.4

export function planPractice(input: PracticePlanInput): PracticeSessionState {
  const { attempts, now } = input
  const usable = input.items.filter((item) => item.vocabulary_entries.translation?.trim())
  const scores = scoreTargets({ items: usable, attempts, now })

  const fresh = scores.filter((score) => score.isNew)
    .sort((a, b) => Date.parse(b.item.vocabulary_entries.created_at) - Date.parse(a.item.vocabulary_entries.created_at) || a.item.entry_id.localeCompare(b.item.entry_id))
    .slice(0, NEW_TARGETS_PER_SESSION)
  const weak = scores.filter((score) => !score.isNew)
    .sort((a, b) => b.priority - a.priority || a.item.entry_id.localeCompare(b.item.entry_id))

  const practisedAt = new Map<string, number>()
  for (const attempt of attempts.flatMap(attemptOutcomes)) {
    const at = Date.parse(attempt.at)
    if (Number.isFinite(at) && at > (practisedAt.get(attempt.targetKey) ?? Number.NEGATIVE_INFINITY)) practisedAt.set(attempt.targetKey, at)
  }
  const context: PlanContext = {
    pool: usable.map((item) => ({ id: item.entry_id, danish: item.vocabulary_entries.danish, senses: itemSenses(item), sentence: item.vocabulary_entries.entry_kind === 'sentence' })),
    links: input.links || [],
    practisedAt,
    formsByEntry: input.formsByEntry || {},
    contextsBySense: input.contextsBySense || {},
    seed: input.seed,
  }

  const goal = input.targetMinutes * 60
  const order = interleave(fresh, weak)

  // Boards that span several saved words: matching, sorting by gender, odd one out, and the
  // prepared dialogues for saved headwords. Each is offered once at most and only when its
  // content is safe; a word that is still new is not put on a board it has never been shown in.
  const known = order.filter((score) => !score.isNew).map((score) => candidateFor(score, context)).filter((candidate): candidate is SenseCandidate => candidate !== null)
  const groups: PracticeTask[] = []
  let groupSeconds = 0
  for (const task of [
    matchTask(known, `${input.seed}:match`),
    sortTask(known, `${input.seed}:sort`),
    oddTask(known.slice().reverse(), `${input.seed}:odd`),
    ...dialogueTasks(known, input.locale, input.seed),
  ]) {
    if (!task || groupSeconds + queueSeconds([task]) > goal * GROUP_SHARE) continue
    groups.push(task)
    groupSeconds += queueSeconds([task])
  }

  const plans: PracticeTask[][] = []
  let seconds = groupSeconds
  let count = groups.length
  for (const score of order) {
    if (seconds >= goal || count >= MAX_QUEUE) break
    const tasks = exercisesFor(score, context).slice(0, MAX_QUEUE - count)
    if (!tasks.length) continue
    plans.push(tasks)
    seconds += queueSeconds(tasks)
    count += tasks.length
  }
  const firsts = plans.map((tasks) => tasks[0])
  // Second steps start from the middle of the order, so no item is served twice in a row.
  const offset = Math.ceil(plans.length / 2)
  const secondSteps = [...plans.slice(offset), ...plans.slice(0, offset)].flatMap((tasks) => tasks.slice(1))
  if (secondSteps.length > 1 && secondSteps[0].targetKey === firsts.at(-1)?.targetKey) secondSteps.push(secondSteps.shift()!)
  // Boards are spread through the session rather than bunched, after the first few words.
  const singles = [...firsts, ...secondSteps]
  const queue: PracticeTask[] = []
  const spacing = Math.max(2, Math.floor(singles.length / (groups.length + 1)))
  let nextGroup = 0
  singles.forEach((task, index) => {
    queue.push(task)
    if ((index + 1) % spacing === 0 && nextGroup < groups.length) queue.push(groups[nextGroup++])
  })
  queue.push(...groups.slice(nextGroup))

  return {
    version: 2, id: crypto.randomUUID(), seed: input.seed, targetMinutes: input.targetMinutes,
    contentRevision: PRACTICE_CONTENT_REVISION, locale: input.locale, createdAt: now.toISOString(),
    queue, attempts: [], completed: 0, elapsedSeconds: 0,
    activeSince: now.toISOString(), current: null, draft: null, finished: false,
  }
}
