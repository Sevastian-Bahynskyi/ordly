import test from 'node:test'
import assert from 'node:assert/strict'
import { planPractice } from './practice-planner.ts'
import { entryContentVersion, vocabularyTask } from './practice-content.ts'

const now = new Date('2026-09-10T12:00:00Z')
const entry = { id: 'entry', danish: 'svært', translation: 'difficult', example_sentence: 'Det er svært.', entry_kind: 'word', updated_at: '2026-09-01T12:00:00Z' }
const item = { id: 'card', entry_id: entry.id, reps: 2, due: '2026-09-09T12:00:00Z', vocabulary_entries: entry }
const input = { items: [item], store: { revision: 0, session: null, objectives: {} }, attempts: [], introducedToday: 0, dailyLimit: 10, language: 'en', aiEnabled: false, now }

test('a session caps new targets and separates scheduled production from prior meaning exposure', () => {
  const fresh = Array.from({ length: 20 }, (_, i) => ({ ...item, id: `card${i}`, entry_id: `entry${i}`, reps: 0, vocabulary_entries: { ...entry, id: `entry${i}` } }))
  const session = planPractice({ ...input, items: fresh })
  assert.equal(new Set(session.queue.filter(t => t.newTarget).map(t => t.targetKey)).size, 2)
  const production = vocabularyTask(item, 'production')
  const scheduled = planPractice({ ...input, store: { ...input.store, objectives: { entry: { task: production, card: { due: item.due } } } } })
  assert.equal(scheduled.queue[0].kind, 'produce')
  assert.equal(scheduled.queue.some(t => t.targetKey === 'entry' && t.kind === 'recall'), false)
})

test('a rating status timestamp does not invalidate a production objective; a meaning edit does', () => {
  assert.equal(entryContentVersion(entry), entryContentVersion({ ...entry, updated_at: now.toISOString(), learning_status: 'mastered' }))
  assert.notEqual(entryContentVersion(entry), entryContentVersion({ ...entry, translation: 'hard' }))
})

test('heavy due work admits no new vocabulary or frames', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ ...item, id: `card${i}`, entry_id: `entry${i}`, vocabulary_entries: { ...entry, id: `entry${i}` } }))
  const session = planPractice({ ...input, items })
  assert.equal(session.queue.some(t => t.newTarget), false)
  assert.ok(session.queue.some(t => t.kind === 'produce'))
})
