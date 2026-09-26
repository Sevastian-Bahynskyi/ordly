/**
 * The recorded forms of phrases already in the catalog (issue #28), as SQL to run once:
 *
 *   pnpm exec tsx scripts/phrase-forms-sql.ts --in catalog/phrases/forms-existing.jsonl --sql-dir <dir>
 *
 * `forms-existing.jsonl` is written by `plan-phrase-batches.ts --existing` from the same COR
 * paradigms as new phrases get. New phrases carry their forms through their pipeline batch's load.
 * Additive and idempotent (`catalogPhraseFormsJsonSql`); run the file with `supabase db query --linked`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { catalogPhraseFormsJsonSql } from '../lib/catalog-import'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const input = option('--in') || 'catalog/phrases/forms-existing.jsonl'
const sqlDir = option('--sql-dir')
if (!sqlDir) {
  console.error('Usage: phrase-forms-sql.ts [--in catalog/phrases/forms-existing.jsonl] --sql-dir <dir>')
  process.exit(1)
}
const phrases = (await readFile(input, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as { lemma: string; form_rows: { form_key: string; form_text: string }[] })
const rows = phrases.flatMap((phrase) => phrase.form_rows.map((row) => ({ lemma: phrase.lemma, ...row })))
await mkdir(sqlDir, { recursive: true })
await writeFile(join(sqlDir, 'forms-existing.sql'), `${catalogPhraseFormsJsonSql(rows)};\n`)
console.log(`${rows.length} forms of ${phrases.length} phrases → ${join(sqlDir, 'forms-existing.sql')}`)
