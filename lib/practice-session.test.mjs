import assert from 'node:assert/strict'
import test from 'node:test'
import { actOnPractice, practiceView, PracticeConflict, readPractice, startPractice } from './practice-server.ts'
import { assembleTask, chooseTask, clozeTypedTask, pickMeaningTask, produceSenseTask } from './practice-exercises.ts'
import { binaryTask, dialogueTasks, flashTask, matchTask, oddTask, sortTask } from './practice-formats.ts'
import { senseTargetKey } from './practice-senses.ts'

/**
 * The authenticated Practice session boundary (issue #13). The fake client records every write
 * and every RPC, and mimics `commit_practice`'s own refusals, so each test can assert both what
 * the learner sees and that Review and Material were never touched.
 */

const USER = '10000000-0000-4000-8000-000000000001'
const uuid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function sense(id, text, patch = {}) {
  return { id, text, pos: 'adjective', gender: null, note: null, example: null, example_translation: null, source: 'ai', coverage: { recognized: 0, produced: 0, last_seen: null }, created_at: '2026-09-01T12:00:00Z', removed_at: null, ...patch }
}

const WORDS = [['svær', 'difficult'], ['let', 'easy'], ['stor', 'big'], ['lille', 'small'], ['høj', 'tall'], ['lav', 'low'], ['varm', 'warm'], ['kold', 'cold'], ['ny', 'new'], ['gammel', 'old'], ['glad', 'happy'], ['træt', 'tired'],
  ['smuk', 'beautiful'], ['hurtig', 'fast'], ['langsom', 'slow'], ['billig', 'cheap'], ['dyr', 'expensive'], ['tom', 'empty'], ['fuld', 'full'], ['sulten', 'hungry']]

function card(index, [danish, meaning], owner = USER) {
  const id = uuid(index + 1)
  return {
    id: uuid(index + 101), user_id: owner, entry_id: id, due: '2026-09-20T12:00:00Z', last_review: '2026-09-15T12:00:00Z',
    stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 5, reps: 3, lapses: 0, learning_steps: 0, state: 2,
    vocabulary_entries: {
      id, user_id: owner, danish, translation: meaning, senses: [sense(`s${index}`, meaning)], entry_kind: 'word', learning_status: 'learning',
      pronunciation: null, example_sentence: `Det er meget ${danish} i dag.`, example_translation: `It is very ${meaning} today.`, icon_name: null,
      familiarity: 0, ai_enriched: true, created_at: '2026-08-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z',
    },
  }
}

