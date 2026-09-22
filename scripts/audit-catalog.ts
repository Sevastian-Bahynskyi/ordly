/**
 * Issue #6 step 5: draw a stratified sample of accepted rows, render it to read, and tally the
 * verdicts that come back.
 *
 * The gate has already rejected everything mechanically checkable, so this is looking for the
 * residue: rows that are well-formed and wrong. Nothing here decides anything — it prepares what a
 * person reads and adds up what they concluded.
 *
 *   # draw and render
 *   pnpm exec tsx scripts/audit-catalog.ts --facts catalog/facts.jsonl --out catalog/out
 *
 *   # after filling in `failures` in catalog/audit-verdicts.json
 *   pnpm exec tsx scripts/audit-catalog.ts --tally catalog/audit-verdicts.json
 *
 * Drawing is reproducible: `--seed` goes into the report, so the same sample can be redrawn, or
 * handed to a second reader.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  AUDIT_FAILURE_CLASSES,
  AUDIT_FAILURE_LABELS,
  AUDIT_SAMPLE_SIZE,
  AUDIT_STRATUM_REASONS,
  drawAuditSample,
  tallyAudit,
  type AuditFailureClass,
  type AuditRow,
  type AuditSampleEntry,
  type AuditStratum,
  type AuditVerdict,
} from '../lib/catalog-audit'
import { parseCatalogFact, parseCatalogGeneratorText, type CatalogFact } from '../lib/catalog-contract'
import { isGeneratedCatalogRow } from '../lib/catalog-validation'

/** Separator for the fact key. A lemma cannot contain it, so `word` and `phrase` never collide. */
const KEY_SEPARATOR = String.fromCharCode(0)

function valueAfter(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag)
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null
}

function factKey(lemma: string, kind: string): string {
  return `${lemma}${KEY_SEPARATOR}${kind}`
}

async function readFacts(path: string): Promise<Map<string, CatalogFact>> {
  const text = await readFile(path, 'utf8')
  const facts = new Map<string, CatalogFact>()
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue
    const fact = parseCatalogFact(JSON.parse(line) as unknown)
    if (fact) facts.set(factKey(fact.lemma, fact.kind), fact)
  }
  return facts
}

/**
 * Every generated row that has a fact behind it.
 *
 * A row whose shape is wrong is skipped rather than audited: the gate already sent it to
 * needs_review, and a person's attention is worth more than re-finding what a validator found.
 */
async function readRejected(path: string): Promise<Set<string>> {
  try {
    const text = await readFile(path, 'utf8')
    const rejected = new Set<string>()
    for (const line of text.split(/\r?\n/u)) {
      if (!line.trim()) continue
      const record = JSON.parse(line) as { lemma?: unknown }
      if (typeof record.lemma === 'string') rejected.add(record.lemma)
    }
    return rejected
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set()
    throw error
  }
}

async function readAccepted(
  dir: string,
  facts: Map<string, CatalogFact>,
  rejected: ReadonlySet<string>,
): Promise<AuditRow[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort()
  const rows: AuditRow[] = []
  for (const name of names) {
    const parsed = parseCatalogGeneratorText(await readFile(join(dir, name), 'utf8'))
    for (const value of parsed) {
      if (!isGeneratedCatalogRow(value)) continue
      // A row the gate rejected is not going into the catalog, so reading it here would spend a
      // person's attention on a defect a validator already found and filed.
      if (rejected.has(value.lemma)) continue
      const fact = facts.get(factKey(value.lemma, value.kind))
      if (fact) rows.push({ fact, row: value, batch: basename(name) })
    }
  }
  return rows
}

function renderEntry(entry: AuditSampleEntry, index: number): string {
  const { fact, row } = entry
  const head = [
    `### ${index + 1}. ${fact.lemma}`,
    '',
    `- stratum: **${entry.stratum}** · batch: ${entry.batch}`
      + `${fact.freq_rank === null ? '' : ` · rank ${fact.freq_rank}`}`,
    `- facts: pos \`${fact.pos ?? 'null'}\` · gender \`${fact.gender ?? 'null'}\``
      + `${fact.definite_singular ? ` · definite \`${fact.definite_singular}\`` : ''}`
      + ` · IPA \`${fact.ipa ?? 'null'}\``,
    `- pronunciation: **${row.pronunciation ?? '_(null)_'}**`
      + `${fact.ipa === null && row.pronunciation === null ? ' — correctly silent' : ''}`,
    '',
  ]
  const senses = row.senses.map((sense) => [
    `${sense.ordinal}. **${sense.text}** _(${sense.pos}${sense.gender ? `, ${sense.gender}` : ''})_`,
    `   - ${sense.example}`,
    `   - ${sense.example_translation}`,
  ].join('\n'))
  return [...head, ...senses, '', `_verdict:_ \`${fact.lemma}\``, ''].join('\n')
}

