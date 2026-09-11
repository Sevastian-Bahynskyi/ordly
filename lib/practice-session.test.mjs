import assert from 'node:assert/strict'
import test from 'node:test'
import { actOnPractice, startPractice, PracticeConflict } from './practice-server.ts'

function fixture(queue = []) {
  let store = { revision: 1, objectives: {}, session: { version: 1, id: 'session', queue, attempts: [], completed: 3, elapsedSeconds: 25, createdAt: new Date().toISOString(), aiEnabled: true, aiCalls: 8, current: null } }
  const client = {
    from(table) {
      const data = table === 'practice_state' ? store : table === 'profiles' ? { daily_new_limit: 2, default_translation_language: 'ru' } : []
      const query = { then(resolve) { return Promise.resolve({ data, error: null }).then(resolve) } }
      for (const method of ['select', 'eq', 'order', 'limit', 'single', 'maybeSingle']) query[method] = () => query
      return query
    },
    async rpc(name, args) {
      assert.equal(name, 'commit_practice')
      assert.equal(args.expected_revision, store.revision)
      assert.equal(args.attempt, null)
      assert.equal(args.legacy_change, null)
      store = { revision: store.revision + 1, session: args.next_session, objectives: args.next_objectives }
      return { data: store, error: null }
    },
  }
  return { client, state: () => store, action: (action) => ({ action, revision: store.revision, taskId: store.session.queue[0]?.id || '', responseMs: 0, replays: 0, elapsedSeconds: 25 }) }
}

const task = { id: 'word', targetKey: 'word', entryId: null, objective: 'production', kind: 'produce', stage: 'remember', prompt: 'coffee', answer: 'kaffe', danish: 'kaffe', translation: 'coffee', hint: '', example: 'kaffe', audioText: null, source: 'frame', newTarget: false, retry: 1 }

test('pause preserves retries; finish clears pending work without recording a rating', async () => {
  const f = fixture([task])
  await actOnPractice(f.client, 'user', f.action('pause'))
  assert.deepEqual(f.state().session.queue, [task])
  const finish = f.action('finish')
  await actOnPractice(f.client, 'user', finish)
  assert.equal(f.state().session.finished, true)
  assert.deepEqual(f.state().session.queue, [])
  assert.equal(f.state().session.completed, 3)
  await assert.rejects(actOnPractice(f.client, 'user', finish), PracticeConflict)
})

test('an exhausted batch can continue the same session, then finish and start fresh', async () => {
  const f = fixture()
  await startPractice(f.client, 'user', false)
  assert.ok(f.state().session.queue.length > 0)
  assert.equal(f.state().session.id, 'session')
  assert.equal(f.state().session.completed, 3)
  assert.equal(f.state().session.aiCalls, 8)
  assert.equal(f.state().session.aiEnabled, true)
  await actOnPractice(f.client, 'user', f.action('finish'))
  await startPractice(f.client, 'user', false)
  assert.notEqual(f.state().session.id, 'session')
  assert.equal(f.state().session.completed, 0)
  assert.equal(f.state().session.aiCalls, 0)
  assert.equal(f.state().session.aiEnabled, false)
  const empty = fixture()
  await actOnPractice(empty.client, 'user', empty.action('finish'))
  assert.equal(empty.state().session.finished, true)
})
