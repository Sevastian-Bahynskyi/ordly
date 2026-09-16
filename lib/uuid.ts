const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * True for a canonical uuid. Use it before an id from a URL or request body is interpolated into
 * a PostgREST filter string such as `or=(a_id.eq.<id>,...)`, where anything else could change the
 * filter's meaning.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}
