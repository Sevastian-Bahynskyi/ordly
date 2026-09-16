import { currentTaskContentVersion, entryContentVersion, frameTasks, selectFrame, vocabularyTask } from './practice-content'
import { newTargetBudget, practiceStudyDate, type PracticeAttempt, type PracticeSessionState, type PracticeStore, type PracticeTask } from './practice'
import { CLOZE_DISTRACTOR_COUNT, selectDistractors, senseExerciseTask, WORD_BANK_DISTRACTOR_COUNT, type DistractorEntry } from './practice-exercises'
import { itemSenses, parseSenseTargetKey, senseCandidates, SENSE_PROMOTIONS_PER_SESSION, type SenseCandidate } from './practice-senses'
import { synonymNeighbourIds, type SynonymLinkRow } from './synonyms'
import type { EntrySense, ReviewItem, TranslationLanguage } from './types'

/** Enough wrong options for the widest board (a cloze) plus the word bank's spare tiles. */
const DISTRACTOR_POOL_SIZE = CLOZE_DISTRACTOR_COUNT + WORD_BANK_DISTRACTOR_COUNT

/**
 * Wrong options for one sense, drawn from the learner's own vocabulary (D6).
 *
 * The synonym graph is read twice, both times **confirmed only**. Direct confirmed synonyms are
 * excluded: dropped into a gap they may genuinely be right, and offering a right answer as a
 * wrong one is exactly the bug this redesign set out to kill. Their own neighbours — the same
 * semantic field, one hop further out — are preferred instead, which is what makes a distractor
 * worth thinking about rather than dismissing on sight.
 */
function distractorsFor(input: {
  item: ReviewItem; sense: EntrySense; pool: readonly DistractorEntry[]; links: readonly SynonymLinkRow[]; seed: string
}): string[] {
  const entryId = input.item.entry_id
  const direct = synonymNeighbourIds(entryId, input.links, { confirmedOnly: true })
  const secondHop = direct.flatMap((id) => synonymNeighbourIds(id, input.links, { confirmedOnly: true }))
  const exclude = new Set([entryId, ...direct.map((id) => id.toLowerCase())])
  return selectDistractors({
    answer: input.item.vocabulary_entries.danish,
    pos: input.sense.pos,
    pool: input.pool,
    preferIds: secondHop.filter((id) => !exclude.has(id.toLowerCase())),
    excludeIds: [...exclude],
    count: DISTRACTOR_POOL_SIZE,
    seed: input.seed,
  })
}

function exerciseFor(input: {
  candidate: SenseCandidate; pool: readonly DistractorEntry[]; links: readonly SynonymLinkRow[]; reps: number; newTarget: boolean
}): PracticeTask {
  const { candidate } = input
  return senseExerciseTask({
    candidate,
    senses: itemSenses(candidate.item),
    distractors: distractorsFor({ item: candidate.item, sense: candidate.sense, pool: input.pool, links: input.links, seed: `${candidate.targetKey}:${input.reps}` }),
    reps: input.reps,
    newTarget: input.newTarget,
  })
}

/** Rebuild a `SenseCandidate` for an objective that already exists, so its exercise can rotate. */
function candidateForObjective(targetKey: string, items: readonly ReviewItem[]): SenseCandidate | null {
  const parsed = parseSenseTargetKey(targetKey)
  if (!parsed) return null
  const item = items.find((candidate) => candidate.entry_id === parsed.entryId)
  if (!item) return null
  const senses = itemSenses(item)
  const index = senses.findIndex((sense) => sense.id === parsed.senseId)
  if (index < 0) return null
  return { item, entryId: parsed.entryId, sense: senses[index], primary: index === 0, targetKey }
}

