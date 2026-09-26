/**
 * The content program's spend: report, opening balance and transfers (issue #27).
 *
 *   pnpm exec tsx scripts/content-ledger.ts                      # report: per service, per issue, against $120
 *   pnpm exec tsx scripts/content-ledger.ts --batches            # also each batch's estimate against its spend
 *   pnpm exec tsx scripts/content-ledger.ts --transfer --from 30 --to 28 --usd 2 --note "why"
 *   pnpm exec tsx scripts/content-ledger.ts --profile catalog/pipeline/calibration-0001,catalog/pipeline/calibration-0002   # estimates from measured batches
 *   pnpm exec tsx scripts/content-ledger.ts --opening catalog/families/azure-usage.json   # once: #16/#24 balance
 *
 * Reads only committed files (`catalog/ledger/`); never calls a paid service.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { profileFromRuns } from '../lib/content-estimate'
import { formatReport, openingFromRawLog, runUsd, summarize, type PaidCall, type RunRecord } from '../lib/content-ledger'
import { LEDGER_DIR, readBudget, readRuns, writeBudget } from './spend-ledger'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)

const openingPath = option('--opening')
if (openingPath) {
  const raw = JSON.parse(await readFile(openingPath, 'utf8')) as { calls: (PaidCall & { at: string; note?: string })[] }
  const runs = openingFromRawLog(raw.calls)
  const note = 'Spend before the content program (2026-09-26), rebuilt from the local per-call log of #16 and #24 (catalog/families/azure-usage.json, not committed). Ukrainian ops are #24, the rest #16. DeepSeek at the price recorded per call; Translator and Speech priced at the list prices in lib/content-ledger.ts.'
  await writeFile(join(LEDGER_DIR, 'opening.json'), `${JSON.stringify({ note, calls: raw.calls.length, runs }, null, 1)}\n`)
  for (const record of runs) console.log(`#${record.issue}: $${runUsd(record).toFixed(2)} over ${record.lines.reduce((sum, line) => sum + line.calls, 0)} calls`)
  process.exit(0)
}

const profileBatch = option('--profile')
if (profileBatch) {
  // The measured batches' spend per unit becomes the profile every estimate scales.
  const counts = { entry: { units: 0, items: {} as Record<string, number> }, family: { units: 0, items: {} as Record<string, number> } }
  const names: string[] = []
  for (const batchDir of profileBatch.split(',')) {
    const spec = JSON.parse(await readFile(join(batchDir, 'batch.json'), 'utf8')) as { name: string; entries: unknown[]; families: unknown[] }
    const outcomes = JSON.parse(await readFile(join(batchDir, 'outcome.json'), 'utf8')) as { kind: string; unit: string }[]
    names.push(spec.name)
    counts.entry.units += spec.entries.length
    counts.family.units += spec.families.length
    for (const outcome of outcomes) {
      const bucket = outcome.unit.startsWith('entry:') ? counts.entry : counts.family
      bucket.items[outcome.kind] = (bucket.items[outcome.kind] ?? 0) + 1
    }
  }
  const runs = (await readRuns()).filter((record) => record.batch !== null && names.includes(record.batch))
  const profile = profileFromRuns(runs, counts, names.join('+'))
  await writeFile(join(LEDGER_DIR, 'profile.json'), `${JSON.stringify(profile, null, 1)}\n`)
  console.log(`profile ← ${names.join(' + ')}: ${counts.entry.units} entries, ${counts.family.units} families, ${runs.length} run record(s)`)
  process.exit(0)
}

if (argv.includes('--transfer')) {
  const from = Number(option('--from'))
  const to = Number(option('--to'))
  const usd = Number(option('--usd'))
  const note = option('--note')
  const budget = await readBudget()
  if (!(String(from) in budget.issues) || !(String(to) in budget.issues) || !(usd > 0) || !note) {
    console.error(`Usage: --transfer --from <issue> --to <issue> --usd <amount> --note "<why>"; issues: ${Object.keys(budget.issues).join(', ')}`)
    process.exit(1)
  }
  const summary = summarize(await readRuns(), budget)
  const left = summary.byIssue.find((row) => row.issue === from)?.remaining ?? 0
  if (usd > left) {
    console.error(`#${from} has only $${left.toFixed(2)} left to move.`)
    process.exit(1)
  }
  budget.transfers.push({ at: new Date().toISOString(), from, to, usd, note })
  await writeBudget(budget)
  console.log(`Moved $${usd.toFixed(2)} from #${from} to #${to}.`)
}

const budget = await readBudget()
const runs = await readRuns()
console.log(formatReport(summarize(runs, budget)))
if (budget.transfers.length) {
  console.log('\ntransfers:')
  for (const transfer of budget.transfers) console.log(`  ${transfer.at.slice(0, 10)}  $${transfer.usd.toFixed(2)} #${transfer.from} → #${transfer.to}  ${transfer.note}`)
}
if (argv.includes('--batches')) {
  const batches = new Map<string, RunRecord[]>()
  for (const record of runs) if (record.batch) batches.set(record.batch, [...(batches.get(record.batch) || []), record])
  console.log('\nbatches (estimate → actual):')
  for (const [batch, records] of batches) {
    const estimate = records.find((record) => record.estimateUsd !== null)?.estimateUsd ?? null
    const actual = records.reduce((sum, record) => sum + runUsd(record), 0)
    const error = estimate ? ` (${(((actual - estimate) / estimate) * 100).toFixed(1)}%)` : ''
    console.log(`  #${records[0].issue} ${batch}: ${estimate === null ? 'no estimate' : `$${estimate.toFixed(4)}`} → $${actual.toFixed(4)}${error}`)
  }
}
