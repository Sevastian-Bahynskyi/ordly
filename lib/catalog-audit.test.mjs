import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drawAuditSample, seededRandom, shuffled, strataOf, tallyAudit } from './catalog-audit.ts'

function row(lemma, overrides = {}, senses = 1) {
  const fact = {
    lemma,
    kind: 'word',
    freq_rank: 500,
    pos: 'noun',
    gender: 'et',
    definite_singular: null,
    indefinite_plural: null,
    ipa: '[ˈɡɔlˀ]',
    ...overrides,
  }
  return {
    fact,
    batch: overrides.batch || 'batch-0001.json',
    row: {
      lemma,
      kind: fact.kind,
      pronunciation: 'гол',
      senses: Array.from({ length: senses }, (_, index) => ({
        ordinal: index + 1,
        text: 'пол',
        pos: 'noun',
        gender: 'et',
        example: 'Bogen ligger på gulvet.',
        example_translation: 'Книга лежит на полу.',
      })),
    },
  }
}

test('the same seed draws the same sample, so an audit can be redone', () => {
  const rows = Array.from({ length: 60 }, (_, index) => row(`ord${index}`, { freq_rank: index + 1 }))
  const first = drawAuditSample(rows, { size: 20, seed: 7 }).map((entry) => entry.fact.lemma)
  const second = drawAuditSample(rows, { size: 20, seed: 7 }).map((entry) => entry.fact.lemma)
  const other = drawAuditSample(rows, { size: 20, seed: 8 }).map((entry) => entry.fact.lemma)
  assert.deepEqual(first, second)
  assert.notDeepEqual(first, other)
})

test('a row is filed under its rarest stratum, not its most obvious one', () => {
  assert.deepEqual(strataOf(row('ved', { pos: null, freq_rank: 9500 }), 9000)[0], 'pos_unsettled')
  assert.deepEqual(strataOf(row('godt lide', { kind: 'phrase', freq_rank: null, ipa: null }), 9000)[0], 'phrase')
  assert.deepEqual(strataOf(row('hus', { freq_rank: 20 }), 9000)[0], 'head')
  assert.deepEqual(strataOf(row('midt', { freq_rank: 4000 }), 9000), ['general'])
})

test('the strata a uniform draw would miss are actually sampled', () => {
  const rows = [
    ...Array.from({ length: 300 }, (_, index) => row(`middle${index}`, { freq_rank: 3000 + index })),
    ...Array.from({ length: 12 }, (_, index) => row(`unsettled${index}`, { pos: null, freq_rank: 4000 + index })),
    ...Array.from({ length: 12 }, (_, index) => row(`silent${index}`, { ipa: null, freq_rank: 4100 + index })),
  ]
  const sample = drawAuditSample(rows, { size: 50, seed: 3 })
  assert.ok(sample.some((entry) => entry.stratum === 'pos_unsettled'))
  assert.ok(sample.some((entry) => entry.stratum === 'no_ipa'))
})

test('the tail is the last tenth of what was built, not a fixed rank', () => {
  const rows = Array.from({ length: 100 }, (_, index) => row(`ord${index}`, { freq_rank: index + 1 }))
  const sample = drawAuditSample(rows, { size: 40, seed: 5 })
  const tail = sample.filter((entry) => entry.stratum === 'tail')
  assert.ok(tail.length > 0)
  assert.ok(tail.every((entry) => entry.fact.freq_rank >= 90))
})

test('a thin stratum contributes what it has and the sample is still full', () => {
  const rows = Array.from({ length: 80 }, (_, index) => row(`ord${index}`, { freq_rank: index + 1 }))
  assert.equal(drawAuditSample(rows, { size: 30, seed: 2 }).length, 30)
})

test('the sample never exceeds the corpus and never repeats a row', () => {
  const rows = Array.from({ length: 10 }, (_, index) => row(`ord${index}`, { freq_rank: index + 1 }))
  const sample = drawAuditSample(rows, { size: 40, seed: 1 })
  assert.equal(sample.length, 10)
  assert.equal(new Set(sample.map((entry) => entry.fact.lemma)).size, 10)
})

test('an invalid size is refused rather than silently corrected', () => {
  assert.throws(() => drawAuditSample([], { size: 0 }), /positive integer/u)
})

test('the tally reports rates per failure class, with a margin', () => {
  const verdicts = [
    { lemma: 'a', kind: 'word', failures: [] },
    { lemma: 'b', kind: 'word', failures: ['translation_wrong'] },
    { lemma: 'c', kind: 'word', failures: ['translation_wrong', 'level_drift'] },
    { lemma: 'd', kind: 'word', failures: [] },
  ]
  const tally = tallyAudit(verdicts)
  assert.equal(tally.reviewed, 4)
  assert.equal(tally.clean, 2)
  assert.equal(tally.clean_rate, 0.5)
  assert.ok(tally.margin > 0.4 && tally.margin < 0.5)
  assert.deepEqual(tally.by_class.map((entry) => [entry.failure, entry.count]), [
    ['translation_wrong', 2],
    ['level_drift', 1],
  ])
})

test('an empty audit claims nothing', () => {
  assert.deepEqual(tallyAudit([]), { reviewed: 0, clean: 0, clean_rate: 0, margin: 1, by_class: [] })
})

test('the shuffle is a permutation, not a filter', () => {
  const items = [1, 2, 3, 4, 5]
  assert.deepEqual([...shuffled(items, seededRandom(4))].sort(), items)
})
