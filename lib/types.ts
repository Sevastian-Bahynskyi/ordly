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
  source: 'split' | 'ai' | 'user'
  coverage: SenseCoverage
  created_at: string
  removed_at: string | null
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
  last_due_notification_at: string | null
  last_word_challenge_at: string | null
  created_at: string
}

export interface VocabularyEntry {
  id: string
  user_id: string
  danish: string
  pronunciation: string | null
  /** Denormalized join of the non-removed `senses` texts. Kept in sync by the DB trigger. */
  translation: string | null
  senses: EntrySense[]
  example_sentence: string | null
  example_translation: string | null
  icon_name: string | null
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
