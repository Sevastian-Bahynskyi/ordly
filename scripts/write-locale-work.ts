/**
 * Work files for a learner-language wording pass over the whole catalog (issue #16).
 *
 *   pnpm exec tsx scripts/write-locale-work.ts --lang en [--out catalog/expansion/out --target catalog/expansion/locale/work]
 *   pnpm exec tsx scripts/write-locale-work.ts --lang uk --from-db --target catalog/locale-uk/work
 *
 * `--from-db` (issue #24) reads every sense from the linked catalog instead of generator files, so
 * a new language is worded for exactly the senses the database holds: the catalog, both expansion
 * waves, the phrases and every later repair. Each row also carries the English wording, and the
 * Danish example is the sense's English-row example (Russian rows mostly keep theirs at entry
 * level), so the new language gets the examples English learners get.
 *
 * One file per generator batch in `catalog/out`, holding every sense with its stable id, the
 * Russian wording it must mean the same as, and the Danish example it must translate. A sense that
 * already has a wording in that language (the issue #14 pilot) is left out. The generator writes
 * `catalog/locale/<lang>/batch-NNNN.json`; `scripts/check-locale-batches.ts` holds it to this file.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseCatalogGeneratorText } from '../lib/catalog-contract'
import { senseId } from '../lib/catalog-import'
import type { LocaleWorkRow } from '../lib/catalog-locale-pass'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'
import { queryJson } from './catalog-db'

const argv = process.argv.slice(2)
const lang = argv[argv.indexOf('--lang') + 1] || 'en'
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const sourceDir = option('--out') || 'catalog/out'
// Rows the catalog gate quarantined are never loaded, so they get no wording either.
const skipPath = option('--skip')
const quarantined = new Set<string>(skipPath && existsSync(skipPath)
  ? (await readFile(skipPath, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => String((JSON.parse(line) as { lemma?: unknown }).lemma))
  : [])
const done = new Set<string>()
for (const name of (await readdir('catalog')).filter((file) => /^locale-pilot\..*\.json$/.test(file))) {
  const file = JSON.parse(await readFile(join('catalog', name), 'utf8')) as { lang?: string; senses?: { sense_id: string }[] }
  if (file.lang === lang) for (const sense of file.senses || []) done.add(sense.sense_id)
}

const outDir = option('--target') || join('catalog', 'locale', 'work')
await mkdir(outDir, { recursive: true })
let total = 0
if (argv.includes('--from-db')) {
  const size = Number(option('--batch-size') || 50)
  const rows = await queryJson<LocaleWorkRow>(`select r.lemma, r.kind, r.sense_id, r.ordinal, r.pos, r.gender, r.text as ru, e.text as en,
      coalesce(e.example, r.example) as example, r.example_translation as example_ru, e.example_translation as example_en
    from public.word_catalog_sense r
    join public.word_catalog_sense e on e.lemma = r.lemma and e.kind = r.kind and e.sense_id = r.sense_id and e.lang = 'en'
    where r.lang = 'ru' and not exists (
      select 1 from public.word_catalog_sense t where t.lemma = r.lemma and t.kind = r.kind and t.sense_id = r.sense_id and t.lang = '${lang.replace(/[^a-z]/g, '')}')
    order by r.kind, r.lemma, r.ordinal`)
  for (let start = 0; start < rows.length; start += size) {
    await writeFile(join(outDir, `batch-${String(start / size + 1).padStart(4, '0')}.json`), `${JSON.stringify(rows.slice(start, start + size), null, 1)}\n`)
  }
  console.log(`${rows.length} senses need a ${lang} wording (${Math.ceil(rows.length / size)} batches)`)
  process.exit(0)
}
for (const name of (await readdir(sourceDir)).filter((file) => /^batch-\d+\.json$/.test(file)).sort()) {
  const rows: LocaleWorkRow[] = []
  for (const value of parseCatalogGeneratorText(await readFile(join(sourceDir, name), 'utf8'))) {
    if (!isGeneratedCatalogRow(value) || quarantined.has(value.lemma)) continue
    for (const sense of value.senses) {
      const id = senseId(value.lemma, value.kind, sense.ordinal)
      if (done.has(id)) continue
      rows.push({
        lemma: value.lemma, kind: value.kind, sense_id: id, ordinal: sense.ordinal,
        pos: sense.pos, gender: sense.gender, ru: sense.text,
        example: sense.example, example_ru: sense.example_translation,
      })
    }
  }
  total += rows.length
  await writeFile(join(outDir, name), `${JSON.stringify(rows, null, 1)}\n`)
}
console.log(`${total} senses need a ${lang} wording; ${done.size} already have one`)
