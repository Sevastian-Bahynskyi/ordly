import type { PartOfSpeech } from './types'

/**
 * IPA for the catalog, read from the Wiktionary extract rather than scraped per word.
 *
 * Issue #6 §3 says the Cyrillic hint must be a reading of a real IPA and never of Danish
 * spelling. That needs an IPA for ten thousand lemmas, and the obvious route — one DDO page per
 * word — is thirty thousand requests against a dictionary that has no API and no obligation to
 * serve us. The kaikki.org Wiktionary extract is the same phonetic data as one 95 MB JSONL file:
 * downloaded once, joined offline, no rate limit, no scraping, and it carries the part of speech
 * so a homograph can be matched rather than guessed.
 *
 * DDO stays the audio source (§6). It is better at audio and this is better at IPA; neither is
 * asked to do the other's job.
 *
 * Source: https://kaikki.org/dictionary/Danish/kaikki.org-dictionary-Danish.jsonl
 * Wiktionary content is CC BY-SA; only IPA strings are used, and the catalog records
 * `ipa_source: 'wiktionary'` on every row that came from here.
 */
export interface WiktionaryIpa {
  word: string
  /** Null when Wiktionary's word class has no Ordly equivalent; such a row can still supply IPA. */
  pos: PartOfSpeech | null
  ipa: string
}

export type CatalogIpaSelection = {
  ipa: string | null
  source: 'ddo' | 'wiktionary' | null
}

const COMPONENT_BOUNDARY = /^[-‐‑‒–—]|[-‐‑‒–—]$/u

/** DDO sometimes prints only a compound prefix or suffix, marked by a boundary dash. */
export function isCompleteIpa(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const ipa = value.trim()
  if (!ipa) return false
  const delimited = (ipa.startsWith('[') && ipa.endsWith(']'))
    || (ipa.startsWith('/') && ipa.endsWith('/'))
  const transcription = delimited ? ipa.slice(1, -1).trim() : ipa
  return Boolean(transcription) && !COMPONENT_BOUNDARY.test(transcription)
}

/** Wiktionary's word classes, mapped onto Ordly's. Anything unlisted is deliberately null. */
const KAIKKI_PARTS_OF_SPEECH: Record<string, PartOfSpeech> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  num: 'numeral',
  intj: 'interjection',
  phrase: 'phrase',
  prep_phrase: 'phrase',
  proverb: 'phrase',
}

export function kaikkiPartOfSpeech(value: unknown): PartOfSpeech | null {
  return typeof value === 'string' ? KAIKKI_PARTS_OF_SPEECH[value] || null : null
}

/**
 * The most useful IPA in one Wiktionary `sounds` array, or null.
 *
 * A Danish entry usually carries both a phonemic `/ɡraːtis/` and a phonetic `[ˈɡ̊ʁɑːd̥is]`. The
 * phonetic one is chosen because it is the one that records what is actually said — stød, soft d,
 * the reductions that make `selvfølgelig` sound like `сэфёли`. Reading the phonemic form aloud
 * reproduces the spelling-based pronunciation AGENTS.md §8 exists to forbid.
 */
export function chooseIpa(sounds: unknown): string | null {
  if (!Array.isArray(sounds)) return null
  let phonemic: string | null = null
  for (const sound of sounds) {
    if (!sound || typeof sound !== 'object') continue
    const value = (sound as Record<string, unknown>).ipa
    if (!isCompleteIpa(value)) continue
    const ipa = value.trim()
    if (ipa.startsWith('[')) return ipa
    if (!phonemic) phonemic = ipa
  }
  return phonemic
}

/** One extract line, or null for a line that carries no usable pronunciation. */
export function parseKaikkiLine(line: string): WiktionaryIpa | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.lang_code !== undefined && record.lang_code !== 'da') return null
  const word = typeof record.word === 'string' ? record.word.trim() : ''
  if (!word) return null
  const ipa = chooseIpa(record.sounds)
  if (!ipa) return null
  return { word, pos: kaikkiPartOfSpeech(record.pos), ipa }
}

/**
 * The IPA to use for one lemma in one part of speech.
 *
 * The part of speech filters first, for the same reason it filters before COR is asked a gender
 * (§22): `ved` is two words, and the noun's pronunciation is not the verb's. A candidate whose
 * word class Wiktionary did not give us is usable only when nothing better matched, and when the
 * surviving candidates disagree the answer is null — silence beats a confident wrong reading.
 */
export function selectIpaForPos(
  candidates: readonly WiktionaryIpa[],
  pos: PartOfSpeech | null,
): string | null {
  if (!candidates.length) return null
  const matching = pos ? candidates.filter((candidate) => candidate.pos === pos) : []
  const pool = matching.length ? matching : candidates.filter((candidate) => candidate.pos === null)
  const usable = pool.length ? pool : pos ? [] : candidates
  const distinct = [...new Set(usable.map((candidate) => candidate.ipa).filter(isCompleteIpa))]
  return distinct.length === 1 ? distinct[0] : null
}

export function selectCatalogIpa(
  ddoIpa: unknown,
  wiktionaryCandidates: readonly WiktionaryIpa[],
  pos: PartOfSpeech | null,
): CatalogIpaSelection {
  if (isCompleteIpa(ddoIpa)) return { ipa: ddoIpa.trim(), source: 'ddo' }
  const wiktionaryIpa = selectIpaForPos(wiktionaryCandidates, pos)
  return wiktionaryIpa
    ? { ipa: wiktionaryIpa, source: 'wiktionary' }
    : { ipa: null, source: null }
}
