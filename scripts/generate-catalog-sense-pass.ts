import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import {
  buildSensePassPrompt,
  parseCatalogFact,
  type CatalogFact,
  type CatalogGeneratedRow,
} from '../lib/catalog-contract'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'
import { OPENROUTER_MODEL_ROUTES } from '../lib/openrouter'

interface IndexEntry {
  batch: string
  start: number
  size: number
}

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

function loadEnv(): void {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u.exec(line)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/gu, '')
    }
  } catch {
    // The explicit key check in main reports the configuration problem.
  }
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices.length) return ''
  const message = (choices[0] as { message?: { content?: unknown } }).message
  return typeof message?.content === 'string' ? message.content.trim() : ''
}

async function generate(prompt: string): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ordly-sevastian-bahynskyis-projects.vercel.app',
      'X-Title': 'Ordly catalog sense pass',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL_ROUTES.senseRefinement[0],
      messages: [
        {
          role: 'system',
          content: 'Follow the user rules exactly. The requested array must be returned as the value of the top-level rows field.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(180000),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`OpenRouter returned ${response.status}: ${detail}`)
  }
  const content = extractContent(await response.json() as unknown)
  if (!content) throw new Error('OpenRouter returned an empty response')
  return JSON.parse(content) as unknown
}

function validateRows(
  value: unknown,
  facts: readonly CatalogFact[],
  existing: ReadonlyMap<string, CatalogGeneratedRow>,
): CatalogGeneratedRow[] {
  if (!value || typeof value !== 'object') throw new Error('Response is not structured JSON')
  const rows = Array.isArray(value) ? value : (value as { rows?: unknown }).rows
  if (!Array.isArray(rows) || rows.length !== facts.length) throw new Error('Response row count does not match the batch')
  return rows.map((row, index) => {
    if (!isGeneratedCatalogRow(row)) throw new Error(`Row ${index + 1} has an invalid shape`)
    const fact = facts[index]
    if (row.lemma !== fact.lemma || row.kind !== fact.kind) throw new Error(`Row ${index + 1} does not match ${fact.lemma}`)
    if (row.pronunciation !== existing.get(row.lemma)?.pronunciation) {
      throw new Error(`Sense pass changed the pronunciation for ${row.lemma}`)
    }
    return row
  })
}

async function main(): Promise<void> {
  loadEnv()
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured')
  const argv = process.argv.slice(2)
  const from = Number(valueAfter(argv, '--from') || '21')
  const through = Number(valueAfter(argv, '--through') || '60')
  const dryRun = argv.includes('--dry-run')
  const chunkSize = Number(valueAfter(argv, '--chunk-size') || '20')
  if (!Number.isInteger(from) || !Number.isInteger(through) || from < 1 || through < from) {
    throw new Error('--from and --through must be an increasing positive batch range')
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('--chunk-size must be a positive integer')

  const facts = (await readFile('catalog/facts.jsonl', 'utf8')).split(/\r?\n/u).filter(Boolean).map((line, index) => {
    const fact = parseCatalogFact(JSON.parse(line) as unknown)
    if (!fact) throw new Error(`Invalid catalog fact at line ${index + 1}`)
    return fact
  })
  const index = JSON.parse(await readFile('catalog/prompts/index.json', 'utf8')) as IndexEntry[]
  const selected = index.slice(from - 1, through)

  for (const [offset, entry] of selected.entries()) {
    const path = `catalog/out/${entry.batch}`
    const current = JSON.parse(await readFile(path, 'utf8')) as unknown[]
    const existing = new Map<string, CatalogGeneratedRow>()
    for (const row of current) if (isGeneratedCatalogRow(row)) existing.set(row.lemma, row)
    const batchFacts = facts.slice(entry.start, entry.start + entry.size)
    const generated: CatalogGeneratedRow[] = []
    for (let start = 0; start < batchFacts.length; start += chunkSize) {
      const chunk = batchFacts.slice(start, start + chunkSize)
      const prompt = buildSensePassPrompt(chunk, existing)
      let completed: CatalogGeneratedRow[] | null = null
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          completed = validateRows(await generate(prompt), chunk, existing)
          break
        } catch (error) {
          if (attempt === 3) throw error
          await new Promise((resolve) => setTimeout(resolve, 4000 * attempt))
        }
      }
      if (!completed) throw new Error(`${entry.batch} returned no rows for chunk ${start + 1}`)
      generated.push(...completed)
    }
    const before = [...existing.values()].filter((row) => row.senses.length > 1).length
    const after = generated.filter((row) => row.senses.length > 1).length
    console.log(`${entry.batch} (${offset + 1}/${selected.length}): ${before} → ${after} rows with multiple senses`)
    if (!dryRun) await writeFile(path, `${JSON.stringify(generated, null, 2)}\n`, 'utf8')
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Catalog sense generation failed')
  process.exitCode = 1
})
