import type { SupabaseClient } from '@supabase/supabase-js'
import { PHRASE_GAP } from './catalog-phrases'
import { corLookupForm, parseCorForms } from './cor'
import { isTranslationLanguage } from './learner-language'
import { activeSenses, emptyCoverage, isNounGender, isPartOfSpeech, normalizeSenseText, parseSenses } from './senses'
import type { EntrySense, NounGender, PartOfSpeech, TranslationLanguage } from './types'

/**
 * Reading the pre-built catalog (issue #6 §7).
 *
 * Adding a word becomes a lookup: the learner types what they saw, the register resolves the form
 * to its lemma, and the catalog answers with a row that was built and validated offline. Nothing
 * is generated at that moment.
 *
 * Two things this deliberately does not do. It never *saves* — an unlock fills the composer and
 * the learner presses Save, so §7's "never mutate before confirmation" still holds. And it is
 * never read at review time: unlocking copies the data into the entry, so a later catalog change
 * cannot rewrite a word the learner has already been studying.
 */
/**
 * One meaning, in one learner language. The same `sense_id` has one row per language it is
 * supplied in (issue #14): the identity is shared, the wording is not.
 */
export interface CatalogSense {
  sense_id: string
  ordinal: number
  lang: TranslationLanguage
  text: string
  pos: PartOfSpeech | null
  gender: NounGender | null
  example: string | null
  example_translation: string | null
}

export interface CatalogEntry {
  lemma: string
  kind: 'word' | 'phrase'
  freq_rank: number | null
  pos: PartOfSpeech | null
  gender: NounGender | null
  definite_singular: string | null
  pronunciation: string | null
  audio_path: string | null
  example_sentence: string | null
  example_translation: string | null
  /** Meanings supplied in the learner language. */
  senses: CatalogSense[]
  /**
   * Meanings that exist but have no wording in the learner language yet. They are named so the
   * learner can be told, and are never shown in another language as a substitute.
   */
  missing: { sense_id: string; ordinal: number }[]
  forms: { form_key: string; form_text: string; gender: string }[]
}

/** Why a lookup found nothing. The learner is told which, because they mean different things. */
export type CatalogMiss = 'rare' | 'phrase' | 'unknown'

export interface CatalogLookup {
  candidates: CatalogEntry[]
  miss: CatalogMiss | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseCatalogSense(value: unknown): CatalogSense | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const senseId = text(record.sense_id)
  const body = text(record.text)
  const ordinal = typeof record.ordinal === 'number' && Number.isInteger(record.ordinal) ? record.ordinal : null
  // The column defaults to Russian, which every row written before issue #14 is.
  const lang = record.lang === undefined ? 'ru' : record.lang
  if (!senseId || !body || ordinal === null || !isTranslationLanguage(lang)) return null
  const pos = isPartOfSpeech(record.pos) ? record.pos : null
  return {
    sense_id: senseId,
    ordinal,
    lang,
    text: body,
    pos,
    gender: pos === 'noun' && isNounGender(record.gender) ? record.gender : null,
    example: text(record.example),
    example_translation: text(record.example_translation),
  }
}

/** One catalog row read for a learner language. Rows in other languages only mark what is missing. */
export function parseCatalogEntry(value: unknown, lang: TranslationLanguage): CatalogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const lemma = text(record.lemma)
  const kind = record.kind === 'word' || record.kind === 'phrase' ? record.kind : null
  if (!lemma || !kind) return null
  const rows = Array.isArray(record.word_catalog_sense)
    ? record.word_catalog_sense.map(parseCatalogSense).filter((sense): sense is CatalogSense => sense !== null)
    : []
  const senses = rows.filter((sense) => sense.lang === lang).sort((left, right) => left.ordinal - right.ordinal)
  const supplied = new Set(senses.map((sense) => sense.sense_id))
  const missing = [...new Map(rows.filter((sense) => !supplied.has(sense.sense_id)).map((sense) => [sense.sense_id, { sense_id: sense.sense_id, ordinal: sense.ordinal }])).values()]
    .sort((left, right) => left.ordinal - right.ordinal)
  if (!senses.length && !missing.length) return null
  const pos = isPartOfSpeech(record.pos) ? record.pos : null
  const forms = Array.isArray(record.word_catalog_form) ? record.word_catalog_form.flatMap((value): { form_key: string; form_text: string; gender: string }[] => {
    if (!value || typeof value !== 'object') return []
    const form = value as Record<string, unknown>
    return typeof form.form_key === 'string' && typeof form.form_text === 'string' ? [{ form_key: form.form_key, form_text: form.form_text, gender: typeof form.gender === 'string' ? form.gender : '' }] : []
  }) : []
  return {
    lemma,
    kind,
    freq_rank: typeof record.freq_rank === 'number' ? record.freq_rank : null,
    pos,
    gender: pos === 'noun' && isNounGender(record.gender) ? record.gender : null,
    definite_singular: text(record.definite_singular),
    pronunciation: text(record.pronunciation),
    audio_path: text(record.audio_path),
    example_sentence: text(record.example_sentence),
    example_translation: text(record.example_translation),
    senses,
    missing,
    forms,
  }
}

