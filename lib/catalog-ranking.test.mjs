import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coverageAtDepths, isExcludedClass, parseRanking, rankingPartOfSpeech } from './catalog-ranking.ts'

// The real shape: one-letter class, lemma, and a frequency that is a proportion of the corpus.
const FILE = [
  'NC\tgulv\t0.0000412',
  'V\tvære\t0.0309255',
  'A\tsvær\t0.0005100',
  'NP\tKøbenhavn\t0.0007700',
  'NW\tVM\t0.0000300',
  'M\t@erne\t0.0004000',
  'Z\tsære\t0.0000012',
].join('\n')

test('lemmas are ranked by frequency, not by file order', () => {
  const ranking = parseRanking(FILE)
  assert.deepEqual(ranking.map((entry) => entry.lemma), ['være', 'svær', 'gulv', 'sære'])
  assert.deepEqual(ranking.map((entry) => entry.rank), [1, 2, 3, 4])
  assert.deepEqual(ranking.map((entry) => entry.pos), ['verb', 'adjective', 'noun', null])
})

test('proper nouns are dropped by default and kept on request', () => {
  assert.ok(!parseRanking(FILE).some((entry) => entry.lemma === 'københavn'))
  assert.ok(parseRanking(FILE, { excludeProperNouns: false }).some((entry) => entry.lemma === 'københavn'))
})

test('word classes map onto Ordly parts of speech, unknown ones stay null', () => {
  assert.equal(rankingPartOfSpeech('NC'), 'noun')
  assert.equal(rankingPartOfSpeech('T'), 'preposition')
  assert.equal(rankingPartOfSpeech('Z'), null)
  assert.ok(isExcludedClass('NP'))
})

test('proper nouns, morphemes and every fragment class are excluded', () => {
  assert.ok(isExcludedClass('NP'))
  assert.ok(isExcludedClass('M'))
  assert.ok(isExcludedClass('U'))
  assert.ok(isExcludedClass('NW'))
  assert.ok(isExcludedClass('EW'))
  assert.ok(!isExcludedClass('NC'))
  assert.ok(!isExcludedClass('V'))
})

test('an affix is not a word, whatever class it is filed under', () => {
  assert.deepEqual(parseRanking(['NC\tanti@\t0.9', 'NC\t@erne\t0.8'].join('\n')), [])
})

test('a lemma listed twice keeps its highest frequency', () => {
  const ranking = parseRanking(['NC\tplan\t0.001', 'V\tplan\t0.009'].join('\n'))
  assert.deepEqual(ranking, [{ lemma: 'plan', pos: 'verb', frequency: 0.009, rank: 1 }])
})

test('malformed lines are skipped rather than guessed at', () => {
  assert.deepEqual(parseRanking(['NC\tgulv', 'NC\thus\tmange', '# comment', ''].join('\n')), [])
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
