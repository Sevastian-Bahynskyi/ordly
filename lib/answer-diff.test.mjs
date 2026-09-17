import assert from 'node:assert/strict'
import test from 'node:test'
import { diffAnswer } from './answer-diff.ts'
import { checkAnswer } from './answer.ts'

const marked = (parts) => parts.filter((part) => part.changed).map((part) => part.text)

test('a missed word is green in the correction and an extra word is red in the answer', () => {
  const diff = diffAnswer('Ja, Jeg vil have som mælk.', 'Ja tak, jeg vil gerne have mælk.')
  assert.deepEqual(marked(diff.actual), ['J', 'som'])
  assert.deepEqual(marked(diff.expected), ['tak,', 'j', 'gerne'])
  assert.equal(diff.actual.map((part) => part.text).join(''), 'Ja, Jeg vil have som mælk.')
  assert.equal(diff.expected.map((part) => part.text).join(''), 'Ja tak, jeg vil gerne have mælk.')
  assert.equal(diff.identical, false)
})

test('a typo is marked by letter, not by word', () => {
  const diff = diffAnswer('Jeg arbejer i dag', 'Jeg arbejder i dag.')
  assert.deepEqual(marked(diff.actual), [])
  assert.deepEqual(marked(diff.expected), ['d'])
})

test('the same answer, ignoring edge punctuation and the first letter case, is identical', () => {
  assert.equal(diffAnswer('jeg er træt', 'Jeg er træt.').identical, true)
})

test('Danish typing slips are close, while short or meaning-changing differences stay wrong', () => {
  assert.equal(checkAnswer('arbejer', 'arbejder', { sentence: true }), 'mostly')
  assert.equal(checkAnswer('hus', 'hun', { sentence: true }), 'incorrect')
  assert.equal(checkAnswer('Jeg er sikker', 'Jeg er ikke sikker', { sentence: true }), 'incorrect')
  assert.equal(checkAnswer('трудо', 'трудно', { meaning: true }), 'incorrect')
})