/**
 * The form the learner actually typed, and whether the headword's verified forms include it.
 * Only a verified form is claimed as belonging to the word; an unverified one is still shown as
 * what was typed, but the paradigm is never said to contain it (spec #12, decision 11).
 */
export function encounteredFormOf(entry: Pick<CatalogEntry, 'lemma' | 'forms'>, typed: string): { text: string; verified: boolean; isHeadword: boolean } {
  const form = catalogLookupText(typed) || typed.trim().toLocaleLowerCase('da-DK')
  const isHeadword = form === entry.lemma
  return { text: form, isHeadword, verified: isHeadword || entry.forms.some((candidate) => candidate.form_text.toLocaleLowerCase('da-DK') === form) }
}

/**
 * The lemmas a typed form could be, from the register.
 *
 * The typed form itself always counts — it may already be the dictionary form. COR adds whatever
 * else it inflects from, which is how `gulvet` finds `gulv` and `dovne` finds `doven` without
 * lemmatising anything. No part of speech filters here, because at lookup time nothing has been
 * chosen yet: 35% of forms are ambiguous, and `ved` genuinely resolves to two different words.
 * Both are offered and one tap decides — that is showing two facts, not guessing between them.
 */
export function candidateLemmas(typed: string, corRows: readonly { lemma: string }[]): string[] {
  const form = corLookupForm(typed)
  if (!form) return []
  return [...new Set([form, ...corRows.map((row) => row.lemma)])]
}

const ENTRY_COLUMNS = 'lemma, kind, freq_rank, pos, gender, definite_singular, pronunciation, audio_path,'
  + ' example_sentence, example_translation,'
  + ' word_catalog_sense(sense_id, ordinal, lang, text, pos, gender, example, example_translation),'
  + ' word_catalog_form(form_key, form_text, gender)'

/**
 * What the catalog holds for one typed text. Never throws: a catalog outage must fall through to
 * the live AI path, not stop the learner adding a word.
 */
/**
 * The text a lookup searches for. A single word goes through the register's normalisation; a
 * phrase is kept whole (lowercased, spaces collapsed), because `corLookupForm` deliberately
 * refuses anything with a space and a phrase must never be collapsed to one of its words.
 */
