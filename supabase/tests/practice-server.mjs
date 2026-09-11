import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { actOnPractice, readPractice, startPractice, PracticeConflict } from '../../lib/practice-server.ts'

// Uses only the isolated local PostgREST fixture documented in docs/guided-practice.md.
const userId = '10000000-0000-4000-8000-000000000001'
const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
const claims = Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url')
const signature = createHmac('sha256', 'ordly-local-validation-secret-32-characters').update(`${head}.${claims}`).digest('base64url')
const supabase = createClient('http://127.0.0.1:54398', 'local-test', { global: { headers: { Authorization: `Bearer ${head}.${claims}.${signature}` }, fetch: (url, init) => fetch(String(url).replace('/rest/v1', ''), init) }, auth: { persistSession: false } })

await startPractice(supabase, userId, false)
let state = (await readPractice(supabase, userId)).store
assert.ok(state.session.queue.length > 3)
const first = state.session.queue[0]
const action = (extra) => ({ revision: state.revision, taskId: state.session.queue[0].id, responseMs: 3000, replays: 0, elapsedSeconds: 10, ...extra })
await actOnPractice(supabase, userId, action({ action: 'answer', answer: first.answer.split(',')[0], modality: 'typed' }))
state = (await readPractice(supabase, userId)).store
assert.equal(state.session.current.result, 'correct')
const rate = action({ action: 'rate', rating: 3 })
await actOnPractice(supabase, userId, rate)
await assert.rejects(actOnPractice(supabase, userId, rate), PracticeConflict)
state = (await readPractice(supabase, userId)).store
assert.equal(state.session.attempts.length, 1)
const forgotten = state.session.queue[0]
await actOnPractice(supabase, userId, action({ action: 'answer', answer: '', modality: 'typed' }))
state = (await readPractice(supabase, userId)).store
assert.equal(state.session.current.assistance, 'model')
await actOnPractice(supabase, userId, action({ action: 'rate', rating: 1 }))
state = (await readPractice(supabase, userId)).store
assert.ok(state.session.queue.some(task => task.targetKey === forgotten.targetKey && task.objective === forgotten.objective && task.retry === 1))
assert.equal(state.session.attempts.length, 2)
await actOnPractice(supabase, userId, action({ action: 'pause', elapsedSeconds: 38 }))
state = (await readPractice(supabase, userId)).store
assert.equal(state.session.elapsedSeconds, 38)
console.log('Practice service passed: real SQL persistence, exact grading, duplicate rejection, Again requeue, and resume.')

// A newer ordinary review must reconcile the old guided answer, not deadlock resume.
const { vocabularyTask } = await import('../../lib/practice-content.ts')
const { data: source } = await supabase.from('review_cards').select('*, vocabulary_entries(*)').eq('user_id', userId).limit(1).single()
assert.ok(source)
let meaningTask = vocabularyTask(source, 'meaning')
state = (await readPractice(supabase, userId)).store
let prepared = { ...state.session, queue: [meaningTask], current: null }
let write = await supabase.from('practice_state').update({ session: prepared }).eq('user_id', userId)
assert.equal(write.error, null)
state = (await readPractice(supabase, userId)).store
await actOnPractice(supabase, userId, action({ action: 'answer', answer: meaningTask.answer.split(',')[0], modality: 'typed' }))
state = (await readPractice(supabase, userId)).store
const newerReview = new Date(Date.now() + 1000).toISOString()
write = await supabase.from('review_cards').update({ last_review: newerReview }).eq('id', source.id)
assert.equal(write.error, null)
await actOnPractice(supabase, userId, action({ action: 'rate', rating: 3 }))
state = (await readPractice(supabase, userId)).store
assert.equal(state.session.queue.length, 0)
const { data: unchanged } = await supabase.from('review_cards').select('last_review').eq('id', source.id).single()
assert.equal(Date.parse(unchanged.last_review), Date.parse(newerReview))

// The original answer time and the latest visible-model exposure are separate evidence.
write = await supabase.from('review_cards').update({ last_review: new Date(Date.now() - 3 * 86400000).toISOString() }).eq('id', source.id)
assert.equal(write.error, null)
let productionTask = vocabularyTask(source, 'production')
prepared = { ...state.session, queue: [productionTask], current: null }
write = await supabase.from('practice_state').update({ session: prepared, objectives: {} }).eq('user_id', userId)
assert.equal(write.error, null)
state = (await readPractice(supabase, userId)).store
await actOnPractice(supabase, userId, action({ action: 'answer', answer: '', modality: 'typed' }))
state = (await readPractice(supabase, userId)).store
const yesterday = new Date(Date.now() - 2 * 86400000).toISOString()
prepared = { ...state.session, current: { ...state.session.current, answeredAt: yesterday } }
write = await supabase.from('practice_state').update({ session: prepared }).eq('user_id', userId)
assert.equal(write.error, null)
state = (await readPractice(supabase, userId)).store
await actOnPractice(supabase, userId, action({ action: 'rate', rating: 1 }))
state = (await readPractice(supabase, userId)).store
await actOnPractice(supabase, userId, action({ action: 'answer', answer: productionTask.answer, modality: 'typed' }))
state = (await readPractice(supabase, userId)).store
await actOnPractice(supabase, userId, action({ action: 'rate', rating: 3 }))
state = (await readPractice(supabase, userId)).store
const retry = state.session.attempts.at(-1)
assert.ok(Date.parse(retry.at) - Date.parse(retry.lastExposureAt) >= 0)
assert.ok(Date.parse(retry.at) - Date.parse(retry.lastExposureAt) < 60000)
console.log('Regression checks passed: stale ordinary review reconciles and resumed model exposure prevents false delayed recall.')

const { isReviewSource } = await import('../../lib/practice-validation.ts')
assert.equal(isReviewSource(source), true)
assert.equal(isReviewSource({ ...source, vocabulary_entries: { ...source.vocabulary_entries, translation: 'x'.repeat(5000) } }), false)
write = await supabase.from('vocabulary_entries').update({ translation: 'x'.repeat(5000) }).eq('id', source.entry_id)
assert.equal(write.error, null)
await startPractice(supabase, userId, false)
state = (await readPractice(supabase, userId)).store
assert.equal(state.session.queue.some(task => task.entryId === source.entry_id), false)
write = await supabase.from('vocabulary_entries').update({ translation: source.vocabulary_entries.translation }).eq('id', source.entry_id)
assert.equal(write.error, null)
console.log('Source validation passed: oversized source content is excluded before saving a readable session.')
