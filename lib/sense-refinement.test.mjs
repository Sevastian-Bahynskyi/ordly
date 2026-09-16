import assert from 'node:assert/strict'
import test from 'node:test'
import { applyRefinement, needsRefinement, parseRefinedMeanings } from './sense-refinement.ts'
import { translationFromSenses } from './senses.ts'

/** D11 phase 2: refinement runs without a preview, so it must never change what review grades. */

function sense(id, text, patch = {}) {
  return { id, text, pos: null, gender: null, note: null, example: null, example_translation: null, source: 'split', coverage: { recognized: 0, produced: 0, last_seen: null }, created_at: '2026-09-01T12:00:00Z', removed_at: null, ...patch }
}

const now = '2026-09-16T12:00:00.000Z'

test('only entries with unclassified split senses are queued', () => {
  assert.equal(needsRefinement([sense('a', 'дом')]), true)
  assert.equal(needsRefinement([sense('a', 'дом', { source: 'ai' })]), false)
  assert.equal(needsRefinement([sense('a', 'дом', { removed_at: now })]), false)
  assert.equal(needsRefinement('not an array'), false)
})

test('the model output is validated, not trusted', () => {
  const meanings = parseRefinedMeanings({ meanings: [
    { indices: [2, 1, 1, 9, 0], pos: 'noun', gender: 'et' },
    { indices: [], pos: 'verb', gender: '' },
    { indices: [3], pos: 'adjective', gender: 'en' },
    { indices: [3], pos: 'bogus', gender: '' },
  ] }, 3)
  assert.deepEqual(meanings, [
    { indices: [1, 2], pos: 'noun', gender: 'et' },
    { indices: [3], pos: 'adjective', gender: null },
    { indices: [3], pos: null, gender: null },
  ])
  assert.deepEqual(parseRefinedMeanings({ meanings: 'x' }, 3), [])
})

test('grammar is filled, fragments re-join, and the translation string is unchanged', () => {
  const stored = [sense('a', 'в том числе'), sense('b', 'включая'), sense('c', 'также'), sense('gone', 'старое', { removed_at: '2026-09-01T00:00:00Z' })]
  const before = translationFromSenses(stored)
  const refined = applyRefinement(stored, [
    { indices: [1, 2], pos: 'phrase', gender: null },
    { indices: [3], pos: 'adverb', gender: 'en' },
  ], now)

  assert.equal(translationFromSenses(refined), before, 'review grades against this string; refinement must not move it')
  assert.deepEqual(refined.map((item) => [item.id, item.text, item.pos, item.gender, item.source, item.removed_at]), [
    ['a', 'в том числе, включая', 'phrase', null, 'ai', null],
    ['b', 'включая', null, null, 'split', now],
    ['c', 'также', 'adverb', null, 'ai', null],
    ['gone', 'старое', null, null, 'split', '2026-09-01T00:00:00Z'],
  ])
})

test('a group is refused unless its members are adjacent split fragments', () => {
  const stored = [sense('a', 'думать'), sense('u', 'считать', { source: 'user' }), sense('c', 'полагать')]
  const refined = applyRefinement(stored, [{ indices: [1, 3], pos: 'verb', gender: null }, { indices: [1, 2], pos: 'verb', gender: null }], now)
  assert.deepEqual(refined.map((item) => [item.id, item.text, item.pos, item.source, item.removed_at]), [
    ['a', 'думать', 'verb', 'ai', null],
    ['u', 'считать', null, 'user', null],
    ['c', 'полагать', 'verb', 'ai', null],
  ], 'non-adjacent members are classified one by one, and a learner-written sense is never touched')
})

test('an unanswered split sense still leaves the queue, so it is not retried on every page view', () => {
  const refined = applyRefinement([sense('a', 'дом'), sense('b', 'здание')], [{ indices: [1], pos: 'noun', gender: 'et' }], now)
  assert.deepEqual(refined.map((item) => [item.pos, item.gender, item.source]), [['noun', 'et', 'ai'], [null, null, 'ai']])
  assert.equal(needsRefinement(refined), false)
})
