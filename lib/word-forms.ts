export const FORM_SECTIONS = {
  adjective: [
    ['positive', 'Common gender'],
    ['neuter', 'Neuter'],
    ['plural', 'Plural'],
    ['definite', 'Definite'],
    ['comparative', 'Comparative'],
    ['superlative', 'Superlative'],
    ['superlative_definite', 'Definite superlative'],
  ],
  verb: [
    ['infinitive', 'Infinitive'],
    ['present', 'Present'],
    ['past', 'Past'],
    ['past_participle', 'Past participle'],
    ['present_participle', 'Present participle'],
    ['imperative', 'Imperative'],
  ],
  noun: [
    ['indefinite_singular', 'Singular'],
    ['definite_singular', 'Definite singular'],
    ['indefinite_plural', 'Plural'],
    ['definite_plural', 'Definite plural'],
  ],
  pronoun: [
    ['pronoun_common', 'Common gender'],
    ['pronoun_neuter', 'Neuter'],
    ['pronoun_plural', 'Plural'],
    ['pronoun_subject', 'Subject'],
    ['pronoun_object', 'Object'],
  ],
} as const

export type FormPartOfSpeech = keyof typeof FORM_SECTIONS
export type WordFormKey = (typeof FORM_SECTIONS)[FormPartOfSpeech][number][0]

export interface WordForm {
  user_id: string
  entry_id: string
  form_key: WordFormKey
  form_text: string
  gender: '' | 'en' | 'et'
  source: 'cor' | 'user'
  audio_path: string | null
  updated_at: string
}
