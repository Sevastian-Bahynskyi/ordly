import { parseSenseTargetKey } from './practice-senses'
import type { PracticeAttempt } from './practice'
import type { ReviewItem } from './types'

/**
 * Which saved items a practice session is about, and how hard to make each one.
 *
 * Pure and offline. Two kinds of evidence are combined, both read-only:
 *
 * - the entry's Review card: retrievability now, stability and lapses. Review history is an input
 *   to Practice selection, never an output of it (ADR 0002);
 * - the learner's recent practice attempts on the entry, weighted by how much each exercise
 *   proves: a tapped option is worth less than a typed answer (Nakata 2016).
 *
 * The result is a selection priority and a ladder rung. It is never shown as a score.
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
  /** The last practice attempt on this entry was a miss. */
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
  return attempt.entryId || parseSenseTargetKey(attempt.targetKey)?.entryId || attempt.targetKey
}

/** A miss, whichever contract recorded it: an old Again rating or a new failed or unknown answer. */
function attemptMissed(attempt: PracticeAttempt): boolean {
  return attempt.rating === 1 || attempt.result === 'incorrect' || attempt.result === 'dont_know'
}

export function scoreTargets(input: { items: readonly ReviewItem[]; attempts: readonly PracticeAttempt[]; now: Date }): TargetScore[] {
  const now = input.now.getTime()
  const byEntry = new Map<string, PracticeAttempt[]>()
  for (const attempt of input.attempts) {
    if (attempt.kind === 'teach') continue
    const id = attemptEntryId(attempt)
    const list = byEntry.get(id) || []
    list.push(attempt)
    byEntry.set(id, list)
  }

  return input.items.map((item) => {
    const history = (byEntry.get(item.entry_id) || []).slice(-12)
    const isNew = item.reps === 0 && history.length === 0

    let weighted = 0
    let succeeded = 0
    for (const attempt of history) {
      const weight = typedKinds.has(attempt.kind) ? 1 : 0.5
      weighted += weight
      if (!attemptMissed(attempt) && attempt.result !== 'unverified') succeeded += weight
    }
    const accuracy = (succeeded + 1) / (weighted + 2)
    const last = history.at(-1)
    const lastMissed = Boolean(last && attemptMissed(last))

    const recall = item.reps > 0 && item.last_review
      ? retrievability(item.stability, (now - Date.parse(item.last_review)) / DAY_MS)
      : null
    const stability = item.reps > 0 ? item.stability : 0
    const durability = Math.min(1, Math.log1p(stability) / Math.log1p(30))

    const mastery = isNew ? 0 : Math.max(0, Math.min(1, (recall ?? 0.6) * accuracy * (0.35 + 0.65 * durability)))
    const recentlyAdded = now - Date.parse(item.vocabulary_entries.created_at) < RECENT_DAYS * DAY_MS
    const priority = (1 - mastery)
      + 0.12 * Math.min(item.lapses, 4)
      + (lastMissed ? 0.35 : 0)
      + (recentlyAdded && item.reps < 4 ? 0.25 : 0)

    const level: TargetLevel = isNew ? 0 : lastMissed || mastery < 0.3 ? 1 : mastery < 0.65 ? 2 : 3
    return { item, isNew, mastery, priority, level, lastMissed }
  })
}
