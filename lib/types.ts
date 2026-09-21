export type TranslationLanguage = 'ru' | 'en' | 'uk'
export type LearningStatus = 'new' | 'learning' | 'mastered'
export type EntryKind = 'word' | 'sentence'
export type NotificationDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type NotificationSchedule = Record<NotificationDay, string | null>

export type PartOfSpeech =
  | 'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun'
  | 'preposition' | 'conjunction' | 'numeral' | 'interjection' | 'phrase'

export type NounGender = 'en' | 'et'

export interface SenseCoverage {
  recognized: number
  produced: number
  last_seen: string | null
}

/**
 * One meaning of an entry. Stored in `vocabulary_entries.senses`; the denormalized
 * `translation` column is derived from the non-removed texts by a DB trigger.
 *
 * `id` is app-generated and permanent: regeneration re-matches senses by normalized
 * text and keeps the id, so scheduling state attached to a sense survives an edit.
 */
export interface EntrySense {
  id: string
  text: string
  pos: PartOfSpeech | null
  gender: NounGender | null
  note: string | null
  /** null on the primary sense: it reads example_sentence / example_translation instead. */
  example: string | null
  example_translation: string | null
  /**
   * Who classified this meaning. `'split'` is phase 1's comma split, still unrefined; `'cor'`
   * is the word register, which is a recorded fact rather than an opinion; `'user'` is the
   * learner's own wording, which discovery and practice text deliberately ignore.
   */
  source: 'split' | 'ai' | 'cor' | 'user'
  /**
   * A meaning the entry carries but is not being taught yet (issue #6 §7).
   *
   * A word unlocked from the catalog arrives with every meaning it has, and only the one the
   * learner actually met is teachable. A locked meaning is stored, shown in the editor and
   * unlockable later, but it is not in `translation`, is never graded and never scheduled — a
   * one-tap add must not silently triple the review load.
   */
  locked: boolean
  coverage: SenseCoverage
  created_at: string
  removed_at: string | null
}

/** `inflection_of` is the only directional kind: a_id is the inflected form, b_id the base. */
export type EntryLinkKind = 'synonym' | 'antonym' | 'related' | 'inflection_of'

export type EntryLinkSource = 'ai' | 'user'

/**
 * One edge of the meaning graph, in `public.entry_links`. Symmetric kinds are stored once in
 * canonical order (`a_id < b_id`); use `canonicalLinkPair` in lib/synonyms.ts to build one.
 *
 * `confirmed` is the honesty flag: false means discovery proposed the edge and nobody has
 * accepted it yet, or a material edit to one end demoted it (D17). Unconfirmed edges may be
 * shown as dismissible chips but must never seed practice distractors.
 */
export interface EntryLink {
  user_id: string
  a_id: string
  b_id: string
  kind: EntryLinkKind
  source: EntryLinkSource
  confidence: number | null
  confirmed: boolean
  /** Set when the learner dismissed a suggestion. The row is a tombstone: never shown, graded or taught from. */
  dismissed_at: string | null
  created_at: string
}

export interface Profile {
  id: string
  email: string | null
  default_translation_language: TranslationLanguage
  danish_level: string
  daily_new_limit: number
  due_notifications_enabled: boolean
  word_challenge_notifications_enabled: boolean
  notification_timezone: string
  notification_schedule: NotificationSchedule
  autoplay_audio: boolean
  last_due_notification_at: string | null
  last_word_challenge_at: string | null
  created_at: string
}

export interface VocabularyEntry {
  id: string
  user_id: string
  danish: string
  pronunciation: string | null
  /** Private word-audio bucket object path, when DDO supplied a recording. */
  audio_path: string | null
  /** Denormalized join of the non-removed `senses` texts. Kept in sync by the DB trigger. */
  translation: string | null
  senses: EntrySense[]
  example_sentence: string | null
  example_translation: string | null
  icon_name: string | null
  /** The catalog row this entry was unlocked from, for provenance only (issue #6 §5). */
  catalog_lemma: string | null
  entry_kind: EntryKind
  learning_status: LearningStatus
  familiarity: number
  ai_enriched: boolean
  created_at: string
  updated_at: string
}

export interface ReviewCard {
  id: string
  user_id: string
  entry_id: string
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  state: number
  last_review: string | null
}

export interface ReviewItem extends ReviewCard {
  vocabulary_entries: VocabularyEntry
}
