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
  source: 'cor' | 'user' | 'ddo'
  gloss: string | null
  updated_at: string
}

const priority: Partial<Record<WordFormKey, number>> = {
  present: 0, past: 1, past_participle: 2, infinitive: 3,
  comparative: 0, superlative: 1, positive: 2,
  definite_singular: 0, indefinite_plural: 1, definite_plural: 2, indefinite_singular: 3,
  pronoun_plural: 0, pronoun_neuter: 1, pronoun_common: 2,
}

export function formLabel(key: WordFormKey): string {
  for (const rows of Object.values(FORM_SECTIONS)) {
    const found = rows.find(([candidate]) => candidate === key)
    if (found) return found[1]
  }
  return key.replaceAll('_', ' ')
}

export function sortedForms(forms: readonly WordForm[]): WordForm[] {
  return [...forms].sort((a, b) => (priority[a.form_key] ?? 10) - (priority[b.form_key] ?? 10)
    || a.form_key.localeCompare(b.form_key) || a.form_text.localeCompare(b.form_text, 'da'))
}
