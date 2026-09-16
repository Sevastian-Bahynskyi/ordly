import assert from 'node:assert/strict'
import test from 'node:test'
import { actOnPractice } from './practice-server.ts'
import { entryContentVersion } from './practice-content.ts'

/**
 * The two grading gaps carried over from step 2 (D5):
 *
 * 1. guided practice never passed the entry's senses into `checkAnswer`, so practice recall lacked
 *    the multi-sense acceptance plain Review already had;
 * 2. `session.aiEnabled` gated grading as well as coaching, which is how "I wrote a correct
 *    synonym and it was marked wrong" happened with coaching switched off.
 */

function sense(id, text) {
  return { id, text, pos: 'adjective', gender: null, note: null, example: null, example_translation: null, source: 'ai', coverage: { recognized: 0, produced: 0, last_seen: null }, created_at: '2026-09-01T12:00:00Z', removed_at: null }
}

const entry = {
  id: '33333333-3333-4333-8333-333333333333', user_id: 'user', danish: 'svært',
  // The second sense contains a slash. Splitting the denormalized `translation` string — all
  // practice grading could do before — tears it into two halves that match nothing.
  translation: 'трудно, туда/сюда', senses: [sense('s1', 'трудно'), sense('s2', 'туда/сюда')],
  example_sentence: 'Det er svært.', example_translation: null, entry_kind: 'word', updated_at: '2026-09-01T12:00:00Z',
}
const neighbour = {
  id: '44444444-4444-4444-8444-444444444444', user_id: 'user', danish: 'besværligt',
  translation: 'тяжело', senses: [sense('n1', 'тяжело')], entry_kind: 'word',
}
const link = { a_id: entry.id, b_id: neighbour.id, kind: 'synonym', confirmed: false }