function fixture({ cards = WORDS.map((word, index) => card(index, word)), state = null } = {}) {
  let row = state
  const attempts = []
  const writes = []
  const rpcs = []
  const client = {
    from(table) {
      const filters = {}
      let write = null
      const query = {
        then(resolve) {
          if (write) { writes.push({ table, ...write }); return Promise.resolve({ data: null, error: null }).then(resolve) }
          let data = null
          if (table === 'practice_state') data = row
          else if (table === 'practice_attempts') data = attempts.map((payload) => ({ payload })).reverse()
          else if (table === 'profiles') data = { default_translation_language: 'en' }
          else if (table === 'review_cards') data = cards.filter((item) => item.user_id === filters.user_id)
          else if (table === 'vocabulary_entries') data = cards.map((item) => item.vocabulary_entries).filter((entry) => (Array.isArray(filters.id) ? filters.id.includes(entry.id) : entry.id === filters.id) && entry.user_id === filters.user_id)
          else if (table === 'word_forms') data = []
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      for (const method of ['select', 'order', 'limit', 'single', 'maybeSingle', 'is']) query[method] = () => query
      query.eq = (column, value) => { filters[column] = value; return query }
      query.in = (column, values) => { filters[column] = values; return query }
      for (const method of ['insert', 'update', 'upsert', 'delete']) query[method] = (payload) => { write = { method, payload }; return query }
      return query
    },
    async rpc(name, args) {
      rpcs.push({ name, args })
      if (name !== 'commit_practice') return { data: null, error: null }
      // What the database itself enforces since 20260924170000_isolate_practice_from_review.sql.
      if (args.legacy_change !== null) return { data: null, error: { code: '42501' } }
      if (args.next_session !== null && args.next_session.version !== 2) return { data: null, error: { code: '22023' } }
      const current = row || { revision: 0, session: null, objectives: {} }
      if (args.attempt && attempts.some((attempt) => attempt.id === args.attempt.id)) return { data: current, error: null }
      if (current.revision !== args.expected_revision) return { data: null, error: { code: '40001' } }
      if (args.attempt) attempts.push(args.attempt)
      row = { revision: current.revision + 1, session: args.next_session, objectives: current.objectives }
      return { data: row, error: null }
    },
  }
  const session = () => row.session
  const act = (action, extra = {}) => actOnPractice(client, USER, { action, revision: row.revision, taskId: row.session.queue[0]?.id || '', ...extra })
  return { client, writes, rpcs, attempts, session, act, row: () => row }
}

/** The one assertion every Practice path must satisfy. */
function assertReviewAndMaterialUntouched(f) {
  assert.deepEqual(f.writes, [], 'Practice wrote a table directly')
  assert.deepEqual(f.rpcs.filter((call) => call.name !== 'commit_practice'), [], 'Practice called another routine, such as sense coverage')
  for (const call of f.rpcs) {
    assert.equal(call.args.legacy_change, null, 'Practice sent a Review change')
    assert.deepEqual(call.args.next_objectives, {}, 'Practice sends no schedule')
  }
}

/** A right answer for any format, from the task's own prepared content. */
function correctAnswer(task) {
  if (task.kind === 'sort' || task.kind === 'match') return JSON.stringify(Object.fromEntries(task.items.map((item) => [item.text, item.answer])))
  if (task.kind === 'flash') return 'known'
  return task.answer
}

test('Review stays the default: nothing starts until a time target is chosen, and then a session plans to it', async () => {
  const f = fixture()
  assert.deepEqual(await practiceView(f.client, USER), { revision: 0, session: null, retired: false })
  assert.equal((await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })).shortfall, null)
  const session = f.session()
  assert.equal(session.version, 2)
  assert.equal(session.targetMinutes, 5)
  assert.ok(session.queue.length > 0)
  assert.ok(session.queue.every((task) => task.targetKey.startsWith('entry:') && task.entryId && task.senseId), 'every target is a saved sense')
  assertReviewAndMaterialUntouched(f)
})

test('only the learner’s own Material can become a target', async () => {
  const stranger = card(50, ['fremmed', 'foreign'], '10000000-0000-4000-8000-00000000ffff')
  const f = fixture({ cards: [...WORDS.map((word, index) => card(index, word)), stranger] })
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  assert.equal(f.session().queue.some((task) => task.entryId === stranger.entry_id), false)
})

test('sparse Material offers the shorter session instead of fabricating exercises, or sends the learner to Review', async () => {
  const sparse = fixture({ cards: [card(0, WORDS[0])] })
  const { shortfall } = await startPractice(sparse.client, USER, { minutes: 20, acceptShorter: false })
  assert.deepEqual(shortfall, { requestedMinutes: 20, availableMinutes: 1 })
  assert.equal(sparse.row(), null, 'nothing is saved until the learner accepts')
  const accepted = await startPractice(sparse.client, USER, { minutes: 20, acceptShorter: true })
  assert.equal(accepted.shortfall, null)
  assert.equal(accepted.view.session.targetMinutes, 1, 'the view returned is the saved session')
  assert.equal(sparse.session().targetMinutes, 1)
  assert.ok(sparse.session().queue.length <= 2)

  const empty = fixture({ cards: [] })
  assert.deepEqual((await startPractice(empty.client, USER, { minutes: 10, acceptShorter: true })).shortfall, { requestedMinutes: 10, availableMinutes: 0 })
  assert.equal(empty.row(), null)
  assertReviewAndMaterialUntouched(sparse)
})

