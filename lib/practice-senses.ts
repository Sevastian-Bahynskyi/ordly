import { activeSenses, parseSenses } from './senses'
import type { ProductionObjective } from './practice'
import type { EntrySense, ReviewItem } from './types'

/**
 * Sense-level objectives and the promotion gate (D8, D18).
 *
 * The entry keeps its recognition card in `review_cards`, untouched. A *meaning* is a separate
 * production target living in `practice_state.objectives` under `entry:<id>:sense:<sid>`.
 * `practice_attempts.target_key` is free-form text capped at 100 characters, and a key built
 * from two uuids is 85, so none of this needs a schema change.
 */

/** A sense is only worth producing once the entry itself is genuinely recognised (D18). */
export const SENSE_PROMOTION_MIN_REPS = 3

/**
 * How many senses one session may admit. The two-new-targets-per-day cap in `newTargetBudget`
 * still governs the whole pool; this only stops a learner with many multi-sense words from
 * spending the entire daily budget on senses and never meeting a new word.
 */
export const SENSE_PROMOTIONS_PER_SESSION = 1

/** The database check on `practice_attempts.target_key`. Mirrored so a bad key fails here. */
export const TARGET_KEY_MAX_LENGTH = 100

export function senseTargetKey(entryId: string, senseId: string): string {
  return `entry:${entryId}:sense:${senseId}`
}

export function parseSenseTargetKey(key: string): { entryId: string; senseId: string } | null {
  const match = /^entry:([^:]+):sense:(.+)$/.exec(key || '')
  if (!match || !match[1] || !match[2]) return null
  return { entryId: match[1], senseId: match[2] }
}

export function isSenseTargetKey(key: string): boolean {
  return parseSenseTargetKey(key) !== null
}

export interface SenseCandidate {
  item: ReviewItem
  entryId: string
  sense: EntrySense
  /** The first non-removed sense. It reads the entry's example columns rather than its own. */
  primary: boolean
  targetKey: string
}

/** The example a sense should be taught with: the entry's columns for the primary sense (D10). */
export function senseExample(item: ReviewItem, sense: EntrySense, primary: boolean): { sentence: string; translation: string } {
  const entry = item.vocabulary_entries
  const sentence = (primary ? entry.example_sentence : sense.example) || ''
  const translation = (primary ? entry.example_translation : sense.example_translation) || ''
  return { sentence: sentence.trim(), translation: translation.trim() }
}

/**
 * Every non-removed **stored** sense of an entry.
 *
 * Deliberately not `entrySenses`, which falls back to splitting the legacy `translation` string.
 * That fallback mints a fresh id on every call, and an objective keyed on an id that changes each
 * session would lose its FSRS state every time. A row with no stored senses simply has nothing
 * promotable yet — the migration and the sync trigger give every real row its senses.
 */
export function itemSenses(item: ReviewItem): EntrySense[] {
  return activeSenses(parseSenses(item.vocabulary_entries.senses))
}

function coldness(sense: EntrySense): number {
  const seen = sense.coverage?.last_seen
  if (!seen) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(seen)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

/**
 * Senses eligible for promotion, coldest first (D18).
 *
 * Three rules, in order:
 *
 * 1. **Eligibility** — the entry's recognition card must have `reps >= 3`. Producing a meaning
 *    of a word you have barely met is not practice, it is guessing.
 * 2. **The primary sense leads** — a secondary sense is only eligible once the primary one is
 *    already an objective, and across entries every eligible primary sense sorts ahead of every
 *    secondary one. An entry-keyed production objective left over from before this step counts
 *    as the primary sense's, so existing learners migrate without a data change.
 * 3. **Coldest coverage wins** — within each of those two groups, never-seen senses first, then
 *    oldest `coverage.last_seen`. Ties break on ids, so planning is deterministic.
 */
export function senseCandidates(items: readonly ReviewItem[], objectives: Record<string, ProductionObjective>): SenseCandidate[] {
  const candidates: SenseCandidate[] = []
  for (const item of items) {
    if (item.reps < SENSE_PROMOTION_MIN_REPS) continue
    const entryId = item.entry_id
    const senses = itemSenses(item)
    if (!senses.length) continue
    const primaryId = senses[0].id
    const primaryCovered = Boolean(objectives[senseTargetKey(entryId, primaryId)]) || Boolean(objectives[entryId])
    for (const sense of senses) {
      const primary = sense.id === primaryId
      if (!primary && !primaryCovered) continue
      const targetKey = senseTargetKey(entryId, sense.id)
      if (targetKey.length > TARGET_KEY_MAX_LENGTH) continue
      if (objectives[targetKey]) continue
      if (primary && Boolean(objectives[entryId])) continue
      candidates.push({ item, entryId, sense, primary, targetKey })
    }
  }
  return candidates.sort((a, b) =>
    Number(b.primary) - Number(a.primary)
    || coldness(a.sense) - coldness(b.sense)
    || a.entryId.localeCompare(b.entryId)
    || a.sense.id.localeCompare(b.sense.id))
}
