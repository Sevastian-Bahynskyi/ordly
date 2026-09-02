export type TranslationLanguage = 'ru' | 'en' | 'uk'
export type LearningStatus = 'new' | 'learning' | 'mastered'
export type EntryKind = 'word' | 'sentence'

export interface Profile {
  id: string
  email: string | null
  default_translation_language: TranslationLanguage
  danish_level: string
  daily_new_limit: number
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
