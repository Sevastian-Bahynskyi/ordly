/**
 * The second pass over the frequent end of the catalog (issue #6 §8, sense coverage).
 *
 * The first run returned one sense for 98.1% of rows. That is right for `gulv` and wrong for
 * `gang`, `prøve`, `kilde` and `rejse`, and polysemy is concentrated in the frequent words, so
 * this re-asks only the top of the ranking, showing the generator what it already wrote.
 *
 *   pnpm exec tsx scripts/write-sense-pass.ts --through 20
 *
 * Writes `catalog/prompts/senses-NNNN.txt` for each batch it covers. The replies overwrite
 * `catalog/out/batch-NNNN.json`, and the previous version stays in git, so a batch that comes
 * back worse can be restored with `git checkout`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
  buildSensePassPrompt,
  parseCatalogFact,
  parseCatalogGeneratorText,
  type CatalogFact,
  type CatalogGeneratedRow,
} from '../lib/catalog-contract'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'

interface IndexEntry {
  batch: string
  start: number
  size: number
}

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

async function readFacts(path: string): Promise<CatalogFact[]> {
  const text = await readFile(path, 'utf8')
  return text.split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
    const fact = parseCatalogFact(JSON.parse(line) as unknown)
    if (!fact) throw new Error(`facts.jsonl line ${index + 1} does not match the fact contract`)
    return fact
  })
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const factsPath = valueAfter(argv, '--facts') || 'catalog/facts.jsonl'
  const indexPath = valueAfter(argv, '--index') || 'catalog/prompts/index.json'
  const outDir = valueAfter(argv, '--out') || 'catalog/out'
  const promptDir = valueAfter(argv, '--prompts') || 'catalog/prompts'
  const rawThrough = valueAfter(argv, '--through')
  const through = rawThrough === null ? 20 : Number(rawThrough)
  if (!Number.isInteger(through) || through < 1) throw new Error('--through must be a positive integer')

  const facts = await readFacts(factsPath)
  const index = (JSON.parse(await readFile(indexPath, 'utf8')) as IndexEntry[]).slice(0, through)
  await mkdir(promptDir, { recursive: true })

  let covered = 0
  let alreadyMultiple = 0
  for (const entry of index) {
    const existing = new Map<string, CatalogGeneratedRow>()
    const parsed = parseCatalogGeneratorText(await readFile(`${outDir}/${entry.batch}`, 'utf8'))
    for (const value of parsed) {
      if (isGeneratedCatalogRow(value)) {
        existing.set(value.lemma, value)
        if (value.senses.length > 1) alreadyMultiple += 1
      }
    }

    const slice = facts.slice(entry.start, entry.start + entry.size)
    const name = entry.batch.replace(/^batch-/u, 'senses-').replace(/\.json$/u, '.txt')
    await writeFile(`${promptDir}/${name}`, `${buildSensePassPrompt(slice, existing)}\n`, 'utf8')
    covered += slice.length
  }

  console.log(`Wrote ${index.length} sense-pass prompts covering ranks 1-${covered} to ${promptDir}/`)
  console.log(`${alreadyMultiple} of those rows already carry more than one meaning`)
  console.log(`Replies overwrite ${outDir}/batch-NNNN.json; the previous version stays in git`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not write the sense pass')
  process.exitCode = 1
})
