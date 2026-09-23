export const FORM_SECTIONS = {
  adjective: [
    ['positive', 'Positive'],
    ['comparative', 'Comparative'],
    ['superlative', 'Superlative'],
  ],
  verb: [
    ['infinitive', 'Infinitive'],
    ['present', 'Present'],
    ['past', 'Past'],
    ['past_participle', 'Past participle'],
    ['imperative', 'Imperative'],
  ],
  noun: [
    ['indefinite_singular', 'Singular'],
    ['definite_singular', 'Definite singular'],
    ['indefinite_plural', 'Plural'],
    ['definite_plural', 'Definite plural'],
  ],
} as const

export type FormPartOfSpeech = keyof typeof FORM_SECTIONS
export type WordFormKey = (typeof FORM_SECTIONS)[FormPartOfSpeech][number][0]

export interface WordForm {
  user_id: string
  entry_id: string
  form_key: WordFormKey
  form_text: string
  audio_path: string | null
  updated_at: string
}
