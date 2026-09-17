import { parseSenseTargetKey } from './practice-senses'
import type { PracticeAttempt, PracticeStore } from './practice'
import type { ReviewItem } from './types'

/**
 * Which saved items a practice session is about, and how hard to make each one.
 *
 * Pure and offline. Two kinds of evidence are combined:
 *
 * - the FSRS state of the entry's review card and of its practice objectives: retrievability now,
 *   stability and lapses;
 * - the learner's recent practice answers on the entry, weighted by how much each exercise proves:
 *   a tapped option is worth less than a typed answer (Nakata 2016).
 *
 * The result is a mastery estimate in [0, 1] and a priority. The planner takes new items by the
 * daily budget and fills the rest of the session with the highest priority, i.e. the weakest.
 */

/** Exercise ladder rung: 0 new, 1 fragile, 2 building, 3 solid. */
export type TargetLevel = 0 | 1 | 2 | 3

export interface TargetScore {
  item: ReviewItem
  /** Never reviewed and never practised. */
  isNew: boolean
  mastery: number
  priority: number
  level: TargetLevel
  /** The review card or a practice objective is due now. */
  due: boolean
  /** The last graded practice answer on this entry was a miss. */
  lastMissed: boolean
}

const DAY_MS = 86_400_000
const RECENT_DAYS = 7

/** FSRS-5 forgetting curve. */
export function retrievability(stability: number, elapsedDays: number): number {
  if (!(stability > 0)) return 0
  return Math.pow(1 + (19 / 81) * Math.max(0, elapsedDays) / stability, -0.5)
}

const typedKinds = new Set(['recall', 'produce', 'cloze', 'build', 'dialogue', 'listen'])

function attemptEntryId(attempt: PracticeAttempt): string {
  return parseSenseTargetKey(attempt.targetKey)?.entryId || attempt.targetKey
}

export function scoreTargets(input: { items: readonly ReviewItem[]; store: PracticeStore; attempts: readonly PracticeAttempt[]; now: Date }): TargetScore[] {
  const now = input.now.getTime()
  const byEntry = new Map<string, PracticeAttempt[]>()
  for (const attempt of input.attempts) {
    if (attempt.rating === null || attempt.kind === 'teach') continue
    const id = attemptEntryId(attempt)
    const list = byEntry.get(id) || []
    list.push(attempt)
    byEntry.set(id, list)
  }
  const objectivesByEntry = new Map<string, PracticeStore['objectives'][string][]>()
  for (const [key, objective] of Object.entries(input.store.objectives)) {
    const id = parseSenseTargetKey(key)?.entryId || objective.task.entryId || key
    const list = objectivesByEntry.get(id) || []
    list.push(objective)
    objectivesByEntry.set(id, list)
  }

  return input.items.map((item) => {
    const entryId = item.entry_id
    const history = (byEntry.get(entryId) || []).slice(-12)
    const objectives = objectivesByEntry.get(entryId) || []
    const isNew = item.reps === 0 && history.length === 0 && objectives.length === 0

    let weighted = 0
    let succeeded = 0
    for (const attempt of history) {
      const weight = typedKinds.has(attempt.kind) ? 1 : 0.5
      weighted += weight
      if (attempt.rating !== 1 && (attempt.result === 'correct' || attempt.result === 'mostly' || attempt.result === 'ungraded')) succeeded += weight
    }
    const accuracy = (succeeded + 1) / (weighted + 2)
    const last = history.at(-1)
    const lastMissed = Boolean(last && (last.rating === 1 || last.result === 'incorrect'))

    const recall = item.reps > 0 && item.last_review
      ? retrievability(item.stability, (now - Date.parse(item.last_review)) / DAY_MS)
      : null
    const stability = Math.max(item.reps > 0 ? item.stability : 0, ...objectives.map((objective) => objective.card.stability || 0))
    const durability = Math.min(1, Math.log1p(stability) / Math.log1p(30))
    const lapses = Math.max(item.lapses, ...objectives.map((objective) => objective.card.lapses || 0))
    const due = (item.reps > 0 && Date.parse(item.due) <= now) || objectives.some((objective) => Date.parse(objective.card.due) <= now)

    const mastery = isNew ? 0 : Math.max(0, Math.min(1, (recall ?? 0.6) * accuracy * (0.35 + 0.65 * durability)))
    const recentlyAdded = now - Date.parse(item.vocabulary_entries.created_at) < RECENT_DAYS * DAY_MS
    const priority = (1 - mastery)
      + 0.12 * Math.min(lapses, 4)
      + (lastMissed ? 0.35 : 0)
      + (due ? 0.2 : 0)
      + (recentlyAdded && item.reps < 4 ? 0.25 : 0)

    const level: TargetLevel = isNew ? 0 : lastMissed || mastery < 0.3 ? 1 : mastery < 0.65 ? 2 : 3
    return { item, isNew, mastery, priority, level, due, lastMissed }
  })
}
