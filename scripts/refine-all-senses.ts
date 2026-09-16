/**
 * One-off catch-up for D11 phase 2: refine every word whose senses are still `'split'`.
 *
 * The app refines a few entries per page view (`SenseRefinementBackfill`); this runs the same
 * classification (`classifySenses`) and the same conservative fold (`applyRefinement`) over the
 * whole vocabulary at once. It never changes a `translation` string — the script re-checks that
 * before every write and skips the entry if it would.
 *
 * Usage (from the repo root, with the project linked via `supabase link`):
 *
 *   pnpm exec tsx scripts/refine-all-senses.ts --dry-run   # classify and print, write nothing
 *   pnpm exec tsx scripts/refine-all-senses.ts             # classify and write
 *
 * Needs OPENROUTER_API_KEY in `.env.local` (never printed). Database access goes through the
 * Supabase CLI's linked Management API connection, so no database password is read here.
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { applyRefinement, needsRefinement } from '../lib/sense-refinement'
import { classifySenses, MAX_REFINED_SENSE_LENGTH, MAX_REFINED_SENSES } from '../lib/sense-refinement-ai'
import { activeSenses, parseSenses, translationFromSenses } from '../lib/senses'

const run = promisify(execFile)
const CONCURRENCY = 4

interface Row {
  id: string
  danish: string
  senses: unknown
  updated_at: string
}

function loadEnv(): void {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // Falls through to the key check below.
  }
}

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const { stdout } = await run('supabase', ['db', 'query', '--linked', sql], { maxBuffer: 64 * 1024 * 1024 })
  const body: unknown = JSON.parse(stdout.slice(stdout.indexOf('{')))
  const rows = body && typeof body === 'object' ? (body as { rows?: unknown }).rows : null
  return Array.isArray(rows) ? rows as Record<string, unknown>[] : []
}

/** A dollar-quote tag that cannot occur inside the payload, so the JSON needs no escaping. */
function literal(value: string): string {
  let tag = `r${randomBytes(6).toString('hex')}`
  while (value.includes(`$${tag}$`)) tag = `r${randomBytes(6).toString('hex')}`
  return `$${tag}$${value}$${tag}$`
}

async function refine(row: Row, dryRun: boolean): Promise<string> {
  const stored = parseSenses(row.senses)
  const live = activeSenses(stored)
  if (!needsRefinement(stored)) return 'skip (already refined)'
  if (live.length > MAX_REFINED_SENSES) return `skip (${live.length} senses)`

  const meanings = await classifySenses(row.danish, live.map((sense) => sense.text.trim().slice(0, MAX_REFINED_SENSE_LENGTH)))
  const next = applyRefinement(stored, meanings)
  if (translationFromSenses(next) !== translationFromSenses(stored)) return 'skip (translation would change)'

  const summary = activeSenses(next).map((sense) => `${sense.text} [${sense.pos || '?'}${sense.gender ? ` ${sense.gender}` : ''}]`).join(' | ')
  if (dryRun) return `would write: ${summary}`

  const written = await query(`update public.vocabulary_entries set senses = ${literal(JSON.stringify(next))}::jsonb
    where id = ${literal(row.id)}::uuid and updated_at = ${literal(row.updated_at)}::timestamptz returning id`)
  return written.length ? `written: ${summary}` : 'skip (edited meanwhile)'
}

async function main(): Promise<void> {
  loadEnv()
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set in .env.local')
  const dryRun = process.argv.includes('--dry-run')

  const rows = (await query(`select id, danish, senses, updated_at from public.vocabulary_entries
    where entry_kind <> 'sentence' order by created_at desc`)) as unknown as Row[]
  const pending = rows.filter((row) => needsRefinement(row.senses))
  console.log(`${pending.length} of ${rows.length} words need refinement${dryRun ? ' (dry run)' : ''}`)

  let next = 0
  let failed = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < pending.length) {
      const row = pending[next++]
      try {
        console.log(`${row.danish}: ${await refine(row, dryRun)}`)
      } catch (error) {
        failed += 1
        console.log(`${row.danish}: failed (${error instanceof Error ? error.message : 'unknown error'})`)
      }
    }
  }))
  console.log(failed ? `${failed} failed; re-run to retry them.` : 'Done.')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Refinement failed')
  process.exit(1)
})
