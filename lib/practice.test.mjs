import assert from 'node:assert/strict'
import test from 'node:test'
import { newTargetBudget, finishPracticeTask, summarizePractice } from './practice.ts'

test('new material slows to one when recall is weak or a backlog builds, and never exceeds the daily limit', () => {
  assert.equal(newTargetBudget({ dailyLimit: 10, introducedToday: 0, dueCount: 5, recent: [] }), 4)
  assert.equal(newTargetBudget({ dailyLimit: 10, introducedToday: 8, dueCount: 5, recent: [] }), 2)
  assert.equal(newTargetBudget({ dailyLimit: 10, introducedToday: 10, dueCount: 5, recent: [] }), 0)
  assert.equal(newTargetBudget({ dailyLimit: 10, introducedToday: 0, dueCount: 40, recent: [] }), 1)
  assert.equal(newTargetBudget({ dailyLimit: 10, introducedToday: 0, dueCount: 5, recent: Array(20).fill(false) }), 1)
})

const task = { id: 'word:production', targetKey: 'word', entryId: 'word', objective: 'production', kind: 'produce', stage: 'remember', prompt: 'трудно', answer: 'svært', danish: 'svært', translation: 'трудно', hint: 's…', example: 'Det er svært.', audioText: null, source: 'saved', newTarget: false, retry: 0 }

test('forgotten and hinted production remains available even as the only item', () => {
  for (const [rating, help] of [[1, 'none'], [3, 'hint']]) {
    const next = finishPracticeTask([task], rating, help)
    assert.equal(next.length, 1)
    assert.equal(next[0].objective, 'production')
    assert.equal(next[0].prompt, 'трудно')
  }
  assert.deepEqual(finishPracticeTask([task], 3, 'none'), [])
})

test('progress excludes supported, ungraded and same-day answers from delayed recall', () => {
  const attempt = { id: 'a', taskId: task.id, targetKey: 'word', objective: 'production', kind: 'produce', result: 'correct', rating: 3, assistance: 'none', modality: 'typed', responseMs: 4000, at: '2026-09-10T12:00:00Z', lastExposureAt: '2026-09-08T12:00:00Z', replays: 0 }
  const summary = summarizePractice([attempt, { ...attempt, id: 'b', assistance: 'hint' }, { ...attempt, id: 'c', lastExposureAt: '2026-09-10T11:59:00Z' }, { ...attempt, id: 'd', result: 'ungraded', rating: null }])
  assert.deepEqual(summary.production, { correct: 1, total: 1 })
})

test('help cannot advance a schedule as successful recall', async () => {
  const { countsForSchedule } = await import('./practice.ts')
  const response = { assistance: 'hint' }
  assert.equal(countsForSchedule(task, response, 3), false)
  assert.equal(countsForSchedule(task, { assistance: 'none' }, 3), true)
  assert.equal(countsForSchedule({ ...task, kind: 'teach' }, { assistance: 'none' }, 3), false)
  assert.equal(countsForSchedule(task, response, 1), true)
})

test('communicating with another expression does not strengthen the missing production target', async () => {
  const { countsForSchedule } = await import('./practice.ts')
  assert.equal(countsForSchedule(task, { assistance: 'none', target: 'no' }, 3), false)
})
