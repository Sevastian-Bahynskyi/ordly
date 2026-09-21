/**
 * One-off import of COR — Det Centrale Ordregister — into `public.cor_form` (issue #5 §1).
 *
 * COR is CC0-1.0 and records what Ordly used to pay a model to guess: a Danish noun's gender,
 * and the part of speech of an inflected form. The table is the whole point — 19 MB parsed per
 * cold start is exactly the critical-path cost AGENTS.md §16 warns about, one indexed lookup is
 * not. See docs/free-data-sources.md for the measurements.
 *
 * Only normering `N` is imported: the normed, currently-correct spellings. That drops 423,726
 * forms to 247,527 and costs exactly one word of the real vocabulary (`yndlings`). The published
 * README claims field 6 is `1`/`0`; the shipped file contains `N`/`K`/`U`. Trust the file.
 *
 * Usage (from the repo root, with the project linked via `supabase link`):
 *
 *   pnpm exec tsx scripts/import-cor.ts --dry-run          # parse and report, write nothing
 *   pnpm exec tsx scripts/import-cor.ts                    # download and load, skipping rows already there
 *   pnpm exec tsx scripts/import-cor.ts --file cor.tsv     # load a copy already on disk
 *   pnpm exec tsx scripts/import-cor.ts --replace          # empty the table first (new COR release)
 *
 * Re-running without `--replace` is safe: every batch is `on conflict do nothing`, so a run
 * interrupted halfway simply continues. Database access goes through the Supabase CLI's linked
 * Management API connection, so no database password or service-role key is read here.
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

const run = promisify(execFile)

const COR_URL = 'https://ordregister.dk/files/cor1.5.1.0.tsv'
/** Rows per statement. ~250 KB of SQL per batch, comfortably inside the API's payload limit. */
const BATCH_SIZE = 5000

/** Field positions in the six-column TSV, 0-based. Field 3 (Glosse) is unused. */
const LEMMA = 1
const TAG = 3
const FORM = 4
const NORMERING = 5

interface CorRow {
  form: string
  lemma: string
  tag: string
}

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const { stdout } = await run('supabase', ['db', 'query', '--linked', sql], { maxBuffer: 64 * 1024 * 1024 })
  const body: unknown = JSON.parse(stdout.slice(stdout.indexOf('{')))
  const rows = body && typeof body === 'object' ? (body as { rows?: unknown }).rows : null
  return Array.isArray(rows) ? rows as Record<string, unknown>[] : []
}

/** A dollar-quote tag that cannot occur inside the payload, so the text needs no escaping. */
function literal(value: string): string {
  let tag = `r${randomBytes(6).toString('hex')}`
  while (value.includes(`$${tag}$`)) tag = `r${randomBytes(6).toString('hex')}`
  return `$${tag}$${value}$${tag}$`
}

async function download(): Promise<string> {
  const response = await fetch(COR_URL)
  if (!response.ok) throw new Error(`COR download failed with HTTP ${response.status}`)
  return response.text()
}

/**
 * Parse the TSV into the rows the table stores: normering `N` only, form and lemma lowercased
 * because every lookup is case-insensitive, and deduplicated because one form/lemma/tag triple
 * can carry several COR ids.
 */
export function parseCorTsv(tsv: string): CorRow[] {
  const byKey = new Map<string, CorRow>()
  for (const line of tsv.split('\n')) {
    if (!line) continue
    const fields = line.split('\t')
    if (fields.length !== 6 || fields[NORMERING] !== 'N') continue
    // Exactly the key `corLookupForm` builds, or a form imported here would never be found.
    const form = fields[FORM].normalize('NFC').trim().toLocaleLowerCase('da-DK')
    const lemma = fields[LEMMA].normalize('NFC').trim().toLocaleLowerCase('da-DK')
    const tag = fields[TAG].trim()
    if (!form || !lemma || !tag) continue
    byKey.set(`${form}\t${lemma}\t${tag}`, { form, lemma, tag })
  }
  return [...byKey.values()]
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const replace = process.argv.includes('--replace')
  const fileIndex = process.argv.indexOf('--file')
  const path = fileIndex >= 0 ? process.argv[fileIndex + 1] : null

  const tsv = path ? readFileSync(path, 'utf8') : await download()
  const rows = parseCorTsv(tsv)
  const forms = new Set(rows.map((row) => row.form))
  console.log(`${rows.length} rows over ${forms.size} distinct forms${dryRun ? ' (dry run)' : ''}`)
  if (dryRun) return

  if (replace) {
    await query('truncate table public.cor_form')
    console.log('emptied public.cor_form')
  }

  let written = 0
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE)
    const values = batch
      .map((row) => `(${literal(row.form)}, ${literal(row.lemma)}, ${literal(row.tag)}, 'N')`)
      .join(',')
    const result = await query(`insert into public.cor_form (form, lemma, tag, normering) values ${values}
      on conflict (form, lemma, tag) do nothing returning 1 as inserted`)
    written += result.length
    console.log(`${Math.min(start + BATCH_SIZE, rows.length)}/${rows.length} sent, ${written} new`)
  }

  const [count] = await query('select count(*) as rows from public.cor_form')
  console.log(`Done. ${written} rows inserted; the table now holds ${count?.rows ?? '?'}.`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'COR import failed')
  process.exit(1)
})