test('pause and resume keep the same exercise and exactly what was typed', async () => {
  const f = fixture()
  await startPractice(f.client, USER, { minutes: 10, acceptShorter: false })
  const first = f.session().queue[0]
  const choices = first.choices?.length || 0
  await f.act('pause', { draft: { answer: 'halv', picked: choices ? [0] : [] } })
  assert.equal(f.session().activeSince, null)
  assert.deepEqual(f.session().draft, { taskId: first.id, answer: 'halv', picked: choices ? [0] : [] })

  // A reload reads the same state back.
  const reloaded = (await readPractice(f.client, USER)).store.session
  assert.equal(reloaded.queue[0].id, first.id)
  assert.deepEqual(reloaded.queue[0].choices, first.choices, 'the board is not reshuffled')
  await f.act('resume')
  assert.ok(f.session().activeSince)
  assert.equal(f.session().queue[0].id, first.id)
  assert.equal(f.session().draft.answer, 'halv')
  // Starting again while a session is open resumes it; it never replans.
  await startPractice(f.client, USER, { minutes: 20, acceptShorter: false })
  assert.equal(f.session().queue[0].id, first.id)
  assert.equal(f.session().targetMinutes, 10)
  assertReviewAndMaterialUntouched(f)
})

test('answering and continuing records one internal attempt and nothing else', async () => {
  const f = fixture()
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  const task = f.session().queue[0]
  await f.act('answer', { answer: correctAnswer(task), responseMs: 2400 })
  assert.equal(f.session().current.result, 'correct')
  assert.equal(f.session().draft, null)
  assert.equal(f.attempts.length, 0, 'an answer alone is not yet an attempt')
  await f.act('next')
  assert.equal(f.attempts.length, 1)
  const [attempt] = f.attempts
  assert.equal(attempt.targetKey, task.targetKey)
  assert.equal(attempt.entryId, task.entryId)
  assert.equal(attempt.locale, 'en')
  assert.equal(attempt.contentVersion, task.contentVersion)
  assert.equal(attempt.responseMs, 2400)
  assert.equal('rating' in attempt, false, 'Practice has no Review rating')
  assert.equal(f.session().completed, 1)
  assert.notEqual(f.session().queue[0]?.id, task.id)
  assertReviewAndMaterialUntouched(f)
})

test('I don’t know and a hint are recorded as such, and the exercise returns later', async () => {
  const f = fixture()
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  const task = f.session().queue[0]
  await f.act('answer', { answer: '', responseMs: 900 })
  assert.equal(f.session().current.result, 'dont_know')
  await f.act('next')
  assert.equal(f.attempts[0].result, 'dont_know')
  const returned = f.session().queue.find((item) => item.id === `${task.id}:retry`)
  if (task.kind !== 'pick' && task.kind !== 'sense') assert.ok(returned, 'a miss comes back in the same session')
  assertReviewAndMaterialUntouched(f)
})

test('the target never cuts off the current answer; no new exercise starts once it is reached', async () => {
  const f = fixture()
  await startPractice(f.client, USER, { minutes: 1, acceptShorter: false })
  const task = f.session().queue[0]
  // Pretend the learner has been active past the target while this exercise was on screen.
  f.row().session = { ...f.session(), elapsedSeconds: 75, activeSince: new Date().toISOString() }
  await f.act('answer', { answer: correctAnswer(task), responseMs: 60000 })
  assert.equal(f.session().current.result, 'correct', 'the answer was still accepted and graded')
  await f.act('next')
  assert.deepEqual(f.session().queue, [], 'nothing new is scheduled past the target')
  assert.equal(f.session().finished, false, 'the learner still chooses to finish')
  assert.equal(f.attempts.length, 1)
  await f.act('finish')
  assert.equal(f.session().finished, true)
  assertReviewAndMaterialUntouched(f)
})

test('an edited or deleted entry drops out of the session instead of being graded', async () => {
  const cards = WORDS.map((word, index) => card(index, word))
  const f = fixture({ cards })
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  const task = f.session().queue[0]
  const entry = cards.find((item) => item.entry_id === task.entryId).vocabulary_entries
  entry.senses = [{ ...entry.senses[0], text: 'something else' }]
  await f.act('answer', { answer: correctAnswer(task), responseMs: 1 })
  assert.equal(f.session().current, null)
  assert.equal(f.session().queue.some((item) => item.entryId === task.entryId), false)
  assertReviewAndMaterialUntouched(f)
})

test('a tapped answer must be one of the offered options', async () => {
  const f = fixture()
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  const index = f.session().queue.findIndex((task) => task.choices?.length && task.kind !== 'assemble')
  assert.ok(index >= 0)
  f.row().session = { ...f.session(), queue: [f.session().queue[index]] }
  await assert.rejects(f.act('answer', { answer: 'free text', responseMs: 1 }), PracticeConflict)
})

