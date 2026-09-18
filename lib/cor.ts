import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntrySense, NounGender, PartOfSpeech } from './types'

/**
 * COR — Det Centrale Ordregister — as Ordly reads it (issue #5 §1).
 *
 * `en` or `et` is a recorded fact, published CC0 by the people who define Danish orthography.
 * This module is the only place that knows COR's tag format; everything else asks it questions.
 *
 * The one rule that makes it safe: **a bare form lookup silently writes wrong data.** 35% of
 * forms are part-of-speech ambiguous — `ved` is "knows" and also the noun *wood*, `tage` is "to
 * take" and also *roofs* — so candidates are filtered by the sense's own part of speech before
 * anything is read off them, and a gender is returned only when the survivors agree. When they
 * do not, or when there is no part of speech to filter with, the answer is null. Silence is
 * correct; a wrong `en`/`et` is worse than none.
 *
 * The measurements behind all of this are in docs/free-data-sources.md.
 */

export interface CorForm {
  /** The inflected form, lowercased — the lookup key. */
  form: string
  lemma: string
  /** COR's grammatical tag, e.g. `sb.itk.sg.ubest`. */
  tag: string
}

/**
 * COR's word-class prefixes, mapped onto Ordly's parts of speech.
 *
 * `adj.adv` is the adverbial form of an adjective (`hurtigt`) and answers to either label,
 * because a learner may reasonably have classified such a sense as one or the other. Classes
 * Ordly has no name for — abbreviations, prefixes, suffixes, the infinitive marker — map to
 * nothing, so they can never match a sense and never contribute a gender.
 */
const TAG_PARTS_OF_SPEECH: Record<string, readonly PartOfSpeech[]> = {
  sb: ['noun'],
  prop: ['noun'],
  vb: ['verb'],
  adj: ['adjective'],
  adv: ['adverb'],
  pron: ['pronoun'],
  præp: ['preposition'],
  konj: ['conjunction'],
  talord: ['numeral'],
  romertal: ['numeral'],
  udråbsord: ['interjection'],
  lydord: ['interjection'],
  flerord: ['phrase'],
  iflerord: ['phrase'],
}

/** The parts of speech a COR tag answers to. Empty for classes Ordly does not model. */
export function corPartsOfSpeech(tag: string): PartOfSpeech[] {
  const parts = tag.split('.')
  const mapped = TAG_PARTS_OF_SPEECH[parts[0]] || []
  if (parts[0] === 'adj' && parts.includes('adv')) return ['adjective', 'adverb']
  return [...mapped]
}

/** The article of a noun tag's singular: `sb.fk.*` is `en`, `sb.itk.*` is `et`. */
export function corGenderFromTag(tag: string): NounGender | null {
  const parts = tag.split('.')
  if (parts[0] !== 'sb') return null
  if (parts.includes('fk')) return 'en'
  if (parts.includes('itk')) return 'et'
  return null
}

/**
 * The single lowercase word to look up, or `''` when there is none.
 *
 * COR holds no multi-word expressions — 0 of the vocabulary's 9 phrases matched — so a phrase or
 * a sentence has nothing to look up and must never be judged against the register.
 */
export function corLookupForm(danish: string): string {
  const word = danish
    .normalize('NFC')
    .trim()
    .replace(/^[«»"'“”(\[]+|[«»"'“”)\].,!?;:]+$/g, '')
    .trim()
    .toLocaleLowerCase('da-DK')
  if (!word || /\s/.test(word)) return ''
  return /\p{L}/u.test(word) ? word : ''
}

/** True when the register knows this form at all. The `tinker` check (§2). */
export function isKnownDanishForm(rows: readonly CorForm[]): boolean {
  return rows.length > 0
}

/**
 * The part of speech COR settles on its own, or null when it takes a model to decide.
 *
 * Every candidate must agree. `håndklæde` is only ever a noun; `bil` collides with the
 * imperative of `bile` and goes to the model, as do the other 36% the research measured.
 */
export function corPartOfSpeech(rows: readonly CorForm[]): PartOfSpeech | null {
  const found = new Set<PartOfSpeech>()
  for (const row of rows) {
    const parts = corPartsOfSpeech(row.tag)
    // A tag Ordly has no name for still counts as a disagreeing reading: `fork` alongside a noun
    // means the form is not unambiguously that noun.
    if (!parts.length) return null
    parts.forEach((part) => found.add(part))
  }
  return found.size === 1 ? [...found][0] : null
}

/**
 * The gender COR records for this form *in the given part of speech*, or null.
 *
 * This is the guard. Without a part of speech there is nothing to filter with, so the answer is
 * null rather than whatever the first noun candidate happened to say.
 */
export function corGenderForPos(rows: readonly CorForm[], pos: PartOfSpeech | null): NounGender | null {
  if (pos !== 'noun') return null
  const genders = new Set<NounGender>()
  for (const row of rows) {
    if (!corPartsOfSpeech(row.tag).includes('noun')) continue
    const gender = corGenderFromTag(row.tag)
    if (gender) genders.add(gender)
  }
  return genders.size === 1 ? [...genders][0] : null
}

/**
 * Fill in the gender of every live noun sense that has none.
 *
 * A gender already on the sense stands: the learner can set one by hand with the `en`/`et` chips
 * and nothing here may overrule that. Returns the same array when there is nothing to write, so
 * a caller can cheaply tell whether COR had anything to say.
 */
export function fillCorGender(senses: EntrySense[], rows: readonly CorForm[]): EntrySense[] {
  const gender = corGenderForPos(rows, 'noun')
  if (!gender) return senses
  const needsGender = (sense: EntrySense): boolean => !sense.removed_at && sense.pos === 'noun' && sense.gender === null
  if (!senses.some(needsGender)) return senses
  return senses.map((sense) => (needsGender(sense) ? { ...sense, gender } : sense))
}

/** Tolerant reader for the query result: a row missing any of the three fields is dropped. */
export function parseCorForms(value: unknown): CorForm[] {
  if (!Array.isArray(value)) return []
  const rows: CorForm[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.form !== 'string' || typeof record.lemma !== 'string' || typeof record.tag !== 'string') continue
    rows.push({ form: record.form, lemma: record.lemma, tag: record.tag })
  }
  return rows
}

/**
 * The register's rows for one Danish text, or `[]` for anything COR cannot hold.
 *
 * One indexed lookup on the primary key's leading column. The same call works from the server and
 * from the browser — the table is reference data every signed-in session may read. Never throws:
 * COR is an improvement on guessing, and a database hiccup must not stop a learner saving a word.
 */
export async function fetchCorForms(client: SupabaseClient, danish: string): Promise<CorForm[]> {
  const form = corLookupForm(danish)
  if (!form) return []
  try {
    const { data } = await client.from('cor_form').select('form, lemma, tag').eq('form', form)
    return parseCorForms(data)
  } catch {
    return []
  }
}
