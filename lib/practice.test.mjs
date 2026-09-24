import assert from 'node:assert/strict'
import test from 'node:test'
import { activeSeconds, finishPracticeTask, isPracticeMinutes, MAX_STRETCH_SECONDS, targetReached, unaidedForm } from './practice.ts'
import { isPracticeTask } from './practice-validation.ts'

const task = {
  id: 'entry:e:sense:s:choose', targetKey: 'entry:e:sense:s', entryId: 'e', senseId: 's', kind: 'choose',
  prompt: 'Det er _____.', answer: 'svært', danish: 'svært', translation: 'difficult', hint: 'difficult', example: 'Det er svært.',
  answerIsSentence: false, contentVersion: 'v1', newTarget: false, retry: 0, choices: ['svært', 'let', 'stor'],
}

test('a time target is 1 to 30 whole minutes', () => {
  for (const ok of [1, 5, 10, 20, 30]) assert.equal(isPracticeMinutes(ok), true)
  for (const bad of [0, 31, 7.5, -5, '10', null]) assert.equal(isPracticeMinutes(bad), false)
})

test('only active time counts, and one stretch cannot count more than ten minutes', () => {
  const now = new Date('2026-09-24T12:00:00Z')
  assert.equal(activeSeconds({ elapsedSeconds: 90, activeSince: null }, now), 90, 'paused time never counts')
  assert.equal(activeSeconds({ elapsedSeconds: 90, activeSince: '2026-09-24T11:59:00Z' }, now), 150)
  assert.equal(activeSeconds({ elapsedSeconds: 0, activeSince: '2026-09-24T08:00:00Z' }, now), MAX_STRETCH_SECONDS)
  assert.equal(targetReached({ targetMinutes: 5 }, 280), false)
  assert.equal(targetReached({ targetMinutes: 5 }, 290), true, 'nothing new starts in the last few seconds')
})

test('a miss comes back later in unaided form; a success does not', () => {
  const rest = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ ...task, id }))
  assert.deepEqual(finishPracticeTask([task, ...rest], { result: 'correct', assistance: 'choices' }, 'seed'), rest)
  const next = finishPracticeTask([task, ...rest], { result: 'incorrect', assistance: 'choices' }, 'seed')
  const retry = next.find((item) => item.id === `${task.id}:retry`)
  assert.equal(retry.kind, 'cloze', 'a gap with options returns as a typed gap')
  assert.equal(retry.choices, undefined)
  assert.equal(retry.retry, 1)
  assert.ok(next.indexOf(retry) >= 2, 'not straight away')
  assert.ok(isPracticeTask(retry))
  assert.deepEqual(finishPracticeTask([task, ...rest], { result: 'incorrect', assistance: 'choices' }, 'seed'), next, 'the position is fixed by the seed')
  assert.equal(finishPracticeTask([task], { result: 'dont_know', assistance: 'model' }, 'seed').length, 1, 'even as the only exercise')
  assert.deepEqual(finishPracticeTask([{ ...task, retry: 2 }], { result: 'incorrect', assistance: 'choices' }, 'seed'), [], 'retries are bounded')
})

test('meaning and sense boards have no unaided form; a word bank becomes the typed sentence', () => {
  assert.equal(unaidedForm({ ...task, kind: 'pick' }), null)
  assert.equal(unaidedForm({ ...task, kind: 'sense' }), null)
  const produce = unaidedForm({ ...task, kind: 'assemble', answer: 'Det er svært.', answerIsSentence: true })
  assert.equal(produce.kind, 'produce')
  assert.equal(produce.answer, 'Det er svært.')
})