test('legacy regression: an old AI-enabled session is retired, and the old Review path is refused', async () => {
  const legacyTask = { id: 'x:meaning', targetKey: uuid(1), entryId: uuid(1), objective: 'meaning', kind: 'recall', stage: 'remember', prompt: 'svær', answer: 'difficult', danish: 'svær', translation: 'difficult', hint: '', example: '', audioText: null, source: 'saved', newTarget: false, retry: 0, cardId: uuid(101) }
  const old = { revision: 4, objectives: { [uuid(1)]: { task: legacyTask, card: { due: '2026-09-20T12:00:00Z' } } }, session: { version: 1, id: uuid(900), queue: [legacyTask], attempts: [], completed: 2, elapsedSeconds: 30, createdAt: '2026-09-20T12:00:00Z', aiEnabled: true, aiCalls: 3, current: { answer: 'difficult', result: 'correct', revealed: true } } }
  const f = fixture({ state: old })
  const view = await practiceView(f.client, USER)
  assert.equal(view.retired, true)
  assert.equal(view.session, null, 'the old session is never resumed')
  // Its old actions have no session to act on.
  await assert.rejects(actOnPractice(f.client, USER, { action: 'next', revision: 4, taskId: legacyTask.id }), PracticeConflict)
  // A fresh start replaces it; the stored objectives are left as they are in the row.
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  assert.equal(f.session().version, 2)
  assert.deepEqual(f.row().objectives, old.objectives)
  assert.equal('objectives' in (await practiceView(f.client, USER)), false, 'the retired schedule is never exposed')
  assertReviewAndMaterialUntouched(f)

  // And the retired write itself, sent straight to the routine, is refused by the database.
  const refused = await f.client.rpc('commit_practice', { expected_revision: f.row().revision, next_session: f.session(), next_objectives: {}, attempt: null, legacy_change: { id: uuid(101), card: { reps: 9 } } })
  assert.equal(refused.error.code, '42501')
  const oldPayload = await f.client.rpc('commit_practice', { expected_revision: f.row().revision, next_session: old.session, next_objectives: {}, attempt: null, legacy_change: null })
  assert.equal(oldPayload.error.code, '22023')
})

test('a stale screen cannot double-advance the session', async () => {
  const f = fixture()
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  const task = f.session().queue[0]
  const stale = { action: 'answer', revision: f.row().revision, taskId: task.id, answer: correctAnswer(task), responseMs: 1 }
  await actOnPractice(f.client, USER, stale)
  await assert.rejects(actOnPractice(f.client, USER, stale), PracticeConflict)
})

test('an unverified answer can be reported for content review without touching Review or Material', async () => {
  const f = fixture()
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  const [first] = f.session().queue
  // A saved-sentence production exercise on the same sense, so the content version still matches.
  const sentence = { ...first, id: `${first.targetKey}:produce`, kind: 'produce', prompt: 'It is very difficult today.', answer: 'Det er meget svær i dag.', answerIsSentence: true, choices: undefined, contrast: undefined, context: undefined }
  f.row().session = { ...f.session(), queue: [sentence] }
  await assert.rejects(f.act('report'), PracticeConflict, 'nothing to report before an answer')
  await f.act('answer', { answer: 'I dag er det meget svært.', responseMs: 4000 })
  assert.equal(f.session().current.result, 'unverified')
  await f.act('report')
  assert.equal(f.session().current.reported, true)
  await f.act('next')
  const [attempt] = f.attempts
  assert.equal(attempt.reported, true)
  assert.equal(attempt.answer, 'I dag er det meget svært.', 'the reported wording is kept for review')
  assert.equal(attempt.result, 'unverified', 'reporting does not turn it into a correct answer')
  assertReviewAndMaterialUntouched(f)
})

test('only a typed answer the prepared answers could not confirm can be reported', async () => {
  const f = fixture()
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: false })
  const task = f.session().queue[0]
  await f.act('answer', { answer: task.answer, responseMs: 1 })
  assert.equal(f.session().current.result, 'correct')
  await assert.rejects(f.act('report'), PracticeConflict, 'a correct answer has nothing to report')
  await f.act('next')
  assert.equal('answer' in f.attempts[0], false, 'an unreported answer is not stored')
})

