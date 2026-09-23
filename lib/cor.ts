import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntrySense, NounGender, PartOfSpeech } from './types'
import type { WordFormKey } from './word-forms'

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

/** Lemmas per definite-form query. Each one rides in the request URL. */
const DEFINITE_FORM_CHUNK = 150

export interface CorForm {
  /** The inflected form, lowercased — the lookup key. */
  form: string
  lemma: string
  /** COR's grammatical tag, e.g. `sb.itk.sg.ubest`. */
  tag: string
}

export interface CorParadigmForm {
  form_key: WordFormKey
  form_text: string
  gender: '' | NounGender
}

/** Map only recorded, teachable inflections. Variant spellings remain separate rows. */
export function corParadigm(rows: readonly CorForm[], posHints: readonly PartOfSpeech[], genderHints: readonly NounGender[] = []): CorParadigmForm[] {
  if (!posHints.length) {
    const settled = corPartOfSpeech(rows)
    if (!settled) return []
    posHints = [settled]
  }
  const result = new Map<string, CorParadigmForm>()
  for (const row of rows) {
    if (posHints.length && !corPartsOfSpeech(row.tag).some((part) => posHints.includes(part))) continue
    const tag = row.tag
    let key: WordFormKey | null = null
    let gender: '' | NounGender = ''
    if (tag.startsWith('sb.')) {
      gender = corGenderFromTag(tag) || ''
      if (genderHints.length && !genderHints.includes(gender as NounGender)) continue
      if (/\.sg\.ubest$/.test(tag)) key = 'indefinite_singular'
      else if (/\.sg\.best$/.test(tag)) key = 'definite_singular'
      else if (/\.pl\.ubest$/.test(tag)) key = 'indefinite_plural'
      else if (/\.pl\.best$/.test(tag)) key = 'definite_plural'
    } else if (tag === 'vb.inf.akt') key = 'infinitive'
    else if (tag === 'vb.præs.akt') key = 'present'
    else if (tag === 'vb.præt.akt') key = 'past'
    else if (tag === 'vb.perf.part') key = 'past_participle'
    else if (tag === 'vb.præs.part') key = 'present_participle'
    else if (tag === 'vb.imp') key = 'imperative'
    else if (tag === 'adj.sg.ubest.fk') key = 'positive'
    else if (tag === 'adj.sg.ubest.itk') key = 'neuter'
    else if (tag === 'adj.pl') key = 'plural'
    else if (tag === 'adj.sg.best') key = 'definite'
    else if (tag === 'adj.kompar') key = 'comparative'
    else if (tag === 'adj.superl.sg.ubest') key = 'superlative'
    else if (tag === 'adj.superl.sg.best') key = 'superlative_definite'
    else if (tag === 'pron.sg.fk') key = 'pronoun_common'
    else if (tag === 'pron.sg.itk') key = 'pronoun_neuter'
    else if (tag === 'pron.pl') key = 'pronoun_plural'
    else if (tag === 'pron.nom') key = 'pronoun_subject'
    else if (tag === 'pron.obl') key = 'pronoun_object'
    if (!key) continue
    const form: CorParadigmForm = { form_key: key, form_text: row.form, gender }
    result.set(`${key}:${row.form}:${gender}`, form)
  }
  return [...result.values()]
}

