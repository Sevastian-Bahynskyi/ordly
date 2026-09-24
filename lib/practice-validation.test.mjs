import test from 'node:test'
import assert from 'node:assert/strict'
import { isPracticeSession, parsePracticeRequest } from './practice-validation.ts'

test('start requires a whole-minute target from 1 to 30', () => {
  assert.deepEqual(parsePracticeRequest({ action: 'start', minutes: 10 }), { kind: 'start', minutes: 10, acceptShorter: false })
  assert.deepEqual(parsePracticeRequest({ action: 'start', minutes: 30, acceptShorter: true }), { kind: 'start', minutes: 30, acceptShorter: true })
  for (const minutes of [0, 31, 2.5, '10', undefined]) assert.equal(parsePracticeRequest({ action: 'start', minutes }), null)
})

test('an old client’s Review-rating and AI payloads are recognised and retired', () => {
  const old = { revision: 3, taskId: 't', responseMs: 0, replays: 0, elapsedSeconds: 0 }
  assert.deepEqual(parsePracticeRequest({ ...old, action: 'rate', rating: 3 }), { kind: 'retired' })
  assert.deepEqual(parsePracticeRequest({ ...old, action: 'accept' }), { kind: 'retired' })
  assert.deepEqual(parsePracticeRequest({ ...old, action: 'repair' }), { kind: 'retired' })
  assert.deepEqual(parsePracticeRequest({ action: 'start', aiEnabled: true }), { kind: 'retired' })
  assert.deepEqual(parsePracticeRequest({ ...old, action: 'answer', answer: 'x', rating: 4 }), { kind: 'retired' }, 'a rating smuggled into another action')
})

test('current actions are validated field by field', () => {
  assert.deepEqual(parsePracticeRequest({ action: 'next', revision: 2, taskId: 't' }), { kind: 'act', action: { action: 'next', revision: 2, taskId: 't' } })
  assert.deepEqual(parsePracticeRequest({ action: 'answer', revision: 2, taskId: 't', answer: 'hej', responseMs: 5000 }).action.answer, 'hej')
  assert.deepEqual(parsePracticeRequest({ action: 'pause', revision: 2, taskId: 't', draft: { answer: 'he', picked: [2, 0] } }).action.draft, { answer: 'he', picked: [2, 0] })
  assert.equal(parsePracticeRequest({ action: 'pause', revision: 2, taskId: 't', draft: { answer: 'he', picked: [1, 1] } }), null)
  assert.equal(parsePracticeRequest({ action: 'answer', revision: 2, taskId: 't', answer: 'x'.repeat(2001), responseMs: 0 }), null)
  assert.equal(parsePracticeRequest({ action: 'answer', revision: -1, taskId: 't', answer: 'x', responseMs: 0 }), null)
  assert.equal(parsePracticeRequest({ action: 'teleport', revision: 1, taskId: 't' }), null)
})

test('only a version-2 session is a valid session; a version-1 AI session is not', () => {
  const session = { version: 2, id: 'id', seed: 'seed', targetMinutes: 10, contentRevision: 'practice-v2', locale: 'en', createdAt: '2026-09-24T12:00:00Z', queue: [], attempts: [], completed: 0, elapsedSeconds: 0, activeSince: null, current: null, draft: null, finished: false }
  assert.equal(isPracticeSession(session), true)
  assert.equal(isPracticeSession({ ...session, version: 1, aiEnabled: true, aiCalls: 0 }), false)
  assert.equal(isPracticeSession({ ...session, targetMinutes: 45 }), false)
  assert.equal(isPracticeSession({ ...session, finished: true, activeSince: '2026-09-24T12:00:00Z' }), false)
})
