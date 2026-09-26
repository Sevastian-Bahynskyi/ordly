import assert from 'node:assert/strict'
import test from 'node:test'
import { addCall, budgetCheck, formatReport, issueAllocation, openingFromRawLog, priceCall, serviceOf, summarize } from './content-ledger.ts'

const budget = { programUsd: 120, since: '2026-09-26', issues: { 27: 3, 28: 12, 29: 12, 30: 78, 17: 15 }, transfers: [] }
const run = (issue, usd, extra = {}) => ({
  run: `r-${issue}-${usd}`, issue, batch: null, command: 'test', startedAt: '2026-09-26T10:00:00Z', updatedAt: '2026-09-26T10:00:00Z', estimateUsd: null,
  lines: [{ service: 'deepseek', op: 'deepseek.review-a', model: 'DeepSeek-V4-Pro', scope: null, calls: 1, inputTokens: 0, outputTokens: 0, chars: 0, seconds: 0, usd }],
  ...extra,
})

test('every paid op belongs to one of the three services', () => {
  assert.equal(serviceOf('deepseek.review-a'), 'deepseek')
  assert.equal(serviceOf('translator.da-uk'), 'translator')
  assert.equal(serviceOf('speech.stt'), 'speech')
  assert.equal(serviceOf('ledger-correction'), 'deepseek')
  assert.throws(() => serviceOf('openai.chat'))
})

test('calls are priced at list price from tokens, characters or seconds', () => {
  assert.equal(priceCall({ op: 'deepseek.generate', inputTokens: 1_000_000, outputTokens: 1_000_000 }).toFixed(2), '5.22')
  assert.equal(priceCall({ op: 'translator.da-en', chars: 1_000_000 }), 10)
  assert.equal(priceCall({ op: 'speech.tts', chars: 1_000_000 }), 15)
  assert.equal(priceCall({ op: 'speech.stt', seconds: 3600 }).toFixed(4), '1.0000')
  // An amount already priced (a correction) is kept as recorded.
  assert.equal(priceCall({ op: 'ledger-correction', usd: 1.2 }), 1.2)
})

test('calls aggregate into one line per op, model and scope', () => {
  const lines = []
  addCall(lines, { op: 'translator.da-en', chars: 40 }, 'family')
  addCall(lines, { op: 'translator.da-en', chars: 60 }, 'family')
  addCall(lines, { op: 'translator.da-en', chars: 10 }, 'entry')
  assert.equal(lines.length, 2)
  const family = lines.find((line) => line.scope === 'family')
  assert.equal(family.calls, 2)
  assert.equal(family.chars, 100)
  assert.equal(family.usd, 0.001)
})

test('the opening balance splits the raw log into #16 and #24 by op', () => {
  const opening = openingFromRawLog([
    { op: 'deepseek.generate', model: 'm', inputTokens: 10, outputTokens: 5, usd: 0.5, at: '2026-09-25T13:00:00Z' },
    { op: 'deepseek.review-uk', model: 'm', inputTokens: 10, outputTokens: 5, usd: 0.25, at: '2026-09-25T20:00:00Z' },
    { op: 'translator.da-uk', chars: 100_000, at: '2026-09-25T20:00:00Z' },
    { op: 'translator.da-en', chars: 100_000, at: '2026-09-25T14:00:00Z' },
    { op: 'ledger-correction', usd: 1.2, note: 'x', at: '2026-09-25T17:00:00Z' },
  ])
  const byIssue = Object.fromEntries(opening.map((record) => [record.issue, record.lines.reduce((sum, line) => sum + line.usd, 0)]))
  assert.equal(byIssue[16].toFixed(2), '2.70')
  assert.equal(byIssue[24].toFixed(2), '1.25')
  // The model's own recorded price stands: it was list price at the time of the call.
  assert.equal(opening.find((record) => record.issue === 16).lines.find((line) => line.op === 'deepseek.generate').usd, 0.5)
})

test('transfers move allocation between issues', () => {
  const moved = { ...budget, transfers: [{ at: '2026-09-27', from: 30, to: 28, usd: 2, note: 'phrases need more review' }] }
  assert.equal(issueAllocation(moved, 28), 14)
  assert.equal(issueAllocation(moved, 30), 76)
  assert.equal(issueAllocation(moved, 16), 0)
})

test('the summary counts program spend separately from the opening balance', () => {
  const summary = summarize([run(16, 10), run(27, 1.5), run(28, 4)], budget)
  assert.equal(summary.program.spent, 5.5)
  assert.equal(summary.program.remaining, 114.5)
  assert.equal(summary.opening, 10)
  assert.equal(summary.byIssue.find((row) => row.issue === 27).remaining, 1.5)
  assert.equal(summary.byService.deepseek, 15.5)
  assert.match(formatReport(summary), /program[^\n]*\$5\.50 of \$120\.00/u)
})

test('a run that would exceed the issue allocation or the program budget is refused', () => {
  const runs = [run(27, 2.5), run(30, 70)]
  assert.equal(budgetCheck(0.4, 27, runs, budget).ok, true)
  const overIssue = budgetCheck(0.6, 27, runs, budget)
  assert.equal(overIssue.ok, false)
  assert.match(overIssue.reasons[0], /#27/u)
  // Program: 120 - 72.5 spent = 47.5 left; the issue has 12 but a 48 run cannot fit either.
  const overProgram = budgetCheck(48, 28, runs, { ...budget, issues: { ...budget.issues, 28: 60 } })
  assert.equal(overProgram.ok, false)
  assert.ok(overProgram.reasons.some((reason) => /program/u.test(reason)))
  assert.equal(budgetCheck(1, 16, runs, budget).ok, false)
})