/** Fill recorded forms for a newly saved word outside the pre-built catalog. */
export async function syncCorParadigm(client: SupabaseClient, entryId: string, danish: string, senses: readonly EntrySense[]): Promise<void> {
  const lemma = corLookupForm(danish)
  if (!lemma) return
  const hints = [...new Set(senses.filter((sense) => !sense.removed_at).map((sense) => sense.pos).filter((part): part is PartOfSpeech => part !== null))]
  const genders = [...new Set(senses.filter((sense) => !sense.removed_at && sense.pos === 'noun').map((sense) => sense.gender).filter((gender): gender is NounGender => gender !== null))]
  const { data } = await client.from('cor_form').select('form, lemma, tag').eq('lemma', lemma)
  const rows = parseCorForms(data).filter((row) => row.lemma === lemma)
  const forms = corParadigm(rows, hints, genders)
  if (forms.length) await client.from('word_forms').upsert(forms.map((form) => ({ ...form, entry_id: entryId, source: 'cor' })), { onConflict: 'entry_id,form_key,form_text,gender', ignoreDuplicates: true })
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
 * The word the dictionary lists for this form, or null when there is nothing to propose.
 *
 * **The part of speech filters first, and then the question is asked of that reading only.** The
 * two halves of that sentence are what `dovne` and `alt` each prove: `dovne` is the plural
 * adjective of `doven` *and* the infinitive of a verb meaning "to laze", so the card's own word
 * class is the only thing that says which one is being inflected. Ask without filtering and the
 * verb reading protects the adjective card from ever being corrected.
 *
 * Null covers four "leave it alone" cases, and they all matter:
 *
 * - the register does not know the form at all — that is the spell check's business, not this one;
 * - the form is itself a lemma in the reading the card is about (`hus`, `synes` — a deponent verb
 *   that is its own infinitive), so it is already the dictionary word;
 * - the surviving candidates disagree, which for `ved` means the card is really two words —
 *   "knows" and the preposition "by" — and only the learner can split it;
 * - the lemma is multi-word (`nogensinde` -> `nogen sinde`), which is a spelling variant rather
 *   than an inflection, and COR cannot look the result up again afterwards.
 */
export function corBaseForm(rows: readonly CorForm[], form: string, posHints: readonly PartOfSpeech[]): string | null {
  if (!rows.length) return null
  const matching = posHints.length
    ? rows.filter((row) => corPartsOfSpeech(row.tag).some((part) => posHints.includes(part)))
    : rows
  const readings = matching.length ? matching : rows
  if (readings.some((row) => row.lemma === form)) return null

  const lemmas = [...new Set(readings.map((row) => row.lemma))]
  if (lemmas.length !== 1 || /\s/.test(lemmas[0])) return null
  return lemmas[0]
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

/**
 * The definite singular of a noun, split into what to read and the article that carries the
 * gender: `gulvet` -> `gulv` + `et`, `skulderen` -> `skulder` + `en`.
 *
 * Danish glues the article onto the end of the word, so this is the form that actually teaches
 * the gender — `et` printed next to `gulv` is a label, `gulvet` is the word. Returns null when
 * the form does not end in its own article, which some of COR's irregulars do not.
 */
export function splitDefiniteForm(definite: string, gender: NounGender): { stem: string; article: string } | null {
  if (!definite.endsWith(gender) || definite.length <= gender.length) return null
  return { stem: definite.slice(0, -gender.length), article: gender }
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

/**
 * The key a definite form is stored and looked up under.
 *
 * Keyed by gender as well as lemma, because a word that is both genders has two of them and they
 * mean different things: `en plan` is a plan and becomes `planen`, `et plan` is a level and
 * becomes `planet`. Keyed by lemma alone, whichever row arrived last would win.
 */
export function definiteFormKey(lemma: string, gender: NounGender): string {
  return `${corLookupForm(lemma)}:${gender}`
}

/**
 * The definite singular of each lemma: `gulv` -> `gulvet`, `menneske` -> `mennesket`. One query
 * for a whole page's nouns, and read from the register rather than built by appending an article,
 * because `skulder` -> `skulderen` and `menneske` -> `mennesket` are not the same rule.
 */
export async function fetchCorDefiniteForms(client: SupabaseClient, lemmas: readonly string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(lemmas.map((lemma) => corLookupForm(lemma)).filter(Boolean))]
  const definite = new Map<string, string>()
  if (!wanted.length) return definite
  try {
    // Chunked because every lemma goes into the request URL: one page of a large vocabulary
    // would otherwise build a GET long enough for a proxy to refuse it.
    for (let start = 0; start < wanted.length; start += DEFINITE_FORM_CHUNK) {
      const { data } = await client
        .from('cor_form')
        .select('form, lemma, tag')
        .in('lemma', wanted.slice(start, start + DEFINITE_FORM_CHUNK))
        .in('tag', ['sb.fk.sg.best', 'sb.itk.sg.best'])
      for (const row of parseCorForms(data)) {
        const gender = corGenderFromTag(row.tag)
        if (gender) definite.set(definiteFormKey(row.lemma, gender), row.form)
      }
    }
    return definite
  } catch {
    return definite
  }
}