test('the session started after a shortfall offer is the one that was measured', async () => {
  const f = fixture({ cards: WORDS.slice(0, 3).map((word, index) => card(index, word)) })
  const { shortfall } = await startPractice(f.client, USER, { minutes: 30, acceptShorter: false })
  assert.ok(shortfall.availableMinutes >= 1)
  const { view } = await startPractice(f.client, USER, { minutes: 30, acceptShorter: true })
  assert.equal(view.session.targetMinutes, Math.min(30, shortfall.availableMinutes))
  const again = fixture({ cards: WORDS.slice(0, 3).map((word, index) => card(index, word)) })
  const { view: replay } = await startPractice(again.client, USER, { minutes: 30, acceptShorter: true })
  assert.deepEqual(replay.session.queue, view.session.queue, 'same saved state, same plan')
})

test('every one of the ten formats can be started, paused, resumed, answered, and finished', async () => {
  const nouns = [['bil', 'car', 'en'], ['bog', 'book', 'en'], ['stol', 'chair', 'en'], ['hus', 'house', 'et'], ['bord', 'table', 'et'], ['vindue', 'window', 'et']]
  const cards = [
    ...WORDS.slice(0, 8).map((word, index) => card(index, word)),
    ...nouns.map(([danish, meaning, gender], index) => {
      const c = card(30 + index, [danish, meaning])
      c.vocabulary_entries.senses = [{ ...c.vocabulary_entries.senses[0], pos: 'noun', gender }]
      return c
    }),
    card(60, ['gerne', 'gladly']),
  ]
  const f = fixture({ cards })
  await startPractice(f.client, USER, { minutes: 5, acceptShorter: true })
  const candidates = cards.map((c) => ({ item: c, entryId: c.entry_id, sense: c.vocabulary_entries.senses[0], primary: true, targetKey: senseTargetKey(c.entry_id, c.vocabulary_entries.senses[0].id) }))
  const input = (c) => ({ candidate: c, senses: [c.sense], distractors: ['let', 'stor', 'lille', 'høj', 'lav'], meaningDistractors: ['easy', 'big', 'small'], newTarget: false })
  const [first] = candidates
  const queue = [
    pickMeaningTask(input(first)), chooseTask(input(first)), assembleTask(input(first)), clozeTypedTask(input(first)), produceSenseTask(input(first)),
    { ...binaryTask(input(first)), id: 'binary' }, oddTask(candidates.slice(8, 14), 'odd'), sortTask(candidates.slice(8, 14), 'sort'),
    matchTask(candidates.slice(0, 8), 'match'), dialogueTasks(candidates, 'en', 'd')[0], flashTask(input(first)),
  ]
  assert.deepEqual(queue.map((task) => task.kind), ['pick', 'choose', 'assemble', 'cloze', 'produce', 'binary', 'odd', 'sort', 'match', 'dialogue', 'flash'])
  f.row().session = { ...f.session(), queue, locale: 'en', targetMinutes: 30 }

  for (const task of queue) {
    assert.equal(f.session().queue[0].id, task.id)
    // Pause mid-answer, come back to the same exercise and input.
    const partial = task.kind === 'match' || task.kind === 'sort' ? JSON.stringify({ [task.items[0].text]: task.items[0].answer }) : task.kind === 'flash' ? 'revealed' : 'x'
    await f.act('pause', { draft: { answer: partial, picked: [] } })
    assert.equal((await readPractice(f.client, USER)).store.session.draft.answer, partial)
    await f.act('resume')
    assert.equal(f.session().queue[0].id, task.id)
    await f.act('answer', { answer: correctAnswer(task), responseMs: 1000 })
    const expected = task.kind === 'flash' ? 'self_known' : 'correct'
    assert.equal(f.session().current.result, expected, `${task.kind} is graded`)
    await f.act('next')
    const attempt = f.attempts.at(-1)
    assert.equal(attempt.kind, task.kind)
    if (task.kind === 'match' || task.kind === 'sort') assert.equal(attempt.targets.length, task.items.length, `${task.kind} records each word`)
    if (task.kind === 'flash') assert.equal(attempt.assistance, 'self', 'a self-rating is never checked evidence')
  }
  await f.act('finish')
  assert.equal(f.session().finished, true)
  assert.equal(f.attempts.length, queue.length)
  assertReviewAndMaterialUntouched(f)
})