function renderReport(sample: AuditSampleEntry[], total: number, seed: number): string {
  const counts = new Map<AuditStratum, number>()
  for (const entry of sample) counts.set(entry.stratum, (counts.get(entry.stratum) || 0) + 1)
  return [
    '# Catalog audit sample',
    '',
    `${sample.length} of ${total} accepted rows · seed \`${seed}\` · drawn ${new Date().toISOString()}`,
    '',
    'The deterministic gate has already rejected everything mechanically checkable. What is left',
    'to find here is the residue: rows that are **well-formed and wrong**. A translation that is',
    'plausible but not what the word means passes every validator.',
    '',
    '## What to look for',
    '',
    ...AUDIT_FAILURE_CLASSES.map((failure) => `- \`${failure}\` — ${AUDIT_FAILURE_LABELS[failure]}`),
    '',
    '## How this sample was drawn',
    '',
    'Stratified, not uniform. A uniform draw over ten thousand rows is mostly a sample of the',
    'comfortable middle: it returns a reassuring number while under-sampling the shapes that fail.',
    '',
    ...[...counts.entries()].map(([stratum, count]) => `- **${stratum}** (${count}) — ${AUDIT_STRATUM_REASONS[stratum]}`),
    '',
    '## What this can and cannot tell you',
    '',
    `A sample of ${sample.length} measures a rate to within about `
      + `**±${((0.98 / Math.sqrt(sample.length)) * 100).toFixed(1)} points** at worst (95% confidence;`
      + ' tighter when the true rate is low). It says nothing about whether any particular unsampled',
    'row is right. A clean audit is evidence that the generator is not systematically broken — it is',
    'not a certificate over the corpus.',
    '',
    '---',
    '',
    ...sample.map(renderEntry),
  ].join('\n')
}

function parseVerdicts(value: unknown): AuditVerdict[] {
  if (!Array.isArray(value)) throw new Error('The verdict file must be a JSON array')
  const allowed = new Set<string>(AUDIT_FAILURE_CLASSES)
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Verdict ${index + 1} is not an object`)
    const record = item as Record<string, unknown>
    const lemma = typeof record.lemma === 'string' ? record.lemma : ''
    const kind = record.kind === 'phrase' ? 'phrase' as const : 'word' as const
    if (!lemma) throw new Error(`Verdict ${index + 1} has no lemma`)
    const failures = Array.isArray(record.failures) ? record.failures : []
    for (const failure of failures) {
      // An unrecognised class is a typo, and a typo silently dropped is a defect silently dropped.
      if (typeof failure !== 'string' || !allowed.has(failure)) {
        throw new Error(`Verdict for ${lemma} has an unknown failure class ${JSON.stringify(failure)}`)
      }
    }
    return { lemma, kind, failures: failures as AuditFailureClass[] }
  })
}

async function tally(path: string): Promise<void> {
  const result = tallyAudit(parseVerdicts(JSON.parse(await readFile(path, 'utf8')) as unknown))
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`
  console.log(`Reviewed ${result.reviewed} rows — ${result.clean} clean (${percent(result.clean_rate)} ± ${percent(result.margin)}).`)
  if (!result.by_class.length) {
    console.log('No defects recorded.')
  } else {
    console.log('\nBy class:')
    for (const entry of result.by_class) {
      console.log(`  ${percent(entry.rate).padStart(6)}  ${String(entry.count).padStart(3)}  ${entry.failure} — ${AUDIT_FAILURE_LABELS[entry.failure]}`)
    }
  }
  console.log('\nThis measures the generator, not the corpus: it cannot say whether any unsampled row is right.')
  if (result.clean_rate < 0.95) {
    console.error('\nSTOP: below the 95% gate. Diagnose the class with the highest rate before uploading.')
    process.exitCode = 2
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const tallyPath = valueAfter(argv, '--tally')
  if (tallyPath) return tally(tallyPath)

  const factsPath = valueAfter(argv, '--facts') || 'catalog/facts.jsonl'
  const outDir = valueAfter(argv, '--out') || 'catalog/out'
  const reportPath = valueAfter(argv, '--report') || 'catalog/audit-sample.md'
  const verdictPath = valueAfter(argv, '--verdicts') || 'catalog/audit-verdicts.json'
  const reviewPath = valueAfter(argv, '--needs-review') || 'catalog/needs_review.jsonl'
  const rawSize = valueAfter(argv, '--size')
  const size = rawSize === null ? AUDIT_SAMPLE_SIZE : Number(rawSize)
  const rawSeed = valueAfter(argv, '--seed')
  const seed = rawSeed === null ? 1 : Number(rawSeed)
  if (!Number.isInteger(size) || size < 1) throw new Error('--size must be a positive integer')
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer')

  const facts = await readFacts(factsPath)
  const accepted = await readAccepted(outDir, facts, await readRejected(reviewPath))
  if (!accepted.length) throw new Error(`No accepted rows found in ${outDir}`)

  const sample = drawAuditSample(accepted, { size, seed })
  await mkdir('catalog', { recursive: true })
  await writeFile(reportPath, renderReport(sample, accepted.length, seed), 'utf8')
  // Pre-filled with empty verdicts, so reading the report is the only work: add failure classes
  // to the rows that have them and leave the rest alone.
  await writeFile(verdictPath, `${JSON.stringify(
    sample.map((entry) => ({ lemma: entry.fact.lemma, kind: entry.fact.kind, stratum: entry.stratum, failures: [] })),
    null,
    2,
  )}\n`, 'utf8')

  console.log(`Sampled ${sample.length} of ${accepted.length} accepted rows (seed ${seed}).`)
  console.log(`Read: ${reportPath}`)
  console.log(`Record verdicts in: ${verdictPath}, then re-run with --tally ${verdictPath}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Audit failed')
  process.exitCode = 1
})
