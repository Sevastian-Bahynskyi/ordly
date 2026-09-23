import type { SupabaseClient } from '@supabase/supabase-js'
import { corLookupForm, parseCorForms } from './cor'
import { emptyCoverage, isNounGender, isPartOfSpeech } from './senses'
import type { EntrySense, NounGender, PartOfSpeech } from './types'

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
export interface CatalogSense {
  sense_id: string
  ordinal: number
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
  senses: CatalogSense[]
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
  if (!senseId || !body || ordinal === null) return null
  const pos = isPartOfSpeech(record.pos) ? record.pos : null
  return {
    sense_id: senseId,
    ordinal,
    text: body,
    pos,
    gender: pos === 'noun' && isNounGender(record.gender) ? record.gender : null,
    example: text(record.example),
    example_translation: text(record.example_translation),
  }
}

export function parseCatalogEntry(value: unknown): CatalogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const lemma = text(record.lemma)
  const kind = record.kind === 'word' || record.kind === 'phrase' ? record.kind : null
  if (!lemma || !kind) return null
  const senses = Array.isArray(record.word_catalog_sense)
    ? record.word_catalog_sense.map(parseCatalogSense).filter((sense): sense is CatalogSense => sense !== null)
      .sort((left, right) => left.ordinal - right.ordinal)
    : []
  if (!senses.length) return null
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
    forms,
  }
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
  + ' word_catalog_sense(sense_id, ordinal, text, pos, gender, example, example_translation),'
  + ' word_catalog_form(form_key, form_text, gender)'

/**
 * What the catalog holds for one typed text. Never throws: a catalog outage must fall through to
 * the live AI path, not stop the learner adding a word.
 */
export async function lookupCatalog(client: SupabaseClient, typed: string): Promise<CatalogLookup> {
  const form = corLookupForm(typed)
  if (!form) return { candidates: [], miss: null }
  const isPhrase = /\s/u.test(form)

  try {
    let lemmas = [form]
    if (!isPhrase) {
      const { data } = await client.from('cor_form').select('form, lemma, tag').eq('form', form)
      lemmas = candidateLemmas(typed, parseCorForms(data))
    }

    const { data } = await client
      .from('word_catalog')
      .select(ENTRY_COLUMNS)
      .eq('kind', isPhrase ? 'phrase' : 'word')
      .in('lemma', lemmas)
      .eq('word_catalog_sense.lang', 'ru')

    const candidates = (Array.isArray(data) ? data : [])
      .map(parseCatalogEntry)
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
export function unlockedDraft(entry: CatalogEntry, pickedSenseId: string): UnlockedDraft {
  const picked = entry.senses.find((sense) => sense.sense_id === pickedSenseId) || entry.senses[0]
  const now = new Date().toISOString()
  const senses = entry.senses.map((sense): EntrySense => ({
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
  }))
  // The primary sense owns the entry's example columns (D10), so the picked meaning's example
  // becomes the entry's and is not repeated on the sense itself.
  const orderedSenses = [...senses].sort((left, right) => Number(left.locked) - Number(right.locked))
  return {
    danish: entry.lemma,
    pronunciation: entry.pronunciation || '',
    audio_path: entry.audio_path,
    senses: orderedSenses,
    example_sentence: picked.example || entry.example_sentence || '',
    example_translation: picked.example_translation || entry.example_translation || '',
  }
}
