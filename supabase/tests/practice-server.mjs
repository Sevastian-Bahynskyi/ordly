import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { actOnPractice, readPractice, startPractice, PracticeConflict } from '../../lib/practice-server.ts'

// The Practice service against real SQL (issue #13). Uses only the isolated local PostgREST
// fixture documented in docs/guided-practice.md, seeded with practice-server-seed.sql. The JWT is
// signed here with a test-only secret; it cannot point to production.
const userId = '10000000-0000-4000-8000-000000000001'
const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
const claims = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
const signature = createHmac('sha256', 'ordly-local-validation-secret-32-characters').update(`${head}.${claims}`).digest('base64url')
const supabase = createClient('http://127.0.0.1:54398', 'local-test', { global: { headers: { Authorization: `Bearer ${head}.${claims}.${signature}` }, fetch: (url, init) => fetch(String(url).replace('/rest/v1', ''), init) }, auth: { persistSession: false } })

async function reviewSnapshot() {
  const [cards, logs, entries, profile] = await Promise.all([
    supabase.from('review_cards').select('*').order('id'),
    supabase.from('review_logs').select('*').order('id'),
    supabase.from('vocabulary_entries').select('id, danish, translation, senses, learning_status, example_sentence, updated_at').order('id'),
    supabase.from('profiles').select('current_streak, longest_streak, last_study_date, daily_new_limit').single(),
  ])
  for (const result of [cards, logs, entries, profile]) assert.equal(result.error, null)
  return { cards: cards.data, logs: logs.data, entries: entries.data, profile: profile.data }
}

const before = await reviewSnapshot()
assert.ok(before.cards.length >= 10, 'seed the fixture first')
let store = (await readPractice(supabase, userId)).store
const act = (action, extra = {}) => actOnPractice(supabase, userId, { action, revision: store.revision, taskId: store.session.queue[0]?.id || '', ...extra })
const reload = async () => { store = (await readPractice(supabase, userId)).store }

// A shortfall is offered, not saved.
const shortfall = await startPractice(supabase, userId, { minutes: 30, acceptShorter: false })
assert.ok(shortfall && shortfall.availableMinutes > 0 && shortfall.availableMinutes < 30)
await reload()
assert.equal(store.session, null)

await startPractice(supabase, userId, { minutes: 5, acceptShorter: false })
await reload()
assert.equal(store.session.version, 2)
assert.equal(store.session.targetMinutes, 5)
const first = store.session.queue[0]

// Pause with a typed draft, resume, and find the same exercise and text.
await act('pause', { draft: { answer: 'halvt', picked: [] } })
await reload()
assert.equal(store.session.draft.answer, 'halvt')
await act('resume')
await reload()
assert.equal(store.session.queue[0].id, first.id)
assert.equal(store.session.draft.answer, 'halvt')

// Answer every exercise until the queue ends; alternate right answers and "I don't know".
let step = 0
while (store.session.queue.length && step < 40) {
  const task = store.session.queue[0]
  await act('answer', { answer: step % 3 === 2 ? '' : task.answer, responseMs: 1500 })
  await reload()
  assert.ok(store.session.current.revealed)
  await act('next')
  await reload()
  step += 1
}
assert.ok(step >= 2)
const { data: attempts } = await supabase.from('practice_attempts').select('payload')
assert.equal(attempts.length, step)
assert.ok(attempts.some(({ payload }) => payload.result === 'dont_know'))
assert.ok(attempts.every(({ payload }) => !('rating' in payload)))
await act('finish')
await reload()
assert.equal(store.session.finished, true)
await assert.rejects(act('finish'), PracticeConflict)

// The retired Review path, sent straight to the database as an old server would.
const legacy = await supabase.rpc('commit_practice', { expected_revision: store.revision, next_session: null, next_objectives: {}, attempt: null, legacy_change: { id: before.cards[0].id, expectedReps: before.cards[0].reps, expectedLastReview: before.cards[0].last_review, card: { ...before.cards[0], reps: 99, stability: 99 } } })
assert.equal(legacy.error?.code, '42501')
const oldSession = await supabase.rpc('commit_practice', { expected_revision: store.revision, next_session: { version: 1, queue: [], aiEnabled: true }, next_objectives: {} })
assert.equal(oldSession.error?.code, '22023')
const coverage = await supabase.rpc('record_sense_coverage', { target_entry_id: before.entries[0].id, sense_ids: [before.entries[0].senses[0].id], outcome: 'produced' })
assert.equal(coverage.error?.code, '42501')

assert.deepEqual(await reviewSnapshot(), before, 'Practice changed Review cards, logs, Material, status or the streak')
console.log(`Practice service passed: ${step} exercises, pause/resume with draft, shortfall offer, legacy refusals; Review and Material unchanged.`)
