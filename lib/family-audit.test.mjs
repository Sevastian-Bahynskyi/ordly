import assert from 'node:assert/strict'
import test from 'node:test'
import { failingStrata, tallyFamilyAudit, unrepairedFindings } from './family-audit.ts'

const item = (id, version, patch = {}) => ({
  id, family_id: 'f', lemma: 'gulv', sense: { ru: 'пол', en: 'floor' }, level: 'A2', situation: 'home', grammar: 'noun-definite',
  source: 'catalog', batch: 'batch-0001.json', frame: '{target}', risk: [],
  variant: { id, version, danish: 'Gulvet er rent.', target: 'gulvet', en: 'The floor is clean.', ru: 'Пол чистый.', orders: [], accepted: [] },
  ...patch,
})

test('a finding is unrepaired only while the judged sentence is unchanged', () => {
  const items = [item('a', 'v1'), item('b', 'v1'), item('c', 'v1')]
  const verdicts = [{ id: 'a', failures: ['ambiguous_gap'] }, { id: 'b', failures: ['unnatural'] }, { id: 'c', failures: [] }]
  // a: untouched; b: translation or accepted answers changed (new version); c: clean.
  const current = new Map([['a', 'v1'], ['b', 'v2'], ['c', 'v1']])
  assert.deepEqual(unrepairedFindings(items, verdicts, current).map((entry) => entry.id), ['a'])
  // A rewritten Danish sentence has a new id, so the judged one is gone.
  assert.deepEqual(unrepairedFindings(items, verdicts, new Map([['c', 'v1']])), [])
})

test('the tally stops a stratum below 95% with enough sentences', () => {
  const items = Array.from({ length: 20 }, (_, n) => item(`s${n}`, 'v'))
  const verdicts = items.map((entry, n) => ({ id: entry.id, failures: n < 2 ? ['ambiguous_gap'] : [] }))
  const rows = tallyFamilyAudit(items, verdicts)
  assert.equal(rows[0].rate, 0.9)
  assert.ok(failingStrata(rows).some((row) => row.stratum === 'overall'))
  assert.ok(!failingStrata(rows).some((row) => row.stratum === 'format: word order'))
})
