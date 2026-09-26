import { createHash } from 'node:crypto'

/**
 * Word and phrase recordings synthesized with Azure Speech (issue #16).
 *
 * Every catalog headword, catalog phrase and saved word or phrase gets one recording, spoken by a
 * Danish neural voice. Sentences get none. The recordings replace the ones fetched from the DDO
 * website, which were moved to `word-audio/legacy/ddo/` in the same bucket.
 *
 * Keys are ASCII (storage refuses `words/adfærd.mp3`): a transliterated slug plus a digest of the
 * exact text, because transliteration alone puts `få` and `faa` on the same object. The `-azure`
 * suffix keeps them apart from the legacy DDO keys, so a switch never overwrites an object in place.
 */
export const SPEECH_VOICE = 'da-DK-ChristelNeural'
export const SPEECH_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

/** The text a recording is keyed and deduplicated by: NFC, trimmed, single-spaced, lowercase. */
export function speechText(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('da-DK')
}

/** `sentences/` holds sentence recordings (issue #27); every word and phrase is under `words/`. */
export function speechObjectKey(text: string, folder: 'words' | 'sentences' = 'words'): string {
  const key = speechText(text)
  const slug = key
    .replace(/æ/gu, 'ae')
    .replace(/ø/gu, 'oe')
    .replace(/å/gu, 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
    .replace(/-+$/u, '')
  const digest = createHash('sha1').update(key).digest('hex').slice(0, 8)
  return `${folder}/${slug || 'word'}-${digest}-azure.mp3`
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}

/** SSML for one word or phrase: the Danish voice, the configured rate, the text escaped. */
export function speechSsml(text: string, rate: string, voice = SPEECH_VOICE): string {
  const safeRate = /^[+-]?\d{1,3}%$/u.test(rate) ? rate : '0%'
  return `<speak version='1.0' xml:lang='da-DK'><voice name='${voice}'><prosody rate='${safeRate}'>${escapeXml(text.normalize('NFC').trim())}</prosody></voice></speak>`
}

/** Letters only, lowercase: `Rød grød.` and `rødgrød` compare equal. */
function letters(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('da-DK').replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * Whether speech recognition heard the text the recording was made from. Spacing, hyphens,
 * punctuation and case are ignored; anything else is a mismatch to look at (a homophone the
 * recogniser preferred, or a real mispronunciation).
 */
export function transcriptMatches(text: string, transcript: string | null): boolean {
  return transcript !== null && letters(text) === letters(transcript)
}
