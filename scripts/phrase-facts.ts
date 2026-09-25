/**
 * Catalog facts for phrase rows (issue #16), derived — never hand-kept. A phrase's facts are
 * entirely the inventory's (lemma, kind, part of speech; no rank, gender, forms or IPA), so they
 * are written from the rows in row order, which is the order `validate-catalog.ts` pairs them in.
 *
 *   pnpm exec tsx scripts/phrase-facts.ts --rows catalog/phrases/out/batch-0001.json[,…] --out catalog/phrases/facts.jsonl
 */
import { readFile, writeFile } from 'node:fs/promises'
import type { CatalogFact, CatalogGeneratedRow } from '../lib/catalog-contract'
import type { PhraseCandidate } from '../lib/catalog-phrases'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const rowsPaths = (option('--rows') || '').split(',').filter(Boolean)
const outPath = option('--out') || 'catalog/phrases/facts.jsonl'
if (!rowsPaths.length) {
  console.error('Usage: phrase-facts.ts --rows <phrases/out/batch.json>[,…] [--out facts.jsonl]')
  process.exit(1)
}
const inventory = new Map((await readFile('catalog/phrases/inventory.jsonl', 'utf8')).split('\n').filter(Boolean)
  .map((line) => JSON.parse(line) as PhraseCandidate).map((candidate) => [candidate.phrase, candidate]))
const facts: CatalogFact[] = []
for (const path of rowsPaths) {
  for (const row of JSON.parse(await readFile(path, 'utf8')) as CatalogGeneratedRow[]) {
    const candidate = inventory.get(row.lemma)
    if (!candidate) { console.error(`${row.lemma}: not in the inventory — refused`); process.exit(1) }
    facts.push({ lemma: candidate.phrase, kind: 'phrase', freq_rank: null, pos: candidate.pos, gender: null, definite_singular: null, indefinite_plural: null, ipa: null, ipa_source: null })
  }
}
await writeFile(outPath, facts.map((fact) => JSON.stringify(fact)).join('\n') + '\n')
console.log(`${facts.length} phrase facts → ${outPath}`)
