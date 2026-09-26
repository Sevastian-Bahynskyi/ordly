import { countPhraseOccurrences } from './catalog-phrases'
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
