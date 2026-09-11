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
