import test from 'node:test'
import assert from 'node:assert/strict'
import { schedulePractice } from './practice-schedule.ts'

test('production begins with a new FSRS card and Again stays in short-term learning', () => {
  const now = new Date('2026-09-10T12:00:00Z')
  const first = schedulePractice(null, 1, now)
  assert.equal(first.reps, 1)
  assert.equal(first.state, 1)
  assert.ok(Date.parse(first.due) > now.getTime())
  assert.ok(Date.parse(first.due) <= now.getTime() + 600000)
  const next = schedulePractice(first, 3, new Date('2026-09-10T12:02:00Z'))
  assert.equal(next.reps, 2)
  assert.equal(first.reps, 1)
})
