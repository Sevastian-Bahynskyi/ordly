/**
 * Read-only database access for the catalog build (issue #6).
 *
 * The same route `scripts/import-cor.ts` uses: the Supabase CLI's linked Management API
 * connection, so no service-role key and no database password is ever read, written or committed
 * here. The catalog build only reads reference data and the learner's own word list.
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const run = promisify(execFile)

export async function query(sql: string): Promise<Record<string, unknown>[]> {
  const { stdout } = await run('supabase', ['db', 'query', '--linked', sql], { maxBuffer: 256 * 1024 * 1024 })
  const body: unknown = JSON.parse(stdout.slice(stdout.indexOf('{')))
  const rows = body && typeof body === 'object' ? (body as { rows?: unknown }).rows : null
  return Array.isArray(rows) ? rows as Record<string, unknown>[] : []
}

/** A dollar-quote tag that cannot occur inside the payload, so the text needs no escaping. */
export function literal(value: string): string {
  let tag = `r${randomBytes(6).toString('hex')}`
  while (value.includes(`$${tag}$`)) tag = `r${randomBytes(6).toString('hex')}`
  return `$${tag}$${value}$${tag}$`
}

/**
 * One query returning a single JSON array, which is how every read here is shaped: the CLI prints
 * one row whose only column is the whole result, so nothing has to be reassembled column by column.
 */
export async function queryJson<T>(sql: string): Promise<T[]> {
  const rows = await query(`select coalesce(json_agg(t), '[]'::json) as data from (${sql}) t`)
  const data = rows[0]?.data
  return Array.isArray(data) ? data as T[] : []
}
