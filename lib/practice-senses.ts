import { activeSenses, parseSenses } from './senses'
import type { EntrySense, ReviewItem } from './types'

/**
 * Practice targets are senses of saved Material, keyed `entry:<id>:sense:<sid>` (D8, D18).
 * `practice_attempts.target_key` is free-form text capped at 100 characters, and a key built
 * from two uuids is 85.
 */

/** A secondary sense is only practised once the entry itself is genuinely recognised (D18). */
export const SENSE_PROMOTION_MIN_REPS = 3

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
 * That fallback mints a fresh id on every call, and a target keyed on an id that changes each
 * session would lose its practice history every time. A row with no stored senses simply has
 * nothing to practise yet — the migration and the sync trigger give every real row its senses.
 */
export function itemSenses(item: ReviewItem): EntrySense[] {
  return activeSenses(parseSenses(item.vocabulary_entries.senses))
}
