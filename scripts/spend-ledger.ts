/**
 * The committed spend ledger on disk (issue #27; the rules are in `lib/content-ledger.ts`).
 *
 *   catalog/ledger/budget.json     the $120 program, its split between issues, transfers
 *   catalog/ledger/opening.json    what #16 and #24 spent before the program
 *   catalog/ledger/runs/*.json     one record per process that made a paid call
 *
 * Every paid call of this process goes through `recordPaid`, which adds it to this process's run
 * record and writes the file. The issue comes from `CONTENT_ISSUE` (and the batch and unit scope
 * from `CONTENT_BATCH` / `CONTENT_SCOPE`, which the batch pipeline sets for its child processes):
 * a paid call with no issue is refused before it is made, so no dollar goes unattributed.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addCall, issueAllocation, runUsd, summarize, type Budget, type PaidCall, type RunRecord } from '../lib/content-ledger'

export const LEDGER_DIR = join('catalog', 'ledger')
const RUNS_DIR = join(LEDGER_DIR, 'runs')

export async function readBudget(): Promise<Budget> {
  return JSON.parse(await readFile(join(LEDGER_DIR, 'budget.json'), 'utf8')) as Budget
}

/** The opening balance and every run record, oldest first. */
export async function readRuns(): Promise<RunRecord[]> {
  const opening = existsSync(join(LEDGER_DIR, 'opening.json')) ? (JSON.parse(await readFile(join(LEDGER_DIR, 'opening.json'), 'utf8')) as { runs: RunRecord[] }).runs : []
  const files = existsSync(RUNS_DIR) ? (await readdir(RUNS_DIR)).filter((name) => name.endsWith('.json')).sort() : []
  const runs = await Promise.all(files.map(async (name) => JSON.parse(await readFile(join(RUNS_DIR, name), 'utf8')) as RunRecord))
  return [...opening, ...runs]
}

export async function writeBudget(budget: Budget): Promise<void> {
  await writeFile(join(LEDGER_DIR, 'budget.json'), `${JSON.stringify(budget, null, 1)}\n`)
}

// ---- this process's run -----------------------------------------------------

interface RunOptions { issue: number; batch: string | null; command: string; estimateUsd: number | null; capUsd?: number | null }

let current: { record: RunRecord; path: string; capUsd: number | null } | null = null
let scope: string | null = process.env.CONTENT_SCOPE || null
/** Program and issue spend of every other run, refreshed now and then while this one runs. */
let others: { program: number; issue: number; allocation: number; programUsd: number; inProgram: boolean; at: number } | null = null
/** Room kept below every limit for the next call (a DeepSeek review chunk costs about a cent). */
const NEXT_CALL_USD = 0.05
let writing: Promise<void> = Promise.resolve()
let dirty = false

/** The kind of work unit the following calls are for (`entry`, `family`); null for none. */
export function setScope(next: string | null): void {
  scope = next
}

export function currentRun(): RunRecord | null {
  return current?.record ?? null
}

export async function beginRun(options: RunOptions): Promise<RunRecord> {
  if (current) throw new Error('this process already has a run record')
  const startedAt = new Date().toISOString()
  const record: RunRecord = { run: `${startedAt.slice(0, 19).replace(/[:T]/gu, '-')}-i${options.issue}-${options.batch || 'adhoc'}-${process.pid}`, issue: options.issue, batch: options.batch, command: options.command, startedAt, updatedAt: startedAt, estimateUsd: options.estimateUsd, lines: [] }
  current = { record, path: join(RUNS_DIR, `${record.run}.json`), capUsd: options.capUsd ?? null }
  await refreshOthers()
  return record
}

/** A run for a process nobody began one for: an existing stage script run by hand, or a child of the pipeline. */
async function ensureRun(): Promise<NonNullable<typeof current>> {
  if (current) return current
  const issue = Number(process.env.CONTENT_ISSUE)
  if (!Number.isInteger(issue) || issue <= 0) {
    console.error('Refusing a paid call: set CONTENT_ISSUE=<issue number> so its cost is recorded against an issue (docs/content-population.md, "Spend ledger").')
    process.exit(1)
  }
  await beginRun({ issue, batch: process.env.CONTENT_BATCH || null, command: process.argv.slice(1).join(' ').replace(process.cwd(), '.'), estimateUsd: null, capUsd: Number(process.env.CONTENT_RUN_CAP_USD) || null })
  return current as NonNullable<typeof current>
}

async function refreshOthers(): Promise<void> {
  if (!current) return
  const budget = await readBudget()
  const runs = (await readRuns()).filter((record) => record.run !== current?.record.run)
  const summary = summarize(runs, budget)
  const issue = summary.byIssue.find((row) => row.issue === current?.record.issue)
  others = { program: summary.program.spent, issue: issue?.spent ?? 0, allocation: issueAllocation(budget, current.record.issue), programUsd: budget.programUsd, inProgram: String(current.record.issue) in budget.issues, at: Date.now() }
}

/**
 * Before every paid call: stop the process when this run has used up what is left of its issue's
 * allocation or of the program, or passed its own cap. Other runs' spend is re-read every minute,
 * so two runs at once cannot both spend the same remaining dollars for long.
 */
export async function assertBudget(): Promise<void> {
  const run = await ensureRun()
  if (!others || Date.now() - others.at > 60_000) await refreshOthers()
  // The next call must fit too, so the check is made with room for it: a limit is never crossed.
  const spent = runUsd(run.record) + NEXT_CALL_USD
  const limits = others as NonNullable<typeof others>
  const stop = (why: string): never => {
    console.error(`Stopping before the next paid call: ${why}. ${spendLine()}`)
    process.exit(1)
  }
  if (!limits.inProgram) stop(`#${run.record.issue} has no allocation in catalog/ledger/budget.json`)
  if (limits.issue + spent >= limits.allocation) stop(`#${run.record.issue} has spent its allocation of $${limits.allocation.toFixed(2)}`)
  if (limits.program + spent >= limits.programUsd) stop(`the program budget of $${limits.programUsd} is spent — ask before going further`)
  if (run.capUsd !== null && spent >= run.capUsd) stop(`this run reached its cap of $${run.capUsd.toFixed(2)}`)
}

async function flush(): Promise<void> {
  if (!current) return
  dirty = true
  writing = writing.then(async () => {
    if (!dirty || !current) return
    dirty = false
    current.record.updatedAt = new Date().toISOString()
    await mkdir(RUNS_DIR, { recursive: true })
    // Written whole and renamed into place, so a crash never leaves half a record.
    await writeFile(`${current.path}.tmp`, `${JSON.stringify(current.record, null, 1)}\n`)
    await rename(`${current.path}.tmp`, current.path)
  })
  return writing
}

/** Record one paid call against this process's run, at list price. */
export async function recordPaid(call: PaidCall): Promise<void> {
  const run = await ensureRun()
  addCall(run.record.lines, call, scope)
  await flush()
}

export function spendLine(): string {
  if (!current) return 'no paid calls in this process yet'
  const spent = runUsd(current.record)
  const program = others ? ` · program $${(others.program + spent).toFixed(2)} of $${others.programUsd}` : ''
  return `run $${spent.toFixed(4)} for #${current.record.issue}${program}`
}
