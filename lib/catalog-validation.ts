import { parseCatalogFact, type CatalogFact, type CatalogGeneratedRow } from './catalog-contract'
import { findInSentence } from './practice-exercises'
import { isReadableCyrillic } from './pronunciation'
import { isNounGender, isPartOfSpeech } from './senses'
import type { PartOfSpeech } from './types'

export const CATALOG_MIN_CLEAN_RATE = 0.95

/**
 * Source-backed checks intentionally injected here. Issue #6 §9 must not reimplement COR parsing
 * or spelling. `null` means the source check could not run and therefore fails closed.
 */
export interface CatalogValidationSources {
  corLemmaHasPartOfSpeech(lemma: string, pos: PartOfSpeech): boolean | null | Promise<boolean | null>
  findMisspellings(text: string): string[] | null | Promise<string[] | null>
  /**
   * Whether any word in the sentence is a register-recorded form of the lemma.
   *
   * Optional, and consulted only when the deterministic matcher has already said no. That matcher
   * cannot see through a stem change, so it rejects `Hun kan svømme` as an example of `kunne`,
   * `Vi går i skole` for `gå`, and `Hun vandt løbet` for `vinde` — which is every irregular verb,
   * and therefore most of the commonest words in the language. COR holds those forms, so it can
   * answer what a string comparison cannot. Returning null means the check could not run.
   */
  exampleContainsLemma?(example: string, lemma: string): boolean | null | Promise<boolean | null>
}

export type CatalogFailureCode =
  | 'batch_length_mismatch'
  | 'row_not_object'
  | 'unexpected_fields'
  | 'lemma_mismatch'
  | 'kind_mismatch'
  | 'pronunciation_invalid_script'
  | 'pronunciation_without_ipa'
  | 'senses_invalid'
  | 'sense_invalid_fields'
  | 'sense_ordinal_invalid'
  | 'sense_text_invalid'
  | 'sense_pos_invalid'
  | 'sense_pos_changed'
  | 'sense_gender_invalid'
  | 'sense_gender_not_from_facts'
  | 'cor_check_unavailable'
  | 'lemma_not_in_cor_for_pos'
  | 'example_missing_lemma'
  | 'spelling_check_unavailable'
  | 'example_misspelled'
  | 'example_translation_empty'

export interface CatalogValidationFailure {
  code: CatalogFailureCode
  message: string
  sense_ordinal?: number
}

export interface CatalogRowValidation {
  index: number
  lemma: string
  clean: boolean
  failures: CatalogValidationFailure[]
}

export interface CatalogBatchValidation {
  clean_count: number
  total_count: number
  clean_rate: number
  stop: boolean
  rows: CatalogRowValidation[]
  extra_rows: number[]
}