export function catalogLookupText(typed: string): string {
  const text = typed.normalize('NFC').trim().replace(/^[«»"'“”(\[]+|[«»"'“”)\].,!?;:…]+$/g, '').trim()
    // A split phrase is typed with a gap, as `…` or `...`: `står … op` is stored with one spaced ellipsis.
    .replace(/(?<=\p{L})\s*(?:\.{2,}|…)\s*(?=\p{L})/gu, ` ${PHRASE_GAP} `)
    .replace(/\s+/g, ' ').toLocaleLowerCase('da-DK')
  return /\s/u.test(text) ? (/\p{L}/u.test(text) ? text : '') : corLookupForm(text)
}

export async function lookupCatalog(client: SupabaseClient, typed: string, lang: TranslationLanguage): Promise<CatalogLookup> {
  const form = catalogLookupText(typed)
  if (!form) return { candidates: [], miss: null }
  const isPhrase = /\s/u.test(form)

  try {
    let lemmas = [form]
    let rows: unknown[]
    if (isPhrase) {
      // The headword and any recorded form (`stod op`, `står … op`) are asked at once; a form's
      // headword costs one more read only when the typed text is not a headword itself.
      const [byLemma, byForm] = await Promise.all([
        client.from('word_catalog').select(ENTRY_COLUMNS).eq('kind', 'phrase').in('lemma', lemmas),
        client.from('word_catalog_form').select('lemma').eq('kind', 'phrase').eq('form_text', form),
      ])
      rows = Array.isArray(byLemma.data) ? byLemma.data : []
      const heads = [...new Set((Array.isArray(byForm.data) ? byForm.data : []).map((row: { lemma?: unknown }) => row.lemma).filter((lemma): lemma is string => typeof lemma === 'string'))]
      if (!rows.length && heads.length) {
        lemmas = heads
        const { data } = await client.from('word_catalog').select(ENTRY_COLUMNS).eq('kind', 'phrase').in('lemma', heads)
        rows = Array.isArray(data) ? data : []
      }
    } else {
      const { data: cor } = await client.from('cor_form').select('form, lemma, tag').eq('form', form)
      lemmas = candidateLemmas(typed, parseCorForms(cor))
      const { data } = await client.from('word_catalog').select(ENTRY_COLUMNS).eq('kind', 'word').in('lemma', lemmas)
      rows = Array.isArray(data) ? data : []
    }

    const candidates = rows
      .map((row) => parseCatalogEntry(row, lang))
      .filter((entry): entry is CatalogEntry => entry !== null)
      // The typed form's own lemma first; after that, the more common word.
      .sort((left, right) => Number(right.lemma === form) - Number(left.lemma === form)
        || (left.freq_rank ?? Infinity) - (right.freq_rank ?? Infinity))

    if (candidates.length) return { candidates, miss: null }
    return { candidates: [], miss: isPhrase ? 'phrase' : lemmas.length > 1 ? 'rare' : 'unknown' }
  } catch {
    return { candidates: [], miss: null }
  }
}

export interface UnlockedDraft {
  danish: string
  pronunciation: string
  audio_path: string | null
  senses: EntrySense[]
  example_sentence: string
  example_translation: string
}

/**
 * The composer fields one catalog entry unlocks, with the picked meaning taught and the rest
 * locked (§7).
 *
 * The catalog's `sense_id` is carried through verbatim. That is not tidiness: practice objectives
 * are keyed `entry:<id>:sense:<sid>`, so minting a fresh id here would strand FSRS state the
 * first time the entry was edited (AGENTS.md §20).
 *
 * `source: 'cor'` marks a meaning whose grammar is a recorded fact rather than an opinion, which
 * is what keeps the sense-refinement queue from asking a model to re-classify it.
 */
export function unlockedDraft(entry: CatalogEntry, pickedSenseId: string | null): UnlockedDraft {
  // No meaning in the learner language: the headword, its pronunciation and its audio still
  // need no translation, so they are offered and the learner writes the meaning.
  const picked = pickedSenseId === null ? null : entry.senses.find((sense) => sense.sense_id === pickedSenseId) || entry.senses[0] || null
  const now = new Date().toISOString()
  const senses = picked ? entry.senses.map((sense): EntrySense => ({
    id: sense.sense_id,
    text: sense.text,
    pos: sense.pos,
    gender: sense.gender,
    note: null,
    example: sense.sense_id === picked.sense_id ? null : sense.example,
    example_translation: sense.sense_id === picked.sense_id ? null : sense.example_translation,
    source: sense.gender ? 'cor' : 'ai',
    locked: sense.sense_id !== picked.sense_id,
    coverage: emptyCoverage(),
    created_at: now,
    removed_at: null,
  })) : []
  // The primary sense owns the entry's example columns (D10), so the picked meaning's example
  // becomes the entry's and is not repeated on the sense itself. The entry-level example is
  // Russian-only data from before issue #14, so it is only a fallback for a Russian learner.
  const orderedSenses = [...senses].sort((left, right) => Number(left.locked) - Number(right.locked))
  const entryExample = picked?.lang === 'ru'
  return {
    danish: entry.lemma,
    pronunciation: entry.pronunciation || '',
    audio_path: entry.audio_path,
    senses: orderedSenses,
    example_sentence: picked?.example || (entryExample ? entry.example_sentence : null) || '',
    example_translation: picked?.example ? picked.example_translation || '' : (entryExample ? entry.example_translation : null) || '',
  }
}

/**
 * Add a meaning to a word that is already saved (spec #12, decision 11), rather than saving the
 * word a second time. With a picked catalog sense, a copy stored locked is unlocked in place and a
 * meaning the word lacks is appended with its catalog id. With no catalog sense (the learner wrote
 * their own meaning because none was supplied in their language), each new wording is appended.
 * Every existing meaning, its id and its coverage are left exactly as they are, and no new entry,
 * card or history is created.
 */
export function addCatalogMeaning(saved: readonly EntrySense[], draft: readonly EntrySense[], pickedSenseId: string | null): { status: 'added' | 'already-saved'; senses: EntrySense[] } {
  const current = [...saved]
  if (pickedSenseId === null) {
    const known = new Set(activeSenses(current).map((sense) => normalizeSenseText(sense.text)))
    const fresh = activeSenses(draft).filter((sense) => !known.has(normalizeSenseText(sense.text)))
    return fresh.length ? { status: 'added', senses: [...current, ...fresh] } : { status: 'already-saved', senses: current }
  }
  // A removed copy is restored rather than appended again: sense ids must stay unique (AGENTS §20).
  const existing = current.find((sense) => sense.id === pickedSenseId)
  if (existing && !existing.locked && !existing.removed_at) return { status: 'already-saved', senses: current }
  const incoming = draft.find((sense) => sense.id === pickedSenseId)
  // A locked copy was stored in whatever language the word was first saved in. It is unlocked with
  // the wording the learner just picked, so a Russian copy never becomes an English learner's
  // active meaning; its id and coverage stay.
  if (existing) return { status: 'added', senses: current.map((sense) => sense === existing ? { ...sense, ...(incoming ? { text: incoming.text, example: incoming.example, example_translation: incoming.example_translation } : {}), locked: false, removed_at: null } : sense) }
  if (!incoming) return { status: 'already-saved', senses: current }
  return { status: 'added', senses: [...current, { ...incoming, locked: false }] }
}

/** What the learner picked from the catalog: the headword, the meaning, and its verified spellings. */
export interface CatalogPick { lemma: string; senseId: string | null; forms: string[] }
export interface SavedCatalogWord { id: string; danish: string; updatedAt: string; senses: EntrySense[]; catalogLemma: string | null }

/**
 * The learner's saved word for a catalog pick: first one unlocked from the same catalog row, then
 * one saved as the headword, then one saved under any of its verified forms (a manual `gulvet`).
 * Two exact reads in parallel, owner-scoped by RLS; a failed read is reported, never treated as
 * "not saved", because that would create the second card this exists to prevent.
 */
export async function findSavedCatalogWord(supabase: SupabaseClient, pick: CatalogPick): Promise<SavedCatalogWord | null | 'error'> {
  const spellings = [...new Set([pick.lemma, ...pick.forms].map((form) => form.trim().toLocaleLowerCase('da-DK')).filter(Boolean))]
  const columns = 'id, danish, senses, updated_at, catalog_lemma'
  const [byCatalog, bySpelling] = await Promise.all([
    supabase.from('vocabulary_entries').select(columns).eq('entry_kind', 'word').eq('catalog_lemma', pick.lemma).order('created_at').limit(1),
    supabase.from('vocabulary_entries').select(columns).eq('entry_kind', 'word').in('danish', spellings).order('created_at').limit(10),
  ])
  if (byCatalog.error || bySpelling.error) return 'error'
  const bySpellingRows = [...(bySpelling.data || [])].sort((a, b) => Number(b.danish === pick.lemma) - Number(a.danish === pick.lemma))
  const row = [...(byCatalog.data || []), ...bySpellingRows][0]
  return row ? { id: row.id, danish: row.danish, updatedAt: row.updated_at, senses: parseSenses(row.senses), catalogLemma: row.catalog_lemma } : null
}

/** The saved word's meanings with the picked one added, from the draft as it is now. */
export function catalogMerge(saved: readonly EntrySense[], draft: { senses: readonly EntrySense[]; example_sentence: string; example_translation: string }, pick: CatalogPick): ReturnType<typeof addCatalogMeaning> {
  const incoming = draft.senses.map((sense) => sense.id === pick.senseId && !sense.example
    ? { ...sense, example: draft.example_sentence.trim() || null, example_translation: draft.example_translation.trim() || null }
    : sense)
  return addCatalogMeaning(saved, incoming, pick.senseId)
}
