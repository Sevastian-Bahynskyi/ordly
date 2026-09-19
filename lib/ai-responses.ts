import type { Misspelling } from './danish-text'
import { parseSenses } from './senses'
import type { EntrySense, PartOfSpeech } from './types'

/**
 * Typed readers for the app's own JSON routes. A response body is untrusted input like any other
 * (the route may be an older deployment, a proxy error page, or a partial result), so the client
 * reads it as `unknown` and narrows field by field instead of indexing into `any`.
 */

type JsonRecord = Record<string, unknown>

/** The body as a plain object, or an empty one when it is not JSON or not an object. */
export async function readJsonRecord(response: Response): Promise<JsonRecord> {
  try {
    const body: unknown = await response.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as JsonRecord : {}
  } catch {
    return {}
  }
}

export function stringField(body: JsonRecord, key: string): string | null {
  const value = body[key]
  return typeof value === 'string' ? value : null
}

/** The route's own user-facing `error` line, or the caller's generic fallback. */
export function errorMessage(body: JsonRecord, fallback: string): string {
  const message = stringField(body, 'error')
  return message && message.trim() ? message : fallback
}

/** The fields `/api/ai/enrich` can fill. `translation` is the flat join of `senses`. */
export type EnrichField = 'pronunciation' | 'translation' | 'example_sentence' | 'example_translation'

/** The `/api/ai/enrich` response contract, shared by the route and its callers. */
export interface EnrichResult {
  pronunciation?: string
  pronunciation_ipa?: string
  pronunciation_source?: string
  pronunciation_confidence?: number
  pronunciation_cached?: boolean
  translation?: string
  senses?: EntrySense[]
  example_sentence?: string
  example_translation?: string
}

export interface EnrichRequest {
  draft: Partial<Record<EnrichField, string>> & { danish: string }
  fields: EnrichField[]
  entryKind: 'word' | 'sentence'
  includeExample: boolean
  regenerate: boolean
  /** Per-sense context: the example must demonstrate this one meaning (D10). */
  sense?: { text: string; pos: PartOfSpeech | null }
  /**
   * Enrich even though the word register does not know this Danish form (issue #5 §2). Sent only
   * after the route has already refused the same text once, so the learner's second press is what
   * overrides the check — never the first.
   */
  allowUnknownDanish?: boolean
}

/**
 * The route refused to enrich because COR does not hold this Danish form. A distinct type
 * because the caller has to offer the override; every other failure is just a message.
 */
export class UnknownDanishError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnknownDanishError'
  }
}

/** The `/api/danish/spell` response. A malformed entry is dropped; a hint is never worth a crash. */
export function readMisspellings(body: JsonRecord): Misspelling[] {
  if (!Array.isArray(body.misspelled)) return []
  const found: Misspelling[] = []
  for (const item of body.misspelled) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.word !== 'string' || !record.word) continue
    const suggestions = Array.isArray(record.suggestions)
      ? record.suggestions.filter((value): value is string => typeof value === 'string' && Boolean(value))
      : []
    found.push({ word: record.word, suggestions })
  }
  return found
}

export function readEnrichResult(body: JsonRecord): EnrichResult {
  const result: EnrichResult = {}
  for (const key of ['pronunciation', 'translation', 'example_sentence', 'example_translation'] as const) {
    const value = stringField(body, key)
    if (value !== null) result[key] = value
  }
  if (Array.isArray(body.senses)) result.senses = parseSenses(body.senses)
  return result
}

/** One enrich call. Throws with the route's user-facing message when it fails. */
export async function requestEnrichment(request: EnrichRequest): Promise<EnrichResult> {
  const response = await fetch('/api/ai/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const body = await readJsonRecord(response)
  if (!response.ok) {
    const message = errorMessage(body, 'AI enrichment failed')
    throw body.unknownDanish === true ? new UnknownDanishError(message) : new Error(message)
  }
  return readEnrichResult(body)
}
