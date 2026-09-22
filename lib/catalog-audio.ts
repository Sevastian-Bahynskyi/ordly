import type { PartOfSpeech } from './types'
import { isCompleteIpa } from './catalog-ipa'

/**
 * Driving the DDO audio downloader (issue #6 §6).
 *
 * `download_ddo_audio.py` in the repo root takes a `words.txt`, one term per line, and writes one
 * MP3 per term plus a JSON report. It is not modified here and not reimplemented: this module
 * only decides what goes into each `words.txt` and reads what came back.
 *
 * Batches exist because ten thousand lookups in one run is one long request against a public
 * dictionary with no API. Five hundred is small enough to stop between batches and large enough
 * that the per-run overhead disappears.
 */
export const AUDIO_BATCH_SIZE = 500

export interface AudioTerm {
  lemma: string
  /** Passed to the script as a `|pos` hint so a homograph resolves to the right article. */
  pos: PartOfSpeech | null
}

export type AudioOutcome = 'saved' | 'skipped' | 'failed'

export interface AudioResult {
  lemma: string
  outcome: AudioOutcome
  path: string | null
  /**
   * The transcription from the same DDO article the recording came from.
   *
   * Harvested here rather than fetched separately: the run is already on the page, and the
   * article was already matched by headword and part of speech. A bare search cannot be trusted
   * for this — `stadig` returns `stadigvæk` first, and reading its transcription would record a
   * different word's sounds. Null for a word whose file was skipped, because no page was fetched.
   */
  ipa: string | null
}

/** The script's own word-class vocabulary. Anything else is sent without a hint. */
const SCRIPT_PART_OF_SPEECH: Partial<Record<PartOfSpeech, string>> = {
  noun: 'noun',
  verb: 'verb',
  adjective: 'adjective',
  adverb: 'adverb',
  pronoun: 'pronoun',
  preposition: 'preposition',
  conjunction: 'conjunction',
  numeral: 'numeral',
  interjection: 'interjection',
}

export function audioTermLine(term: AudioTerm): string {
  const hint = term.pos ? SCRIPT_PART_OF_SPEECH[term.pos] : undefined
  return hint ? `${term.lemma}|${hint}` : term.lemma
}

/**
 * The batches to run, in order.
 *
 * Only words: a phrase has no DDO headword, so it has no audio and never enters a batch (§2 of
 * the issue). Callers are expected to have filtered already; this drops anything containing a
 * space as a second line of defence, because sending `godt lide` would waste a lookup and record
 * a failure that means nothing.
 */
export function audioBatches(terms: readonly AudioTerm[], size: number = AUDIO_BATCH_SIZE): AudioTerm[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Audio batch size must be a positive integer')
  const words = terms.filter((term) => term.lemma.trim() && !/\s/u.test(term.lemma.trim()))
  const batches: AudioTerm[][] = []
  for (let start = 0; start < words.length; start += size) batches.push(words.slice(start, start + size))
  return batches
}

export function wordsFileContents(batch: readonly AudioTerm[]): string {
  return batch.length ? `${batch.map(audioTermLine).join('\n')}\n` : ''
}

/**
 * What one report says happened, per lemma.
 *
 * A failure is recorded, never thrown: issue #6 §6 is explicit that a missing audio file does not
 * block a row. The word enters the catalog silent and the tap-to-hear button does not render,
 * which is a better outcome than losing a good row to a dictionary that had no recording.
 */
export function parseAudioReport(value: unknown): AudioResult[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const items = (value as Record<string, unknown>).items
  if (!Array.isArray(items)) return []
  const results: AudioResult[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const lemma = typeof record.word === 'string' ? record.word.trim().toLocaleLowerCase('da-DK') : ''
    if (!lemma) continue
    const ok = record.ok === true
    const status = typeof record.status === 'string' ? record.status : ''
    const path = typeof record.path === 'string' && record.path ? record.path : null
    const outcome: AudioOutcome = !ok || !path ? 'failed' : status === 'skipped' ? 'skipped' : 'saved'
    const ipa = isCompleteIpa(record.ipa) ? record.ipa.trim() : null
    results.push({ lemma, outcome, path: outcome === 'failed' ? null : path, ipa })
  }
  return results
}

/**
 * The transcriptions this run learned, merged onto what earlier runs learned.
 *
 * Merged rather than replaced because `--skip-existing` returns without fetching the page, so a
 * second run over the same words reports no transcription for them. Dropping the old value would
 * lose an IPA that was correctly collected the first time.
 */
export function mergeHarvestedIpa(
  existing: Readonly<Record<string, string>>,
  results: readonly AudioResult[],
): Record<string, string> {
  const merged: Record<string, string> = Object.fromEntries(
    Object.entries(existing).filter((entry): entry is [string, string] => isCompleteIpa(entry[1])),
  )
  for (const result of results) if (result.ipa) merged[result.lemma] = result.ipa
  return merged
}

/**
 * The object key a recording is stored under.
 *
 * Storage keys are ASCII, and Danish is not: `adfærd.mp3` is rejected outright. Transliterating
 * alone would collide — `få` and `faa` would land on the same object, and one word would quietly
 * play the other's recording — so the key carries a digest of the real lemma as well. The slug is
 * there only so a human reading the bucket can tell what they are looking at.
 */
export function audioObjectKey(lemma: string, digest: string): string {
  // The Danish letters are spelled out before the string is decomposed. Decomposing first turns
  // `å` into `a` plus a combining ring, and the rule for `å` then never matches: `gå` would slug
  // to `ga` rather than `gaa`.
  const slug = lemma
    .normalize('NFC')
    .toLocaleLowerCase('da-DK')
    .replace(/æ/gu, 'ae')
    .replace(/ø/gu, 'oe')
    .replace(/å/gu, 'aa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return `words/${slug || 'word'}-${digest.slice(0, 8)}.mp3`
}

export function audioSummary(results: readonly AudioResult[]): Record<AudioOutcome, number> {
  return {
    saved: results.filter((result) => result.outcome === 'saved').length,
    skipped: results.filter((result) => result.outcome === 'skipped').length,
    failed: results.filter((result) => result.outcome === 'failed').length,
  }
}
