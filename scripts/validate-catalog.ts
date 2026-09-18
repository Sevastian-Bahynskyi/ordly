/**
 * Deterministic issue #6 §9 gate for one generated batch.
 *
 * This script deliberately does not parse COR tags or build a spelling dictionary. Pass a small
 * source adapter that exports `catalogValidationSources`; those source implementations belong to
 * their own work. A source returning null, throwing, or being unavailable never becomes a pass.
 *
 * Example:
 *   pnpm exec tsx scripts/validate-catalog.ts \
 *     --facts catalog/facts.jsonl \
 *     --input catalog/out/batch-0001.json \
 *     --sources scripts/catalog-validation-sources.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseCatalogFact, parseCatalogGeneratorText, type CatalogFact } from '../lib/catalog-contract'
import {
  validateCatalogBatch,
  type CatalogValidationFailure,
  type CatalogValidationSources,
} from '../lib/catalog-validation'

interface Args {
  facts: string
  input: string
  sources: string
  needsReview: string
  start: number
  size: number
}

interface ReviewLine {
  batch: string
  index: number
  lemma: string
  output: unknown
  failures: CatalogValidationFailure[]
}

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

function positiveInteger(value: string | null, fallback: number, name: string, allowZero = false): number {
  if (value === null) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || (allowZero ? parsed < 0 : parsed < 1)) throw new Error(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`)
  return parsed
}

function parseArgs(argv: string[]): Args {
  const facts = valueAfter(argv, '--facts')
  const input = valueAfter(argv, '--input')
  const sources = valueAfter(argv, '--sources')
  if (!facts || !input || !sources) throw new Error('Required: --facts <jsonl> --input <json> --sources <module>')
  return {
    facts,
    input,
    sources,
    needsReview: valueAfter(argv, '--needs-review') || 'catalog/needs_review.jsonl',
    start: positiveInteger(valueAfter(argv, '--start'), 0, '--start', true),
    size: positiveInteger(valueAfter(argv, '--size'), 40, '--size'),
  }
}

function parseFacts(text: string): CatalogFact[] {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`facts.jsonl line ${index + 1} is not valid JSON`)
    }
    const fact = parseCatalogFact(value)
    if (!fact) throw new Error(`facts.jsonl line ${index + 1} does not match the fact contract`)
    return fact
  })
}

async function loadSources(path: string): Promise<CatalogValidationSources> {
  const module = await import(pathToFileURL(resolve(path)).href) as Record<string, unknown>
  const value = (module.catalogValidationSources || module.default) as Partial<CatalogValidationSources> | undefined
  if (!value || typeof value.corLemmaHasPartOfSpeech !== 'function' || typeof value.findMisspellings !== 'function') {
    throw new Error('Source module must export catalogValidationSources with corLemmaHasPartOfSpeech and findMisspellings')
  }
  return value as CatalogValidationSources
}

async function readExisting(path: string): Promise<ReviewLine[]> {
  try {
    const text: string = await readFile(path, 'utf8')
    return text.split(/\\r?\\n/u).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        throw new Error(`Existing needs-review file has invalid JSON on line ${index + 1}.`)
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Existing needs-review file has an invalid record on line ${index + 1}.`)
      }
      return parsed as ReviewLine
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const facts = parseFacts(await readFile(args.facts, 'utf8'))
  const batchFacts = facts.slice(args.start, args.start + args.size)
  if (!batchFacts.length) throw new Error('Selected fact batch is empty')

  const output = parseCatalogGeneratorText(await readFile(args.input, 'utf8'))
  const sources = await loadSources(args.sources)
  const result = await validateCatalogBatch(batchFacts, output, sources)
  const batchKey = resolve(args.input)

  const previous = (await readExisting(args.needsReview)).filter((line) => line.batch !== batchKey)
  const failed = result.rows.filter((row) => !row.clean).map((row): ReviewLine => ({
    batch: batchKey,
    index: args.start + row.index,
    lemma: row.lemma,
    output: output[row.index] ?? null,
    failures: row.failures,
  }))
  for (const index of result.extra_rows) {
    failed.push({
      batch: batchKey,
      index: args.start + index,
      lemma: '<unexpected-extra-row>',
      output: output[index] ?? null,
      failures: [{ code: 'batch_length_mismatch', message: `Unexpected output row at batch index ${index}.` }],
    })
  }

  await mkdir(dirname(args.needsReview), { recursive: true })
  const all = [...previous, ...failed]
  await writeFile(args.needsReview, all.length ? `${all.map((line) => JSON.stringify(line)).join('\n')}\n` : '', 'utf8')

  const percent = (result.clean_rate * 100).toFixed(1)
  console.log(`${result.clean_count}/${result.total_count} clean (${percent}%). ${failed.length} row(s) sent to ${args.needsReview}.`)
  if (result.stop) {
    console.error('STOP: batch is below the 95% clean gate.')
    process.exitCode = 2
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Catalog validation failed')
  process.exitCode = 1
})