const ROW_FIELDS = new Set(['lemma', 'kind', 'pronunciation', 'senses'])
const SENSE_FIELDS = new Set(['ordinal', 'text', 'pos', 'gender', 'example', 'example_translation'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyFields(record: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
  return Object.keys(record).every((key) => fields.has(key)) && recordKeysEqual(record, fields)
}

function recordKeysEqual(record: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
  if (Object.keys(record).length !== fields.size) return false
  for (const field of fields) if (!(field in record)) return false
  return true
}

function fail(
  failures: CatalogValidationFailure[],
  code: CatalogFailureCode,
  message: string,
  senseOrdinal?: number,
): void {
  failures.push({ code, message, ...(senseOrdinal === undefined ? {} : { sense_ordinal: senseOrdinal }) })
}

/** Strict shape check used after JSON.parse, before any semantic source checks. */
export function isGeneratedCatalogRow(value: unknown): value is CatalogGeneratedRow {
  if (!isRecord(value) || !hasOnlyFields(value, ROW_FIELDS)) return false
  if (typeof value.lemma !== 'string' || (value.kind !== 'word' && value.kind !== 'phrase')) return false
  if (value.pronunciation !== null && typeof value.pronunciation !== 'string') return false
  if (!Array.isArray(value.senses) || value.senses.length < 1 || value.senses.length > 3) return false
  return value.senses.every((sense) => isRecord(sense)
    && hasOnlyFields(sense, SENSE_FIELDS)
    && typeof sense.ordinal === 'number' && Number.isInteger(sense.ordinal)
    && typeof sense.text === 'string'
    && isPartOfSpeech(sense.pos)
    && (sense.gender === null || isNounGender(sense.gender))
    && typeof sense.example === 'string'
    && typeof sense.example_translation === 'string')
}

async function sourceResult<T>(call: () => T | Promise<T>): Promise<T | null> {
  try {
    return await call()
  } catch {
    return null
  }
}

export async function validateCatalogBatch(
  factsInput: readonly CatalogFact[],
  generated: readonly unknown[],
  sources: CatalogValidationSources,
): Promise<CatalogBatchValidation> {
  const facts: CatalogFact[] = []
  for (const fact of factsInput) {
    const parsed = parseCatalogFact(fact)
    if (!parsed) throw new Error(`Invalid catalog fact for ${String((fact as { lemma?: unknown }).lemma || 'unknown lemma')}`)
    facts.push(parsed)
  }

  const lengthMismatch = generated.length !== facts.length
  const corCache = new Map<string, Promise<boolean | null>>()
  const spellingCache = new Map<string, Promise<string[] | null>>()
  const rows: CatalogRowValidation[] = []

  for (let index = 0; index < facts.length; index += 1) {
    const fact = facts[index]
    const value = generated[index]
    const failures: CatalogValidationFailure[] = []
    if (lengthMismatch) fail(failures, 'batch_length_mismatch', `Expected ${facts.length} rows, received ${generated.length}.`)

    if (!isRecord(value)) {
      fail(failures, 'row_not_object', 'Output row is missing or is not an object.')
      rows.push({ index, lemma: fact.lemma, clean: false, failures })
      continue
    }
    if (!hasOnlyFields(value, ROW_FIELDS)) fail(failures, 'unexpected_fields', 'Row fields do not exactly match the generator contract.')
    if (value.lemma !== fact.lemma) fail(failures, 'lemma_mismatch', `Expected lemma ${JSON.stringify(fact.lemma)} at index ${index}.`)
    if (value.kind !== fact.kind) fail(failures, 'kind_mismatch', `Expected kind ${fact.kind}.`)

    const pronunciation = value.pronunciation
    if (pronunciation !== null && typeof pronunciation !== 'string') {
      fail(failures, 'pronunciation_invalid_script', 'Pronunciation must be Cyrillic text or null.')
    } else if (typeof pronunciation === 'string' && !isReadableCyrillic(pronunciation)) {
      fail(failures, 'pronunciation_invalid_script', 'Pronunciation contains a non-Cyrillic letter or no readable Cyrillic letters.')
    }
    if (pronunciation !== null && pronunciation !== undefined && fact.ipa === null) {
      fail(failures, 'pronunciation_without_ipa', 'Pronunciation was supplied even though the source IPA is null.')
    }

    if (!Array.isArray(value.senses) || value.senses.length < 1 || value.senses.length > 3) {
      fail(failures, 'senses_invalid', 'A row must contain between 1 and 3 senses.')
      rows.push({ index, lemma: fact.lemma, clean: false, failures })
      continue
    }

    for (let senseIndex = 0; senseIndex < value.senses.length; senseIndex += 1) {
      const rawSense = value.senses[senseIndex]
      const expectedOrdinal = senseIndex + 1
      if (!isRecord(rawSense) || !hasOnlyFields(rawSense, SENSE_FIELDS)) {
        fail(failures, 'sense_invalid_fields', 'Sense fields do not exactly match the generator contract.', expectedOrdinal)
        continue
      }
      const ordinal = typeof rawSense.ordinal === 'number' && Number.isInteger(rawSense.ordinal) ? rawSense.ordinal : null
      if (ordinal !== expectedOrdinal) {
        fail(failures, 'sense_ordinal_invalid', `Expected contiguous ordinal ${expectedOrdinal}.`, expectedOrdinal)
      }

      const text = typeof rawSense.text === 'string' ? rawSense.text.trim() : ''
      if (!text || !isReadableCyrillic(text)) {
        fail(failures, 'sense_text_invalid', 'Sense text must be non-empty Cyrillic text with no Latin/Greek letters.', expectedOrdinal)
      }

      const pos = isPartOfSpeech(rawSense.pos) ? rawSense.pos : null
      if (!pos) {
        fail(failures, 'sense_pos_invalid', 'Sense part of speech is missing or invalid.', expectedOrdinal)
      }

      const gender = rawSense.gender === null ? null : isNounGender(rawSense.gender) ? rawSense.gender : undefined
      if (gender === undefined) {
        fail(failures, 'sense_gender_invalid', 'Gender must be en, et, or null.', expectedOrdinal)
      } else if (gender !== null && (pos !== 'noun' || fact.gender === null || gender !== fact.gender)) {
        fail(failures, 'sense_gender_not_from_facts', 'Non-null gender is allowed only for a noun when the source facts supplied that exact gender.', expectedOrdinal)
      }

      if (fact.kind === 'word' && pos) {
        const key = `${fact.lemma}\u0000${pos}`
        let check = corCache.get(key)
        if (!check) {
          check = sourceResult(() => sources.corLemmaHasPartOfSpeech(fact.lemma, pos))
          corCache.set(key, check)
        }
        const exists = await check
        // A word can genuinely be two word classes — `dansk` is an adjective and a noun, `hvis`
        // is a conjunction and a possessive, `for` is a preposition, an adverb and a conjunction —
        // so a sense that departs from the facts' part of speech is not wrong by itself. The
        // register decides: it may depart only where COR also lists the lemma in that class,
        // which still leaves no room to invent one. A check that could not run decides nothing.
        if (exists === null) {
          fail(failures, 'cor_check_unavailable', 'COR lemma/part-of-speech check did not run.', expectedOrdinal)
        } else if (!exists) {
          if (fact.pos !== null && pos !== fact.pos) {
            fail(failures, 'sense_pos_changed', `Sense changed source part of speech from ${fact.pos} to ${pos}, and COR does not list ${JSON.stringify(fact.lemma)} as a ${pos}.`, expectedOrdinal)
          } else {
            fail(failures, 'lemma_not_in_cor_for_pos', `COR does not contain ${JSON.stringify(fact.lemma)} as a lemma in part of speech ${pos}.`, expectedOrdinal)
          }
        }
      } else if (pos && fact.pos !== null && pos !== fact.pos) {
        // A phrase has no register to appeal to, so the facts' part of speech stands.
        fail(failures, 'sense_pos_changed', `Sense changed source part of speech from ${fact.pos} to ${pos}.`, expectedOrdinal)
      }

      const example = typeof rawSense.example === 'string' ? rawSense.example.trim() : ''
      if (!example) {
        fail(failures, 'example_missing_lemma', 'Example is empty.', expectedOrdinal)
      } else if (!findInSentence(example, fact.lemma)) {
        // The cheap matcher said no. Before believing it, ask the register, which knows that
        // `kan` is a form of `kunne`. Silence from the register leaves the matcher's answer.
        const viaRegister = sources.exampleContainsLemma
          ? await sourceResult(() => sources.exampleContainsLemma?.(example, fact.lemma) ?? null)
          : false
        if (viaRegister !== true) {
          fail(failures, 'example_missing_lemma', 'Example does not contain a form of the lemma, by the matcher or by the register.', expectedOrdinal)
        }
      }
      if (example) {
        let spelling = spellingCache.get(example)
        if (!spelling) {
          spelling = sourceResult(() => sources.findMisspellings(example))
          spellingCache.set(example, spelling)
        }
        const misspellings = await spelling
        if (misspellings === null) {
          fail(failures, 'spelling_check_unavailable', 'Spelling check did not run; null is not a clean result.', expectedOrdinal)
        } else if (misspellings.length) {
          fail(failures, 'example_misspelled', `Example contains misspelling(s): ${misspellings.join(', ')}.`, expectedOrdinal)
        }
      }

      if (typeof rawSense.example_translation !== 'string' || !rawSense.example_translation.trim()) {
        fail(failures, 'example_translation_empty', 'Example translation must be non-empty.', expectedOrdinal)
      }
    }

    rows.push({ index, lemma: fact.lemma, clean: failures.length === 0, failures })
  }

  const cleanCount = rows.filter((row) => row.clean).length
  const totalCount = facts.length
  const cleanRate = totalCount ? cleanCount / totalCount : 0
  return {
    clean_count: cleanCount,
    total_count: totalCount,
    clean_rate: cleanRate,
    stop: cleanRate < CATALOG_MIN_CLEAN_RATE,
    rows,
    extra_rows: generated.length > facts.length
      ? Array.from({ length: generated.length - facts.length }, (_, offset) => facts.length + offset)
      : [],
  }
}
