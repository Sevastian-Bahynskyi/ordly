import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coverageAtDepths, isExcludedClass, parseRanking, rankingPartOfSpeech } from './catalog-ranking.ts'

const FILE = [
  'sb.\tgulv\t4120',
  'vb.\tvære\t980000',
  'adj.\tsvær\t51000',
  'prop.\tKøbenhavn\t77000',
  'ukendt\tsære\t12',
].join('\n')

test('lemmas are ranked by frequency, not by file order', () => {
  const ranking = parseRanking(FILE)
  assert.deepEqual(ranking.map((entry) => entry.lemma), ['være', 'svær', 'gulv', 'sære'])
  assert.deepEqual(ranking.map((entry) => entry.rank), [1, 2, 3, 4])
})

test('proper nouns are dropped by default and kept on request', () => {
  assert.ok(!parseRanking(FILE).some((entry) => entry.lemma === 'københavn'))
  assert.ok(parseRanking(FILE, { excludeProperNouns: false }).some((entry) => entry.lemma === 'københavn'))
})

test('word classes map onto Ordly parts of speech, unknown ones stay null', () => {
  assert.equal(rankingPartOfSpeech('sb.'), 'noun')
  assert.equal(rankingPartOfSpeech('PRÆP'), 'preposition')
  assert.equal(rankingPartOfSpeech('ukendt'), null)
  assert.ok(isExcludedClass('prop.'))
})

test('a lemma listed twice keeps its highest frequency', () => {
  const ranking = parseRanking(['sb.\tplan\t10', 'sb.\tplan\t900'].join('\n'))
  assert.deepEqual(ranking, [{ lemma: 'plan', pos: 'noun', frequency: 900, rank: 1 }])
})

test('malformed lines are skipped rather than guessed at', () => {
  assert.deepEqual(parseRanking(['sb.\tgulv', 'sb.\thus\tmange', '# comment', ''].join('\n')), [])
})

test('the limit cuts the ranking without renumbering what is kept', () => {
  const ranking = parseRanking(FILE, { limit: 2 })
  assert.deepEqual(ranking.map((entry) => [entry.lemma, entry.rank]), [['være', 1], ['svær', 2]])
})

test('coverage is measured against words actually added', () => {
  const ranking = parseRanking(FILE)
  const coverage = coverageAtDepths(ranking, ['Være', 'gulv', 'badetøj'], [1, 3])
  assert.deepEqual(coverage, [
    { depth: 1, covered: 1, total: 3, rate: 1 / 3 },
    { depth: 3, covered: 2, total: 3, rate: 2 / 3 },
  ])
})