export function planPractice(input: {
  items: ReviewItem[]; store: PracticeStore; attempts: PracticeAttempt[]; introducedToday: number;
  dailyLimit: number; language: TranslationLanguage; aiEnabled: boolean; now: Date;
  /** `entry_links` rows for this learner. Only `synonym` edges are read, and only confirmed ones. */
  links?: readonly SynonymLinkRow[];
}): PracticeSessionState {
  const { items, store, attempts, now } = input
  const links = input.links || []
  const known = items.filter((item) => item.reps > 0 && item.vocabulary_entries.translation)
  const due = known.filter((item) => Date.parse(item.due) <= now.getTime())
  const recent = attempts.filter((a) => a.assistance === 'none' && a.result !== 'ungraded' && a.objective !== null && a.kind !== 'teach').slice(-20).map((a) => a.result !== 'incorrect' && a.rating !== 1)
  let budget = newTargetBudget({ dailyLimit: input.dailyLimit, introducedToday: input.introducedToday, dueCount: due.length, recent })
  const pool: DistractorEntry[] = known.map((item) => ({ id: item.entry_id, danish: item.vocabulary_entries.danish, senses: itemSenses(item) }))
  const production = Object.values(store.objectives).filter((objective) => Date.parse(objective.card.due) <= now.getTime())
    .filter((objective) => !objective.task.entryId || known.some((item) => item.entry_id === objective.task.entryId && currentTaskContentVersion(item.vocabulary_entries, objective.task) === objective.task.contentVersion))
    .sort((a, b) => Date.parse(a.card.due) - Date.parse(b.card.due)).slice(0, 3)
  // A due sense objective gets a freshly built board rather than its stored one, so the exercise
  // rotates with its reps instead of serving the same tiles forever.
  const dueTasks = production.map((objective) => {
    const candidate = candidateForObjective(objective.task.targetKey, known)
    if (!candidate) return { ...objective.task, newTarget: false, retry: 0, stage: 'remember' as const }
    return exerciseFor({ candidate, pool, links, reps: objective.card.reps, newTarget: false })
  })
  const diagnostics = attempts.length === 0 ? known.filter((item) => !production.some((objective) => objective.task.targetKey === item.entry_id)).slice(0, 3).map((item) => vocabularyTask(item, 'production')) : []
  const used = new Set([...production.map((objective) => objective.task.targetKey), ...diagnostics.map((task) => task.targetKey)])
  const queue: PracticeTask[] = due.filter((item) => !used.has(item.entry_id)).slice(0, due.length > 16 ? 10 : 6).map((item) => vocabularyTask(item, 'meaning'))
  queue.splice(Math.min(2, queue.length), 0, ...dueTasks)
  queue.unshift(...diagnostics)
  const day = Math.floor(now.getTime() / 86400000)
  const frame = selectFrame(attempts, budget > 0, day)
  if (frame?.introduction) budget -= 1
  // Promotion (D18). Newly admitted senses share the two-new-targets-per-day cap with frames and
  // new words; the per-session limit stops a learner with many meanings from ever meeting a new
  // word. The sense itself has no objective yet, so its first board starts the rotation at reps 0.
  const promotions: SenseCandidate[] = budget > 0
    ? senseCandidates(known, store.objectives).filter((candidate) => !used.has(candidate.targetKey)).slice(0, Math.min(SENSE_PROMOTIONS_PER_SESSION, budget))
    : []
  for (const candidate of promotions) {
    budget -= 1
    used.add(candidate.targetKey)
    queue.push(exerciseFor({ candidate, pool, links, reps: 0, newTarget: true }))
  }
  for (const item of items.filter((item) => item.reps === 0 && item.vocabulary_entries.translation).slice(0, budget)) {
    const task = vocabularyTask(item, 'meaning')
    queue.push({ ...task, id: `${task.id}:teach`, kind: 'teach', stage: 'learn' })
    queue.push({ ...task, newTarget: false, stage: 'return' })
  }
  if (frame) {
    const tasks = frameTasks(frame.frame, input.language, frame.introduction, day)
    // Scheduled production above already tested this frame without first exposing it.
    queue.push(...tasks.filter((task) => task.kind !== 'produce' || (!used.has(task.targetKey)
      && (!store.objectives[task.targetKey] || Date.parse(store.objectives[task.targetKey].card.due) <= now.getTime()))))
  }
  const active = known.find((item) => !used.has(item.entry_id) && (!store.objectives[item.entry_id] || store.objectives[item.entry_id].task.contentVersion !== entryContentVersion(item.vocabulary_entries)))
  if (active && !diagnostics.length) queue.push({ ...vocabularyTask(active, 'production'), stage: 'return', newTarget: false })
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
