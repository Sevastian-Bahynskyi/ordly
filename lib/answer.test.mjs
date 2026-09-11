import assert from 'node:assert/strict'
import test from 'node:test'
import { checkAnswer } from './answer.ts'

test('does not accept a different short word or a meaning-changing sentence as a typo', () => {
  assert.equal(checkAnswer('en', 'er'), 'incorrect')
  assert.equal(checkAnswer('Jeg er sikker', 'Jeg er ikke sikker', { sentence: true }), 'incorrect')
  assert.equal(checkAnswer('Jeg synes, det er svært.', 'Jeg synes, det er svært.', { sentence: true }), 'correct')
  assert.equal(checkAnswer('сложно', 'трудно, сложно'), 'correct')
})
