import { countPhraseOccurrences } from './catalog-phrases'
import { isReadableCyrillic } from './pronunciation'
import type { PartOfSpeech } from './types'
import { ukrainianProblems, ukrainianWordingProblems, type SpellCheckers } from './ukrainian'

/**
 * The deterministic gate for a generated catalog entry (issue #27): its meanings in Russian,
 * English and Ukrainian and one Danish example per meaning with its three translations. It runs
 * after the reviews, on what they let through; a sense with any problem is quarantined.
 */
export interface EntryWork {
  lemma: string
  kind: 'word' | 'phrase'
  pos: PartOfSpeech
  /** Verified forms; the example must use exactly one of them. */
  forms: string[]
}

/** A sense before its example is translated has no translations yet. */
export type DraftSense = Omit<EntrySense, 'example_en' | 'example_ru' | 'example_uk'> & Partial<Pick<EntrySense, 'example_en' | 'example_ru' | 'example_uk'>>

export interface EntrySense {
  ordinal: number
  ru: string
  en: string
  uk: string
  example: string
  example_en: string
  example_ru: string
  example_uk: string
}

export interface EntryGateChecks {
  spell: SpellCheckers
  /** False before the example is translated: the generator's own check, ahead of any paid translation. */
  translations?: boolean
  /** Words of a Danish sentence missing from the spelling sources; null when they are unavailable. */
  unknownWords: (sentence: string) => string[] | null
}

