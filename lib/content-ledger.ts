/**
 * The committed spend ledger of the offline content pipeline (issue #27).
 *
 * Every paid call the pipeline makes is priced at list price and added to the record of the run
 * that made it (`catalog/ledger/runs/<run>.json`, one file per process, so concurrent runs never
 * write the same file). A run belongs to one issue. `catalog/ledger/opening.json` holds what #16
 * and #24 spent before the program began, and `catalog/ledger/budget.json` the program budget, its
 * split between issues and every transfer between them. No keys, no learner data: only
 * services, models, quantities and prices.
 */

export type Service = 'deepseek' | 'translator' | 'speech'

/**
 * List prices, pay-as-you-go, USD (checked 2026-09-26). DeepSeek-V4-Pro on Azure AI Foundry per
 * token; Azure Translator S1 standard translation per character; Azure Speech neural text to
 * speech per character and standard speech to text (pronunciation assessment bills the same) per
 * audio second. Free-tier allowances are ignored on purpose: the ledger answers "what did this
 * cost at list price", so a month's free quota running out never changes the numbers.
 */
export const PRICES = {
  checked: '2026-09-26',
  deepseek: { model: 'DeepSeek-V4-Pro', inputPerToken: 1.74 / 1_000_000, outputPerToken: 3.48 / 1_000_000 },
  translatorPerChar: 10 / 1_000_000,
  ttsPerChar: 15 / 1_000_000,
  sttPerSecond: 1 / 3600,
} as const

/** One paid call as a client reports it. `usd` is only for an amount already priced (a correction). */
export interface PaidCall {
  op: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  chars?: number
  seconds?: number
  usd?: number
}

/** Calls of one op, model and scope within a run, summed. */
export interface LedgerLine {
  service: Service
  op: string
  model: string | null
  /** The kind of work unit the calls were made for (`entry`, `family`), for per-unit estimates. */
  scope: string | null
  calls: number
  inputTokens: number
  outputTokens: number
  chars: number
  seconds: number
  usd: number
}

export interface RunRecord {
  run: string
  issue: number
  batch: string | null
  command: string
  startedAt: string
  updatedAt: string
  /** What the pre-run estimate said this run would cost, when there was one. */
  estimateUsd: number | null
  note?: string
  lines: LedgerLine[]
}

export interface Transfer { at: string; from: number; to: number; usd: number; note: string }

export interface Budget {
  programUsd: number
  /** Spend before this date is the opening balance, outside the program. */
  since: string
  /** Planned USD per issue; the program's issues are exactly these keys. */
  issues: Record<string, number>
  transfers: Transfer[]
}

export function serviceOf(op: string): Service {
  if (op.startsWith('deepseek.') || op === 'ledger-correction') return 'deepseek'
  if (op.startsWith('translator.')) return 'translator'
  if (op.startsWith('speech.')) return 'speech'
  throw new Error(`"${op}" is not a paid op of the content pipeline (deepseek.*, translator.*, speech.*)`)
}

export function priceCall(call: PaidCall): number {
  if (typeof call.usd === 'number' && !call.inputTokens && !call.outputTokens && !call.chars && !call.seconds) return call.usd
  switch (serviceOf(call.op)) {
    case 'deepseek': return (call.inputTokens ?? 0) * PRICES.deepseek.inputPerToken + (call.outputTokens ?? 0) * PRICES.deepseek.outputPerToken
    case 'translator': return (call.chars ?? 0) * PRICES.translatorPerChar
    case 'speech': return (call.chars ?? 0) * PRICES.ttsPerChar + (call.seconds ?? 0) * PRICES.sttPerSecond
  }
}

const round = (value: number): number => Math.round(value * 1e8) / 1e8

/** Add one call to a run's lines (in place), priced at list price unless `usd` is given. */
export function addCall(lines: LedgerLine[], call: PaidCall, scope: string | null = null, usd = priceCall(call)): LedgerLine[] {
  const service = serviceOf(call.op)
  const model = call.model ?? null
  let line = lines.find((entry) => entry.op === call.op && entry.model === model && entry.scope === scope)
  if (!line) {
    line = { service, op: call.op, model, scope, calls: 0, inputTokens: 0, outputTokens: 0, chars: 0, seconds: 0, usd: 0 }
    lines.push(line)
  }
  line.calls += 1
  line.inputTokens += call.inputTokens ?? 0
  line.outputTokens += call.outputTokens ?? 0
  line.chars += call.chars ?? 0
  line.seconds = round(line.seconds + (call.seconds ?? 0))
  line.usd = round(line.usd + usd)
  return lines
}

export function runUsd(record: Pick<RunRecord, 'lines'>): number {
  return round(record.lines.reduce((sum, line) => sum + line.usd, 0))
}

/**
 * The spend of #16 and #24 from the old local per-call log (`catalog/families/azure-usage.json`).
 * Ukrainian work (#24) is every op with a Ukrainian leg; everything else was #16. DeepSeek calls
 * keep the price they were recorded with (list price then, the same as now); Translator and
 * Speech calls were logged as quantities only, and are priced here.
 */
