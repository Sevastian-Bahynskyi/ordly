export type TranslationLanguage = 'ru' | 'en' | 'uk'
export type LearningStatus = 'new' | 'learning' | 'mastered'
export type EntryKind = 'word' | 'sentence'
export type NotificationDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type NotificationSchedule = Record<NotificationDay, string | null>

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
  translation: string | null
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
