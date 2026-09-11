import test from 'node:test'
import assert from 'node:assert/strict'
import { isPracticeStore, parsePracticeFeedback } from './practice-validation.ts'

test('invalid persisted sessions and unrecognized grading results fail closed', () => {
  assert.equal(isPracticeStore({ revision: 0, session: null, objectives: {} }), true)
  assert.equal(isPracticeStore({ revision: 1, session: { version: 1, queue: [{}] }, objectives: {} }), false)
  assert.equal(isPracticeStore({ revision: 1, session: null, objectives: { target: { card: {} } } }), false)
  assert.equal(parsePracticeFeedback({ result: 'perfect', feedback: 'fine', target: 'yes', communication: 'yes' }), null)
  assert.equal(parsePracticeFeedback({ result: 'ungraded', feedback: 'Needs checking', target: 'uncertain', communication: 'uncertain' }).result, 'ungraded')
})