export function openingFromRawLog(calls: readonly (PaidCall & { at: string; note?: string })[]): RunRecord[] {
  const records = new Map<number, RunRecord>()
  for (const call of calls) {
    const issue = /(^|[.-])uk($|[.-])/u.test(call.op) ? 24 : 16
    let record = records.get(issue)
    if (!record) {
      record = { run: `opening-${issue}`, issue, batch: null, command: 'opening balance from catalog/families/azure-usage.json', startedAt: call.at, updatedAt: call.at, estimateUsd: null, lines: [] }
      records.set(issue, record)
    }
    if (call.at < record.startedAt) record.startedAt = call.at
    if (call.at > record.updatedAt) record.updatedAt = call.at
    const usd = serviceOf(call.op) === 'deepseek' && typeof call.usd === 'number' ? call.usd : priceCall(call)
    addCall(record.lines, { ...call, usd: undefined }, null, usd)
    if (call.note) record.note = call.note
  }
  return [...records.values()].sort((a, b) => a.issue - b.issue)
}

export function issueAllocation(budget: Budget, issue: number): number {
  const planned = budget.issues[String(issue)] ?? 0
  const moved = budget.transfers.reduce((sum, transfer) => sum + (transfer.to === issue ? transfer.usd : 0) - (transfer.from === issue ? transfer.usd : 0), 0)
  return round(planned + moved)
}

export interface IssueRow { issue: number; allocated: number; spent: number; remaining: number; runs: number }
export interface LedgerSummary {
  byService: Record<Service, number>
  byIssue: IssueRow[]
  /** #16 and #24: spent before the program, not counted against it. */
  opening: number
  program: { budget: number; spent: number; remaining: number }
}

export function summarize(runs: readonly RunRecord[], budget: Budget): LedgerSummary {
  const byService: Record<Service, number> = { deepseek: 0, translator: 0, speech: 0 }
  const spentByIssue = new Map<number, { spent: number; runs: number }>()
  for (const record of runs) {
    for (const line of record.lines) byService[line.service] = round(byService[line.service] + line.usd)
    const row = spentByIssue.get(record.issue) || { spent: 0, runs: 0 }
    row.spent = round(row.spent + runUsd(record))
    row.runs += 1
    spentByIssue.set(record.issue, row)
  }
  const programIssues = new Set(Object.keys(budget.issues).map(Number))
  const issues = [...new Set([...programIssues, ...spentByIssue.keys()])].sort((a, b) => a - b)
  const byIssue = issues.map((issue) => {
    const allocated = programIssues.has(issue) ? issueAllocation(budget, issue) : 0
    const { spent, runs: count } = spentByIssue.get(issue) || { spent: 0, runs: 0 }
    return { issue, allocated, spent, remaining: round(allocated - spent), runs: count }
  })
  const spent = round(byIssue.filter((row) => programIssues.has(row.issue)).reduce((sum, row) => sum + row.spent, 0))
  const opening = round(byIssue.filter((row) => !programIssues.has(row.issue)).reduce((sum, row) => sum + row.spent, 0))
  return { byService, byIssue, opening, program: { budget: budget.programUsd, spent, remaining: round(budget.programUsd - spent) } }
}

export interface BudgetDecision { ok: boolean; reasons: string[]; issueRemaining: number; programRemaining: number }

/** Whether a run estimated at `estimateUsd` for `issue` may start. */
export function budgetCheck(estimateUsd: number, issue: number, runs: readonly RunRecord[], budget: Budget): BudgetDecision {
  const summary = summarize(runs, budget)
  const row = summary.byIssue.find((entry) => entry.issue === issue)
  const reasons: string[] = []
  if (!(String(issue) in budget.issues)) reasons.push(`#${issue} is not an issue of the program (${Object.keys(budget.issues).map((key) => `#${key}`).join(', ')})`)
  const issueRemaining = row ? row.remaining : 0
  if (estimateUsd > issueRemaining) reasons.push(`estimate $${estimateUsd.toFixed(2)} exceeds what is left for #${issue}: $${issueRemaining.toFixed(2)} (move money with a recorded transfer)`)
  if (estimateUsd > summary.program.remaining) reasons.push(`estimate $${estimateUsd.toFixed(2)} exceeds what is left of the $${budget.programUsd} program: $${summary.program.remaining.toFixed(2)} — stop and ask`)
  return { ok: reasons.length === 0, reasons, issueRemaining, programRemaining: summary.program.remaining }
}

const usd = (value: number): string => `$${value.toFixed(2)}`

export function formatReport(summary: LedgerSummary): string {
  const lines = [
    `program: ${usd(summary.program.spent)} of ${usd(summary.program.budget)} spent, ${usd(summary.program.remaining)} left`,
    `opening balance (before the program): ${usd(summary.opening)}`,
    '',
    'by service (all spend):',
    ...Object.entries(summary.byService).map(([service, value]) => `  ${service.padEnd(10)} ${usd(value)}`),
    '',
    'by issue:',
    ...summary.byIssue.map((row) => row.allocated
      ? `  #${String(row.issue).padEnd(4)} ${usd(row.spent).padStart(8)} of ${usd(row.allocated).padStart(8)}  ${usd(row.remaining).padStart(8)} left  (${row.runs} run${row.runs === 1 ? '' : 's'})`
      : `  #${String(row.issue).padEnd(4)} ${usd(row.spent).padStart(8)}  opening balance`),
  ]
  return lines.join('\n')
}
