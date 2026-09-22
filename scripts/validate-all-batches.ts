/**
 * The §9 gate over a whole run, in one process.
 *
 * `scripts/validate-catalog.ts` checks one batch and asks the register one lemma at a time, which
 * is right for a single batch and hopeless for sixty: every question is a CLI round trip, so a
 * full run costs thousands of them and over an hour. This reads the register once for every lemma
 * the run covers — eight queries — and then answers from memory.
 *
 * The checks themselves are not reimplemented here. It is the same `validateCatalogBatch`, the
 * same fail-closed sources, the same 95% threshold; only the fetching is different.
 *
 *   pnpm exec tsx scripts/validate-all-batches.ts
 *   pnpm exec tsx scripts/validate-all-batches.ts --index catalog/prompts/index.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { corLemmaHasPartOfSpeech as lemmaHasPartOfSpeech } from '../lib/catalog-facts'
import { parseCatalogFact, parseCatalogGeneratorText, type CatalogFact } from '../lib/catalog-contract'
import {
  CATALOG_MIN_CLEAN_RATE,
  isGeneratedCatalogRow,
  validateCatalogBatch,
  type CatalogFailureCode,
  type CatalogValidationSources,
} from '../lib/catalog-validation'
import { corLookupForm, parseCorForms, type CorForm } from '../lib/cor'
import { danishWords } from '../lib/danish-text'
import { findMisspellings as findDanishMisspellings } from '../lib/spelling'
import type { PartOfSpeech } from '../lib/types'
import { literal, queryJson } from './catalog-db'

/** Lemmas per register query. Each one rides in the statement, so this keeps the SQL sane. */
const COR_CHUNK = 400

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

/**
 * Every register row for every lemma in the run, in one pass.
 *
 * A failed chunk throws rather than resolving to nothing: a half-loaded register would answer
 * "this lemma is not in COR" for words it simply never fetched, and reject good rows for a reason
 * that is about the network.
 */
async function loadCorForms(lemmas: readonly string[]): Promise<Map<string, CorForm[]>> {
  const wanted = [...new Set(lemmas.map((lemma) => corLookupForm(lemma)).filter(Boolean))]
  const byForm = new Map<string, CorForm[]>()
  for (let start = 0; start < wanted.length; start += COR_CHUNK) {
    const chunk = wanted.slice(start, start + COR_CHUNK)
    const rows = await queryJson<unknown>(
      `select form, lemma, tag from cor_form where form in (${chunk.map((lemma) => literal(lemma)).join(', ')})`,
    )
    for (const row of parseCorForms(rows)) {
      const existing = byForm.get(row.form)
      if (existing) existing.push(row)
      else byForm.set(row.form, [row])
    }
    // A form the register does not hold is a real answer, not a missing one.
    for (const form of chunk) if (!byForm.has(form)) byForm.set(form, [])
  }
  return byForm
}

/**
 * Every register row for every word used in an example, so the gate can tell that `kan` is a form
 * of `kunne`. Read in one pass for the same reason the lemmas are: a round trip per word would
 * cost tens of thousands of them.
 */
