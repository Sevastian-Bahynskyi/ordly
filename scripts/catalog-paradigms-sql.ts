/**
 * Verified forms for catalog words added from generator output directories, as SQL (issue #16).
 *
 *   CATALOG_COR_TSV=<cor.tsv> pnpm exec tsx scripts/catalog-paradigms-sql.ts \
 *     --out catalog/expansion/out,catalog/expansion2/out --skip a/needs_review.jsonl,b/needs_review.jsonl --sql-dir <dir>
 *
 * The same paradigm `scripts/sync-word-paradigms.ts` builds (`corParadigm` over the word's COR
 * rows, filtered by its parts of speech and genders), but read from the committed rows instead of
 * the database, and written into `word_catalog_form` only. Learners' saved entries are not
 * touched: they gain forms when they are saved, as before. Additive and idempotent.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseCatalogGeneratorText } from '../lib/catalog-contract'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'
import { corParadigm, corPartsOfSpeech, parseCorForms } from '../lib/cor'
import type { NounGender, PartOfSpeech } from '../lib/types'
import { catalogFormsJsonSql } from '../lib/catalog-import'
import { corRowsFor } from './catalog-db'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const dirs = (option('--out') || '').split(',').filter(Boolean)
const skips = (option('--skip') || '').split(',').filter(Boolean)
const sqlDir = option('--sql-dir')
if (!dirs.length || !sqlDir) {
  console.error('Usage: catalog-paradigms-sql.ts --out dir[,dir] [--skip needs_review.jsonl[,…]] --sql-dir <dir>')
  process.exit(1)
}
const skipped = new Set<string>()
for (const path of skips) if (existsSync(path)) for (const line of (await readFile(path, 'utf8')).split(/\r?\n/u).filter(Boolean)) skipped.add(String((JSON.parse(line) as { lemma?: unknown }).lemma))

const words = new Map<string, { hints: Set<PartOfSpeech>; genders: Set<NounGender> }>()
for (const dir of dirs) {
  for (const name of (await readdir(dir)).filter((file) => /^batch-\d+\.json$/.test(file))) {
    for (const value of parseCatalogGeneratorText(await readFile(join(dir, name), 'utf8'))) {
      if (!isGeneratedCatalogRow(value) || value.kind !== 'word' || skipped.has(value.lemma)) continue
      const word = words.get(value.lemma) || { hints: new Set(), genders: new Set() }
      for (const sense of value.senses) {
        if (sense.pos && sense.pos !== 'phrase') word.hints.add(sense.pos)
        if (sense.gender) word.genders.add(sense.gender)
      }
      words.set(value.lemma, word)
    }
  }
}

const values: [string, string, string, string][] = []
let without = 0
for (const [lemma, word] of words) {
  const hints = [...word.hints]
  const rows = parseCorForms(await corRowsFor([lemma], 'lemma'))
    .filter((row) => row.lemma === lemma && (!hints.length || corPartsOfSpeech(row.tag).some((part) => hints.includes(part))))
  const forms = corParadigm(rows, hints, [...word.genders])
  if (!forms.length) without += 1
  for (const form of forms) values.push([lemma, form.form_key, form.form_text, form.gender])
}
await mkdir(sqlDir, { recursive: true })
let n = 0
for (let offset = 0; offset < values.length; offset += 1500) {
  n += 1
  await writeFile(join(sqlDir, `forms-${String(n).padStart(4, '0')}.sql`), `${catalogFormsJsonSql(values.slice(offset, offset + 1500))};\n`)
}
console.log(`${words.size} words, ${values.length} forms (${without} words without a COR paradigm), ${n} statements → ${sqlDir}`)
