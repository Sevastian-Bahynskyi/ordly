import { readFile, writeFile } from 'node:fs/promises'
import { buildCatalogGeneratorPrompt, type CatalogFact, type CatalogGeneratedRow } from '../lib/catalog-contract'
import type { CatalogFailureCode } from '../lib/catalog-validation'

interface IndexEntry {
  batch: string
  start: number
  size: number
  first: string
  last: string
}

interface ReviewRow {
  lemma: string
  failures: Array<{ code: CatalogFailureCode }>
}

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

async function main(): Promise<void> {
  const explicitLemma = valueAfter(process.argv.slice(2), '--lemma')
  const review = (await readFile('catalog/needs_review.jsonl', 'utf8'))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ReviewRow)
  const rejected = new Set(
    review
      .filter((row) => row.failures.some((failure) => failure.code === 'lemma_not_in_cor_for_pos'))
      .map((row) => row.lemma),
  )
  if (explicitLemma) rejected.add(explicitLemma)
  const facts = (await readFile('catalog/facts.jsonl', 'utf8'))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CatalogFact)
  const index = JSON.parse(await readFile('catalog/prompts/index.json', 'utf8')) as IndexEntry[]
  const keptFacts: CatalogFact[] = []
  const nextIndex: IndexEntry[] = []

  for (const entry of index) {
    const path = `catalog/out/${entry.batch}`
    const rows = JSON.parse(await readFile(path, 'utf8')) as CatalogGeneratedRow[]
    const batchFacts = facts.slice(entry.start, entry.start + entry.size)
    if (rows.length !== batchFacts.length) throw new Error(`${entry.batch} no longer matches its fact slice`)
    const kept = batchFacts.map((fact, rowIndex) => ({ fact, row: rows[rowIndex] }))
      .filter(({ fact }) => !rejected.has(fact.lemma))
    if (!kept.length) throw new Error(`${entry.batch} would become empty`)
    const start = keptFacts.length
    const keptBatchFacts = kept.map(({ fact }) => fact)
    keptFacts.push(...keptBatchFacts)
    nextIndex.push({
      batch: entry.batch,
      start,
      size: kept.length,
      first: kept[0].fact.lemma,
      last: kept.at(-1)?.fact.lemma || kept[0].fact.lemma,
    })
    await writeFile(path, `${JSON.stringify(kept.map(({ row }) => row), null, 2)}\n`, 'utf8')
    const promptName = entry.batch.replace(/\.json$/u, '.txt')
    await writeFile(`catalog/prompts/${promptName}`, `${buildCatalogGeneratorPrompt(keptBatchFacts)}\n`, 'utf8')
  }

  await writeFile('catalog/facts.jsonl', `${keptFacts.map((fact) => JSON.stringify(fact)).join('\n')}\n`, 'utf8')
  await writeFile('catalog/prompts/index.json', `${JSON.stringify(nextIndex, null, 2)}\n`, 'utf8')
  console.log(`Removed ${facts.length - keptFacts.length} source rows that the COR gate cannot verify.`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not prune rejected catalog sources')
  process.exitCode = 1
})
