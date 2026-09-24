/**
 * Load a learner-language wording file into `public.word_catalog_sense` (issue #14).
 *
 *   pnpm exec tsx scripts/import-catalog-locale.ts catalog/locale-pilot.en.json          # load
 *   pnpm exec tsx scripts/import-catalog-locale.ts catalog/locale-pilot.en.json --sql    # print only
 *   pnpm exec tsx scripts/import-catalog-locale.ts catalog/locale-en.json --sql-dir <dir> [--chunk 300]
 *                                                  # one idempotent statement file per chunk
 *
 * Reference data, like the rest of the catalog: loaded by a script, never by a migration. The file
 * is validated first and nothing is written if any row fails. Each row only adds a wording to a
 * sense that already exists in another language, so its id, ordinal, part of speech and gender are
 * the existing ones; re-running the same file changes nothing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { localeUpsertSql, validateLocaleFile, type LocaleFile } from '../lib/catalog-locale'
import { query } from './catalog-db'

const [path, flag] = process.argv.slice(2)
if (!path) {
  console.error('Usage: import-catalog-locale.ts <file.json> [--sql]')
  process.exit(1)
}
const file: unknown = JSON.parse(readFileSync(path, 'utf8'))
const errors = validateLocaleFile(file)
if (errors.length) {
  console.error(`Refusing to load ${path}:\n${errors.join('\n')}`)
  process.exit(1)
}
const locale = file as LocaleFile
const argv = process.argv.slice(2)
const sqlDir = argv.includes('--sql-dir') ? argv[argv.indexOf('--sql-dir') + 1] : null
const statement = localeUpsertSql(locale)
if (sqlDir) {
  const size = argv.includes('--chunk') ? Number(argv[argv.indexOf('--chunk') + 1]) : 300
  mkdirSync(sqlDir, { recursive: true })
  let n = 0
  for (let start = 0; start < locale.senses.length; start += size) {
    n += 1
    writeFileSync(join(sqlDir, `locale-${locale.lang}-${String(n).padStart(4, '0')}.sql`), `${localeUpsertSql({ ...locale, senses: locale.senses.slice(start, start + size) })};\n`)
  }
  console.log(`Wrote ${n} statements to ${sqlDir}`)
} else if (flag === '--sql') {
  process.stdout.write(`${statement};\n`)
} else {
  const [counts] = await query(statement)
  console.log(`Loaded ${path}: ${JSON.stringify(counts)}`)
  if (counts && Number(counts.matched) !== Number(counts.incoming)) console.warn('Some rows name a sense the catalog does not have; they were skipped.')
}
