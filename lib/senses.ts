import type { EntryKind, EntrySense, NounGender, PartOfSpeech, SenseCoverage } from './types'

export const PARTS_OF_SPEECH: readonly PartOfSpeech[] = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun',
  'preposition', 'conjunction', 'numeral', 'interjection', 'phrase',
]

export const NOUN_GENDERS: readonly NounGender[] = ['en', 'et']

export const PART_OF_SPEECH_LABELS: Record<PartOfSpeech, string> = {
  noun: 'noun',
  verb: 'verb',
  adjective: 'adj',
  adverb: 'adv',
  pronoun: 'pron',
  preposition: 'prep',
  conjunction: 'conj',
  numeral: 'num',
  interjection: 'interj',
  phrase: 'phrase',
}

/**
 * The separators a word/phrase translation may be split on. Sentence translations are
 * never split: `Jeg synes, det er svært.` is one meaning, not two.
 */
const SENSE_SEPARATORS = /[;,/]/

export function isPartOfSpeech(value: unknown): value is PartOfSpeech {
  return typeof value === 'string' && (PARTS_OF_SPEECH as readonly string[]).includes(value)
}

export function isNounGender(value: unknown): value is NounGender {
  return value === 'en' || value === 'et'
}

/**
 * Comparison key for a sense text. Step 3 re-matches regenerated senses to existing ones
 * with this so a regenerate keeps the sense id (and therefore its scheduling state).
 */
export function normalizeSenseText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('da-DK')
    .replace(/[.,!?;:"'()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
}

function newSenseId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `sense-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function emptyCoverage(): SenseCoverage {
  return { recognized: 0, produced: 0, last_seen: null }
}

export function createSense(text: string, patch: Partial<Omit<EntrySense, 'id'>> = {}): EntrySense {
  return {
    id: newSenseId(),
    text,
    pos: null,
    gender: null,
    note: null,
    example: null,
    example_translation: null,
    source: 'user',
    locked: false,
    coverage: emptyCoverage(),
    created_at: new Date().toISOString(),
    removed_at: null,
    ...patch,
  }
}

/**
 * TypeScript mirror of `private.senses_from_translation`. Word/phrase translations split on
 * `[;,/]`; sentence translations stay whole — comma-splitting a sentence destroys it.
 */
export function splitTranslationIntoSenses(translation: string | null | undefined, entryKind: EntryKind): EntrySense[] {
  const raw = (translation || '').trim()
  if (!raw) return []
  const parts = entryKind === 'word' ? raw.split(SENSE_SEPARATORS) : [raw]
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text) => createSense(text, { source: 'split' }))
}

function coverageFrom(value: unknown): SenseCoverage {
  if (typeof value !== 'object' || value === null) return emptyCoverage()
  const record = value as Record<string, unknown>
  const count = (input: unknown): number => (typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : 0)
  return {
    recognized: count(record.recognized),
    produced: count(record.produced),
    last_seen: typeof record.last_seen === 'string' ? record.last_seen : null,
  }
}

/** Tolerant reader for the `senses` jsonb column and for AI output. Drops anything unusable. */
export function parseSenses(value: unknown): EntrySense[] {
  if (!Array.isArray(value)) return []
  const senses: EntrySense[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (!text) continue
    const nullableText = (input: unknown): string | null => (typeof input === 'string' && input.trim() ? input.trim() : null)
    const pos = isPartOfSpeech(record.pos) ? record.pos : null
    senses.push({
      id: typeof record.id === 'string' && record.id ? record.id : newSenseId(),
      text,
      pos,
      gender: pos === 'noun' && isNounGender(record.gender) ? record.gender : null,
      note: nullableText(record.note),
      example: nullableText(record.example),
      example_translation: nullableText(record.example_translation),
      source: record.source === 'split' || record.source === 'ai' || record.source === 'cor' || record.source === 'user' ? record.source : 'ai',
      locked: record.locked === true,
      coverage: coverageFrom(record.coverage),
      created_at: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
      removed_at: typeof record.removed_at === 'string' ? record.removed_at : null,
    })
  }
  return senses
}

/**
 * The meanings a reader should teach, grade or show: not removed, not locked, not empty.
 *
 * Locked is filtered here rather than at every call site on purpose. `translation`, the review
 * answer, the definite form, the primary sense and practice all read through this one function,
 * and `private.translation_from_senses` applies the same rule in the database, so a locked meaning
 * cannot leak into grading from either side.
 */
export function activeSenses(senses: readonly EntrySense[] | null | undefined): EntrySense[] {
  return (senses || []).filter((sense) => !sense.removed_at && !sense.locked && sense.text.trim())
}

/** Meanings the entry carries but is not teaching yet. The editor offers these for unlocking. */
export function lockedSenses(senses: readonly EntrySense[] | null | undefined): EntrySense[] {
  return (senses || []).filter((sense) => !sense.removed_at && sense.locked && sense.text.trim())
}

/** TypeScript mirror of `private.translation_from_senses`. */
export function translationFromSenses(senses: readonly EntrySense[] | null | undefined): string {
  return activeSenses(senses).map((sense) => sense.text.trim()).join(', ')
}

/**
 * The gender an entry's meanings agree on, or null.
 *
 * An entry whose noun senses disagree — the `plan` case, genuinely `en` and `et` — has no single
 * definite form to show, and inventing one would teach the wrong half.
 */
export function nounGenderOf(senses: readonly EntrySense[] | null | undefined): NounGender | null {
  const genders = new Set<NounGender>()
  for (const sense of activeSenses(senses)) {
    if (sense.pos === 'noun' && sense.gender) genders.add(sense.gender)
  }
  return genders.size === 1 ? [...genders][0] : null
}

/** The primary sense is the first non-removed one; it owns the entry's example columns. */
export function primarySense(senses: readonly EntrySense[] | null | undefined): EntrySense | null {
  return activeSenses(senses)[0] || null
}

/**
 * The senses a reader should use for an entry. Falls back to splitting the legacy
 * `translation` string so rows written before the migration still behave.
 */
export function entrySenses(
  entry: { senses?: unknown; translation?: string | null; entry_kind?: EntryKind } | null | undefined,
): EntrySense[] {
  if (!entry) return []
  const parsed = activeSenses(parseSenses(entry.senses))
  if (parsed.length) return parsed
  return splitTranslationIntoSenses(entry.translation, entry.entry_kind === 'sentence' ? 'sentence' : 'word')
}