async function loadExampleForms(examples: readonly string[]): Promise<Map<string, string[]>> {
  const tokens = [...new Set(examples.flatMap((example) => danishWords(example)).map(corLookupForm).filter(Boolean))]
  const lemmasByForm = new Map<string, string[]>()
  for (let start = 0; start < tokens.length; start += COR_CHUNK) {
    const chunk = tokens.slice(start, start + COR_CHUNK)
    const rows = await queryJson<unknown>(
      `select distinct form, lemma, tag from cor_form where form in (${chunk.map((token) => literal(token)).join(', ')})`,
    )
    for (const row of parseCorForms(rows)) {
      const existing = lemmasByForm.get(row.form)
      if (existing) {
        if (!existing.includes(row.lemma)) existing.push(row.lemma)
      } else lemmasByForm.set(row.form, [row.lemma])
    }
    for (const token of chunk) if (!lemmasByForm.has(token)) lemmasByForm.set(token, [])
  }
  return lemmasByForm
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const factsPath = valueAfter(argv, '--facts') || 'catalog/facts.jsonl'
  const indexPath = valueAfter(argv, '--index') || 'catalog/prompts/index.json'
  const outDir = valueAfter(argv, '--out') || 'catalog/out'
  const reviewPath = valueAfter(argv, '--needs-review') || 'catalog/needs_review.jsonl'

  const facts = await readFacts(factsPath)
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as IndexEntry[]

  console.log(`Reading the word register for ${facts.length.toLocaleString('en-US')} lemmas …`)
  const corByForm = await loadCorForms(facts.map((fact) => fact.lemma))

  // Every example in the run, so the register can be asked about the words inside them too.
  const examples: string[] = []
  for (const entry of index) {
    try {
      for (const value of parseCatalogGeneratorText(await readFile(`${outDir}/${entry.batch}`, 'utf8'))) {
        if (isGeneratedCatalogRow(value)) for (const sense of value.senses) examples.push(sense.example)
      }
    } catch {
      // A batch that cannot be read is reported per batch below; it contributes no examples.
    }
  }
  console.log(`Reading the word register for the words used in ${examples.length.toLocaleString('en-US')} examples …`)
  const lemmasByForm = await loadExampleForms(examples)

  const sources: CatalogValidationSources = {
    corLemmaHasPartOfSpeech(lemma: string, pos: PartOfSpeech): boolean | null {
      const form = corLookupForm(lemma)
      const rows = corByForm.get(form)
      // Undefined means this run never asked for the lemma, which is not the same as the register
      // saying no. Fail closed, exactly as the per-batch adapter does.
      return rows === undefined ? null : lemmaHasPartOfSpeech(rows, form, pos)
    },
    async findMisspellings(text: string): Promise<string[] | null> {
      const found = await findDanishMisspellings(text)
      return found === null ? null : found.map((misspelling) => misspelling.word)
    },
    exampleContainsLemma(example: string, lemma: string): boolean | null {
      const wanted = corLookupForm(lemma)
      for (const word of danishWords(example)) {
        const form = corLookupForm(word)
        const lemmas = lemmasByForm.get(form)
        // A token this run never fetched cannot be ruled on, and a guess here would be a row
        // accepted for no reason.
        if (lemmas === undefined) return null
        if (lemmas.includes(wanted)) return true
      }
      return false
    },
  }

  const review: string[] = []
  const codeTotals = new Map<CatalogFailureCode, number>()
  let cleanTotal = 0
  let rowTotal = 0
  const failedBatches: string[] = []
  let missing = 0

  for (const entry of index) {
    const path = `${outDir}/${entry.batch}`
    let generated: unknown[]
    try {
      generated = parseCatalogGeneratorText(await readFile(path, 'utf8'))
    } catch (error) {
      const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not generated' : 'unreadable'
      console.log(`${entry.batch.padEnd(20)} — ${reason}`)
      missing += 1
      continue
    }

    const slice = facts.slice(entry.start, entry.start + entry.size)
    const result = await validateCatalogBatch(slice, generated, sources)
    cleanTotal += result.clean_count
    rowTotal += result.total_count
    if (result.stop) failedBatches.push(entry.batch)

    for (const row of result.rows) {
      if (row.clean) continue
      for (const failure of row.failures) codeTotals.set(failure.code, (codeTotals.get(failure.code) || 0) + 1)
      review.push(JSON.stringify({
        batch: entry.batch,
        index: entry.start + row.index,
        lemma: row.lemma,
        output: generated[row.index] ?? null,
        failures: row.failures,
      }))
    }

    const percent = (result.clean_rate * 100).toFixed(1).padStart(5)
    console.log(`${entry.batch.padEnd(20)} ${percent}%  ${result.clean_count}/${result.total_count}${result.stop ? '  ← below the gate' : ''}`)
  }

  await mkdir(dirname(reviewPath), { recursive: true })
  await writeFile(reviewPath, review.length ? `${review.join('\n')}\n` : '', 'utf8')

  const rate = rowTotal ? cleanTotal / rowTotal : 0
  console.log(`\n${cleanTotal}/${rowTotal} rows clean (${(rate * 100).toFixed(1)}%) across ${index.length - missing} batches.`)
  if (missing) console.log(`${missing} batch(es) not generated yet.`)
  if (codeTotals.size) {
    console.log('\nFailures by code:')
    for (const [code, count] of [...codeTotals.entries()].sort((left, right) => right[1] - left[1])) {
      console.log(`  ${String(count).padStart(5)}  ${code}`)
    }
  }
  if (failedBatches.length) {
    console.log(`\nBelow ${(CATALOG_MIN_CLEAN_RATE * 100).toFixed(0)}% clean: ${failedBatches.join(', ')}`)
    process.exitCode = 2
  }
  console.log(`\n${review.length} row(s) written to ${reviewPath}.`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Validation failed')
  process.exitCode = 1
})
