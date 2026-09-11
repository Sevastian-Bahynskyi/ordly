import assert from 'node:assert/strict'
import test from 'node:test'
import { checkAnswer } from './answer.ts'
import { normalizeMeaningFeedback } from './practice-ai.ts'

test('does not accept a different short word or a meaning-changing sentence as a typo', () => {
  assert.equal(checkAnswer('en', 'er'), 'incorrect')
  assert.equal(checkAnswer('Jeg er sikker', 'Jeg er ikke sikker', { sentence: true }), 'incorrect')
  assert.equal(checkAnswer('Jeg synes, det er svært.', 'Jeg synes, det er svært.', { sentence: true }), 'correct')
  assert.equal(checkAnswer('сложно', 'трудно, сложно'), 'correct')
})

test('accepts Cyrillic spelling variants for meaning recall without weakening Danish checks', () => {
  assert.equal(checkAnswer('обяснять', 'объяснять', { meaning: true }), 'correct')
  assert.equal(checkAnswer('все еще', 'всё ещё', { meaning: true }), 'correct')
  assert.equal(checkAnswer('не знаю', 'знаю', { meaning: true }), 'incorrect')
  assert.equal(checkAnswer('en', 'er'), 'incorrect')
})

test('meaning recall accepts understood wording without imposing a Danish production target', () => {
  const feedback = { result: 'mostly', communication: 'yes', target: 'no', feedback: 'Use å instead of a.' }
  assert.deepEqual(normalizeMeaningFeedback(feedback, 'recall'), {
    result: 'correct', communication: 'yes', target: 'yes', feedback: 'Meaning recalled. Your wording is accepted.',
  })
  assert.deepEqual(normalizeMeaningFeedback(feedback, 'produce'), feedback)
  const wrong = { ...feedback, result: 'incorrect', communication: 'no' }
  assert.deepEqual(normalizeMeaningFeedback(wrong, 'recall'), wrong)
})
