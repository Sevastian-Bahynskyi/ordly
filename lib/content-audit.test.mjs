import assert from 'node:assert/strict'
import test from 'node:test'
import { drawBatchAudit, tallyBatchAudit } from './content-audit.ts'

const items = [
  ...Array.from({ length: 34 }, (_, n) => ({ id: `s${n}`, kind: 'sentence' })),
  ...Array.from({ length: 8 }, (_, n) => ({ id: `m${n}`, kind: 'meaning' })),
  ...Array.from({ length: 8 }, (_, n) => ({ id: `e${n}`, kind: 'example' })),
]

test('the sample is reproducible from its seed and covers every kind', () => {
  const sample = drawBatchAudit(items, { seed: 2701, size: 20 })
  assert.equal(sample.length, 20)
  assert.deepEqual(sample, drawBatchAudit(items, { seed: 2701, size: 20 }))
  assert.notDeepEqual(sample, drawBatchAudit(items, { seed: 2702, size: 20 }))
  for (const kind of ['sentence', 'meaning', 'example']) assert.ok(sample.filter((entry) => entry.kind === kind).length >= 3, kind)
  assert.equal(new Set(sample.map((entry) => entry.id)).size, 20)
  assert.equal(drawBatchAudit(items.slice(0, 5), { seed: 1, size: 20 }).length, 5)
})

test('the audit passes only when every item is judged, 95% are clean and none is severe', () => {
  const sample = drawBatchAudit(items, { seed: 1, size: 20 })
  assert.equal(tallyBatchAudit(sample).complete, false)
  const clean = sample.map((entry) => ({ ...entry, verdict: 'clean' }))
  assert.equal(tallyBatchAudit(clean).pass, true)
  assert.equal(tallyBatchAudit(clean.map((entry, n) => n === 0 ? { ...entry, verdict: 'minor' } : entry)).pass, true)
  assert.equal(tallyBatchAudit(clean.map((entry, n) => n < 2 ? { ...entry, verdict: 'minor' } : entry)).pass, false)
  assert.equal(tallyBatchAudit(clean.map((entry, n) => n === 0 ? { ...entry, verdict: 'severe' } : entry)).pass, false)
})
