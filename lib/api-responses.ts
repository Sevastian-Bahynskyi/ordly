import type { Misspelling } from './danish-text'

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
