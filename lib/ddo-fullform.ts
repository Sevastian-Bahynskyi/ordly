/**
 * DSL's DDO full-form list (`ddo-fullforms_*.csv`, DSL Open licence): every inflected form DDO
 * records, tab-separated as form, lemma, homograph number, word class and DDO id.
 *
 * Used offline by the content pipeline (issue #16) as a second verified form source beside COR:
 * a sentence family may only put a form of its word into a sentence when a source lists it.
 * Word classes are DDO's Danish abbreviations; only the ones the catalog uses are mapped, and a
 * class that maps to nothing is kept out rather than guessed.
 */
const WORD_CLASSES: Record<string, string> = {
  'sb.': 'noun',
  'sb. pl.': 'noun',
  'vb.': 'verb',
  'adj.': 'adjective',
  'adv.': 'adverb',
  'pron.': 'pronoun',
  'præp.': 'preposition',
  'konj.': 'conjunction',
  'talord': 'numeral',
  'udråbsord': 'interjection',
  'artikel': 'pronoun',
}

export interface FullFormIndex {
  /** `lemma|pos` → every recorded form, lowercased. */
  forms: Map<string, Set<string>>
  /** Every recorded form of any word, lowercased: a word DDO knows is spelled correctly. */
  known: Set<string>
}

export function fullFormKey(lemma: string, pos: string): string {
  return `${lemma.toLocaleLowerCase('da-DK')}|${pos}`
}

export function parseFullForms(text: string): FullFormIndex {
  const forms = new Map<string, Set<string>>()
  const known = new Set<string>()
  for (const line of text.split(/\r?\n/u)) {
    const [form, lemma, , wordClass] = line.split('\t')
    if (!form || !lemma) continue
    const lower = form.toLocaleLowerCase('da-DK')
    known.add(lower)
    const pos = WORD_CLASSES[wordClass?.trim() || '']
    if (!pos) continue
    const key = fullFormKey(lemma, pos)
    const set = forms.get(key) || new Set<string>()
    set.add(lower)
    forms.set(key, set)
  }
  return { forms, known }
}

/** The verified forms of one reading of a word; the lemma itself always counts as one. */
export function formsOf(index: FullFormIndex, lemma: string, pos: string | null): string[] {
  const found = new Set<string>([lemma.toLocaleLowerCase('da-DK')])
  const readings = pos ? [pos] : [...new Set(Object.values(WORD_CLASSES))]
  for (const reading of readings) for (const form of index.forms.get(fullFormKey(lemma, reading)) || []) found.add(form)
  return [...found].sort()
}
