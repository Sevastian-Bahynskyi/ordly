/**
 * Work files for the sentence-family pass (issue #16).
 *
 *   pnpm exec tsx scripts/write-family-work.ts --fullforms <ddo-fullforms.csv> [--size 40]
 *   pnpm exec tsx scripts/write-family-work.ts --fullforms <csv> --out catalog/expansion/out,catalog/expansion2/out \
 *     --facts catalog/expansion/facts.jsonl,catalog/expansion2/facts.jsonl \
 *     --skip catalog/expansion/needs_review.jsonl,catalog/expansion2/needs_review.jsonl \
 *     --locale catalog/expansion/locale-en.json,catalog/expansion2/locale-en.json --target catalog/expansion/families/work
 *
 * One entry per catalog sense: its identity, the Russian (and, once written, English) wording that
 * says which meaning it is, the lowest level it may be taught at, and **every verified form** of
 * the word in that part of speech — from DSL's DDO full-form list and the COR forms already in
 * the facts. A family may put only one of those forms into a sentence, so the generator is shown
 * them rather than asked to inflect. Rows the catalog gate quarantined (`--skip`) are not in the
 * catalog, so they get no work row.
 *
 * Writes `catalog/families/work/batch-NNNN.json` and `index.json`. Re-running rewrites the work
 * files but never touches a reply.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseCatalogFact, parseCatalogGeneratorText, type CatalogFact } from '../lib/catalog-contract'
import { minLevelForRank, type FamilyWorkSense } from '../lib/catalog-families'
import { senseId } from '../lib/catalog-import'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'
import { formsOf, parseFullForms } from '../lib/ddo-fullform'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const fullFormsPath = option('--fullforms')
const size = Number(option('--size') || 40)
const outDirs = (option('--out') || 'catalog/out').split(',')
const factsPaths = (option('--facts') || 'catalog/facts.jsonl').split(',')
const target = option('--target') || 'catalog/families/work'
const skipPaths = (option('--skip') || '').split(',').filter(Boolean)
const extraLocales = (option('--locale') || '').split(',').filter(Boolean)
if (!fullFormsPath) {
  console.error('Usage: write-family-work.ts --fullforms <ddo-fullforms.csv> [--size 40] [--out dir,dir] [--facts file,file] [--skip file,file] [--locale file,file] [--target dir]')
  process.exit(1)
}

const index = parseFullForms(await readFile(fullFormsPath, 'utf8'))
const facts = new Map<string, CatalogFact>()
for (const path of factsPaths) {
  for (const line of (await readFile(path, 'utf8')).split(/\r?\n/u)) {
    if (!line.trim()) continue
    const fact = parseCatalogFact(JSON.parse(line) as unknown)
    if (fact) facts.set(`${fact.lemma}|${fact.kind}`, fact)
  }
}

// English wordings written so far, from the pilot and the wording pass, keyed by sense id.
const english = new Map<string, string>()
const localeFiles = [
  ...(existsSync('catalog/locale-pilot.en.json') ? ['catalog/locale-pilot.en.json'] : []),
  ...(existsSync('catalog/locale/en') ? (await readdir('catalog/locale/en')).filter((name) => /^batch-\d+\.json$/.test(name)).map((name) => join('catalog/locale/en', name)) : []),
  ...extraLocales,
]
const skipped = new Set<string>()
for (const path of skipPaths) {
  for (const line of (await readFile(path, 'utf8')).split(/\r?\n/u)) if (line.trim()) skipped.add(String((JSON.parse(line) as { lemma?: unknown }).lemma))
}
for (const path of localeFiles) {
  const file = JSON.parse(await readFile(path, 'utf8')) as { senses?: { sense_id: string; text: string }[] }
  for (const sense of file.senses || []) english.set(sense.sense_id, sense.text)
}

const senses: FamilyWorkSense[] = []
for (const dir of outDirs) {
  for (const name of (await readdir(dir)).filter((file) => /^batch-\d+\.json$/.test(file)).sort()) {
    for (const value of parseCatalogGeneratorText(await readFile(join(dir, name), 'utf8'))) {
      if (!isGeneratedCatalogRow(value) || skipped.has(value.lemma)) continue
      const fact = facts.get(`${value.lemma}|${value.kind}`)
      if (!fact) continue
      for (const sense of value.senses) {
        const id = senseId(value.lemma, value.kind, sense.ordinal)
        const forms = new Set(formsOf(index, value.lemma, sense.pos))
        // COR's own paradigm columns, where the facts carry them, count as verified too.
        if (sense.pos === 'noun' && sense.pos === fact.pos) {
          for (const form of [fact.definite_singular, fact.indefinite_plural]) if (form) forms.add(form.toLocaleLowerCase('da-DK'))
        }
        senses.push({
          lemma: value.lemma, kind: value.kind, sense_id: id, pos: sense.pos, gender: sense.gender,
          freq_rank: fact.freq_rank, min_level: minLevelForRank(fact.freq_rank),
          ru: sense.text, en: english.get(id) ?? null, forms: [...forms].sort(),
        })
      }
    }
  }
}

await mkdir(target, { recursive: true })
const batches: Record<string, number> = {}
for (let start = 0, n = 1; start < senses.length; start += size, n += 1) {
  const name = `batch-${String(n).padStart(4, '0')}.json`
  batches[name] = Math.min(size, senses.length - start)
  await writeFile(join(target, name), `${JSON.stringify(senses.slice(start, start + size), null, 1)}\n`)
}
await writeFile(join(target, 'index.json'), `${JSON.stringify({ senses: senses.length, size, batches }, null, 1)}\n`)
const withEnglish = senses.filter((sense) => sense.en).length
console.log(`${senses.length} senses in ${Object.keys(batches).length} batches · ${withEnglish} with an English wording`)