const CYRILLIC_ONLY = /^[\p{Script=Cyrillic}\s,;()'’.-]+$/u
const ENGLISH = /^[\p{Script=Latin}\s,;()'’/.-]+$/u
const DANISH_LETTERS = /[æøåÆØÅ]/u

function wordingKey(value: string): string {
  return value.toLocaleLowerCase('en').replace(/\s+/gu, ' ').trim()
}

/** Every problem of an entry's senses, one line each, prefixed with the sense. Empty means clean. */
export function entryProblems(entry: EntryWork, senses: readonly DraftSense[], checks: EntryGateChecks): string[] {
  const problems: string[] = []
  const seen = { ru: new Map<string, number>(), en: new Map<string, number>(), uk: new Map<string, number>() }
  for (const sense of senses) {
    const at = `${entry.lemma}#${sense.ordinal}`
    const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
    if (!CYRILLIC_ONLY.test(text(sense.ru))) problems.push(`${at}: ru wording must be Russian in Cyrillic`)
    if (!ENGLISH.test(text(sense.en)) || DANISH_LETTERS.test(sense.en) || /^at /u.test(text(sense.en))) problems.push(`${at}: en wording must be plain English`)
    for (const problem of ukrainianWordingProblems(text(sense.uk), entry.pos, checks.spell)) problems.push(`${at}: uk wording is not Ukrainian (${problem})`)
    for (const lang of ['ru', 'en', 'uk'] as const) {
      const key = wordingKey(text(sense[lang]))
      const other = seen[lang].get(key)
      if (key && other !== undefined) problems.push(`${at}: ${lang} wording is the same as sense ${other}`)
      seen[lang].set(key, sense.ordinal)
    }

    const example = text(sense.example)
    if (!/[.!?]$/u.test(example)) problems.push(`${at}: the example must end with . ! or ?`)
    const hits = countPhraseOccurrences(example, entry.forms)
    if (hits !== 1) problems.push(`${at}: the example must use exactly one verified form, once, as consecutive words (found ${hits})`)
    if (/\d/u.test(example)) problems.push(`${at}: no digits in the example`)
    const unknown = checks.unknownWords(example)
    if (unknown?.length) problems.push(`${at}: unknown word(s) in the example: ${unknown.join(', ')}`)
    if (checks.translations === false) continue
    for (const field of ['example_en', 'example_ru', 'example_uk'] as const) if (!text(sense[field])) problems.push(`${at}: ${field} is missing`)
    if (sense.example_en && DANISH_LETTERS.test(sense.example_en)) problems.push(`${at}: example_en contains Danish letters`)
    if (sense.example_ru && !/\p{Script=Cyrillic}/u.test(sense.example_ru)) problems.push(`${at}: example_ru is not Russian`)
    if (sense.example_uk?.trim()) for (const problem of ukrainianProblems(sense.example_uk, checks.spell)) problems.push(`${at}: example_uk is not Ukrainian (${problem})`)
  }
  return problems
}

/**
 * The deterministic half of a phrase pronunciation's check (issue #28); the reviews judge whether it
 * follows the IPA. Cyrillic letters only (AGENTS.md §22), one phrase stress as an acute accent, and
 * one written word for every word of the phrase, so no word is dropped or run together. With
 * `stressAt` (`phraseStressIndex`), the stress must sit on that word.
 */
export function pronunciationProblems(lemma: string, pronunciation: string, stressAt: number | null = null): string[] {
  const text = cleanPronunciation(pronunciation)
  if (!text) return ['the pronunciation is missing']
  if (!isReadableCyrillic(text)) return ['the pronunciation must be Cyrillic letters only']
  if (/['’ʼ]/u.test(text)) return ['the stress must be an acute accent (о́), not an apostrophe']
  const stresses = [...text.normalize('NFD')].filter((character) => character === '\u0301').length
  // Russian writes ё stressed and unmarked (нёд), so a word with ё carries its stress by itself.
  const stressed = (word: string): boolean => word.normalize('NFD').includes('\u0301') || /ё/u.test(word)
  if (!stresses && !/ё/u.test(text)) return ['the phrase stress is not marked']
  // A phrase is said as one unit with one main stress (`stå op` ≈ сдо о́б); its words' own stresses are gone.
  if (stresses > 1 && /\s/u.test(text)) return [`mark one phrase stress, not ${stresses}`]
  const words = text.split(/\s+/u)
  const tokens = lemma.trim().split(/\s+/u)
  if (words.length !== tokens.length) return [`the pronunciation has ${words.length} words, the phrase ${tokens.length}`]
  if (stressAt !== null && !(words[stressAt] && stressed(words[stressAt]))) return [`the stress belongs on "${tokens[stressAt]}"`]
  return []
}

/** A hint as stored: NFC, and without the IPA's stød, length and stress marks a model may copy over. */
export function cleanPronunciation(value: string): string {
  return value.normalize('NFC').replace(/[ˀːˈˌʔ]/gu, '').replace(/\s+/gu, ' ').trim()
}

const IPA_VOWEL = /[aeiouyæøåɔɛεɑʌəɐɒɶœʊɪʏɤɘ]/u
const CYRILLIC_VOWEL = /[аеёиоуыэюяіїє]/iu

/**
 * A hint with its one stress put where the phrase carries it (issue #28): every acute removed, then
 * one placed on word `stressAt`, on the syllable that word's IPA stresses (`teˈbæːjə` → second).
 * The model writes the sounds; where the stress goes is a rule (`phraseStressIndex`), not its call.
 */
export function placePhraseStress(hint: string, stressAt: number, ipa: string): string {
  const words = cleanPronunciation(hint).normalize('NFD').replace(/\u0301/gu, '').normalize('NFC').split(' ')
  const ipaWords = ipa.replace(/[[\]/]/gu, ' ').trim().split(/\s+/u)
  const target = words[stressAt]
  if (!target) return words.join(' ')
  // The stressed syllable: how many vowel groups come before the IPA's stress mark.
  const wordIpa = ipaWords.length === words.length ? ipaWords[stressAt] : ''
  // The main stress mark, or a secondary one when the transcription gives only that (`iˌmoðˀ`).
  const mark = wordIpa.includes('ˈ') ? wordIpa.indexOf('ˈ') : wordIpa.indexOf('ˌ')
  let syllable = 0
  if (mark > 0) {
    let inVowel = false
    for (const character of wordIpa.slice(0, mark)) {
      const vowel = IPA_VOWEL.test(character)
      if (vowel && !inVowel) syllable += 1
      inVowel = vowel || (inVowel && /[ːˀ\u0303\u0329\u032F]/u.test(character))
    }
  }
  const letters = [...target]
  const groups: number[] = []
  // A doubled vowel is one long vowel (вээ); two different vowels are two syllables (фоэльсгэд).
  letters.forEach((letter, index) => { if (CYRILLIC_VOWEL.test(letter) && letter.toLowerCase() !== (letters[index - 1] ?? '').toLowerCase()) groups.push(index) })
  if (!groups.length) return words.join(' ')
  const at = groups[Math.min(syllable, groups.length - 1)]
  letters.splice(at + 1, 0, '\u0301')
  words[stressAt] = letters.join('').normalize('NFC')
  return words.join(' ')
}