function fixture({ aiEnabled = false, links = [] } = {}) {
  const task = {
    id: `${entry.id}:meaning`, targetKey: entry.id, entryId: entry.id, objective: 'meaning', kind: 'recall',
    stage: 'remember', prompt: entry.danish, answer: entry.translation, danish: entry.danish,
    translation: entry.translation, hint: '', example: entry.example_sentence, audioText: null,
    source: 'saved', newTarget: false, retry: 0, contentVersion: entryContentVersion(entry),
  }
  let store = { revision: 1, objectives: {}, session: { version: 1, id: '11111111-1111-4111-8111-111111111111', queue: [task], attempts: [], completed: 0, elapsedSeconds: 5, createdAt: '2026-09-10T11:00:00Z', aiEnabled, aiCalls: 0, current: null } }
  const coverage = []
  const updates = []
  const client = {
    from(table) {
      let listed = false
      let updating = false
      const query = {
        then(resolve) {
          const data = table === 'practice_state' ? store
            : table === 'profiles' ? { daily_new_limit: 2, default_translation_language: 'ru' }
            : table === 'entry_links' ? links
            : table === 'vocabulary_entries' ? (updating ? [{ id: entry.id }] : listed ? [neighbour] : entry)
            : []
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      for (const method of ['select', 'eq', 'is', 'order', 'limit', 'single', 'maybeSingle', 'insert']) query[method] = () => query
      query.update = (payload) => { updating = true; updates.push({ table, payload }); return query }
      query.in = () => { listed = true; return query }
      return query
    },
    async rpc(name, args) {
      if (name === 'record_sense_coverage') { coverage.push(args); return { data: null, error: null } }
      store = { revision: store.revision + 1, session: args.next_session, objectives: args.next_objectives }
      return { data: store, error: null }
    },
  }
  return { client, coverage, updates, state: () => store, action: (action, extra = {}) => ({ action, revision: store.revision, taskId: store.session.queue[0].id, responseMs: 800, replays: 0, elapsedSeconds: 5, ...extra }) }
}

test('practice recall accepts a whole stored sense that the translation split would tear apart', async () => {
  const f = fixture()
  await actOnPractice(f.client, 'user', f.action('answer', { answer: 'туда/сюда' }))
  const current = f.state().session.current
  assert.equal(current.result, 'correct')
  assert.equal(current.assistance, 'none', 'accepting a stored sense is unaided success, not assistance')
  assert.equal(f.state().session.aiCalls, 0, 'a deterministic match must not spend the AI budget')

  const first = fixture()
  await actOnPractice(first.client, 'user', first.action('answer', { answer: 'трудно' }))
  assert.equal(first.state().session.current.result, 'correct')
})

test('practice recall accepts a synonym-linked entry’s meaning', async () => {
  const f = fixture({ links: [link] })
  await actOnPractice(f.client, 'user', f.action('answer', { answer: 'тяжело' }))
  assert.equal(f.state().session.current.result, 'correct', 'тяжело for svært is the reported bug')
  assert.equal(f.state().session.aiCalls, 0)
})

test('a grading call is permitted with AI coaching switched off, inside the same budget', async () => {
  const off = fixture({ aiEnabled: false })
  await actOnPractice(off.client, 'user', off.action('answer', { answer: 'непонятное слово' }))
  assert.equal(off.state().session.aiCalls, 1, 'grading no longer depends on the coaching toggle')
  assert.equal(off.state().session.current.result, 'ungraded', 'an unresolved check stays ungraded and self-rateable')

  const spent = fixture({ aiEnabled: false })
  spent.state().session.aiCalls = 12
  await actOnPractice(spent.client, 'user', spent.action('answer', { answer: 'непонятное слово' }))
  assert.equal(spent.state().session.aiCalls, 12, 'the existing per-session call budget still caps it')
})

test('a production task is never satisfied by a meaning in the learner’s own language', async () => {
  const f = fixture()
  f.state().session.queue[0].kind = 'produce'
  f.state().session.queue[0].objective = 'production'
  f.state().session.queue[0].answer = entry.danish
  await actOnPractice(f.client, 'user', f.action('answer', { answer: 'трудно' }))
  assert.notEqual(f.state().session.current.result, 'correct', 'the expected answer here is the Danish')
})

test('My answer was right in practice flips the verdict and stores the answer as a user sense (D5)', async () => {
  const f = fixture()
  await actOnPractice(f.client, 'user', f.action('answer', { answer: 'непростой' }))
  assert.notEqual(f.state().session.current.result, 'correct')
  await actOnPractice(f.client, 'user', f.action('accept'))
  assert.equal(f.state().session.current.result, 'correct', 'the learner has the last word on a meaning')
  const written = f.updates.find((update) => update.table === 'vocabulary_entries')
  assert.ok(written, 'the typed answer is persisted')
  const added = written.payload.senses.at(-1)
  assert.equal(added.text, 'непростой')
  assert.equal(added.source, 'user', 'so discovery never learns from it')
  assert.deepEqual(written.payload.senses.slice(0, 2).map((item) => item.id), ['s1', 's2'], 'existing sense ids are kept')
})

test('accept is refused for anything but a revealed typed meaning recall', async () => {
  const unrevealed = fixture()
  await assert.rejects(actOnPractice(unrevealed.client, 'user', unrevealed.action('accept')))
  const production = fixture()
  production.state().session.queue[0].kind = 'produce'
  production.state().session.queue[0].objective = 'production'
  await actOnPractice(production.client, 'user', production.action('answer', { answer: 'svært' }))
  await assert.rejects(actOnPractice(production.client, 'user', production.action('accept')), 'a Danish answer is not a meaning')
})

test('a rated recall credits coverage to exactly the sense the answer named (D9, D18)', async () => {
  const f = fixture()
  await actOnPractice(f.client, 'user', f.action('answer', { answer: 'туда/сюда' }))
  await actOnPractice(f.client, 'user', f.action('rate', { rating: 3 }))
  assert.deepEqual(f.coverage, [{ target_entry_id: entry.id, sense_ids: ['s2'], outcome: 'recognized' }])

  const forgot = fixture()
  await actOnPractice(forgot.client, 'user', forgot.action('answer', { answer: 'туда/сюда' }))
  await actOnPractice(forgot.client, 'user', forgot.action('rate', { rating: 1 }))
  assert.deepEqual(forgot.coverage, [], 'Again is not a success')
})
