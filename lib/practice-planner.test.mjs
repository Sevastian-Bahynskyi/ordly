import test from 'node:test'
import assert from 'node:assert/strict'
import { planPractice, SESSION_TARGETS } from './practice-planner.ts'
import { entryContentVersion } from './practice-content.ts'
import { clozeTypedTask, findInSentence, pickMeaningTask, selectMeaningDistractors, sentenceClozeTask } from './practice-exercises.ts'
import { scoreTargets } from './practice-targets.ts'
import { senseTargetKey } from './practice-senses.ts'

const now = new Date('2026-09-10T12:00:00Z')

function sense(id, text, patch = {}) {
  return { id, text, pos: 'adjective', gender: null, note: null, example: null, example_translation: null, source: 'ai', coverage: { recognized: 0, produced: 0, last_seen: null }, created_at: '2026-09-01T12:00:00Z', removed_at: null, ...patch }
}

function item(id, patch = {}, entryPatch = {}) {
  const senses = entryPatch.senses || [sense(`${id}-s`, `meaning ${id}`)]
  return {
    id: `card-${id}`, entry_id: id, reps: 3, due: '2026-09-20T12:00:00Z', last_review: '2026-09-09T12:00:00Z',
    stability: 20, difficulty: 5, elapsed_days: 1, scheduled_days: 10, lapses: 0, learning_steps: 0, state: 2,
    ...patch,
    vocabulary_entries: {
      id, danish: id, translation: senses.map((s) => s.text).join(', '), senses, entry_kind: 'word',
      example_sentence: `Jeg kan godt lide ${id} i dag.`, example_translation: `I like ${id} today.`,
      created_at: '2026-08-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z', ...entryPatch,
    },
  }
}

const base = { store: { revision: 0, session: null, objectives: {} }, attempts: [], introducedToday: 0, dailyLimit: 10, language: 'en', aiEnabled: false, now }
const entryOf = (task) => task.entryId

test('new items come first by the budget, the rest of the session is the weakest items', () => {
  const fresh = Array.from({ length: 6 }, (_, i) => item(`new${i}`, { reps: 0, stability: 0, last_review: null }, { created_at: `2026-09-0${i + 1}T12:00:00Z` }))
  const strong = Array.from({ length: 12 }, (_, i) => item(`strong${i}`))
  const weak = item('weak', { lapses: 4, stability: 0.5, last_review: '2026-09-01T12:00:00Z' })
  const session = planPractice({ ...base, items: [...strong, weak, ...fresh] })
  const targets = [...new Set(session.queue.map(entryOf))]

  assert.equal(targets.length, SESSION_TARGETS)
  assert.equal(new Set(session.queue.filter((t) => t.newTarget).map(entryOf)).size, 4, 'four new items a session')
  assert.deepEqual(targets.filter((id) => id.startsWith('new')), ['new5', 'new4', 'new3', 'new2'], 'newest first')
  assert.equal(targets[1], 'weak', 'the weakest known item is interleaved straight after the first new one')
})

test('each item climbs from recognition to production, and never repeats back to back', () => {
  const items = ['a', 'b', 'c'].map((id) => item(id, { reps: 0, stability: 0, last_review: null }))
  const session = planPractice({ ...base, items })
  for (const id of ['a', 'b', 'c']) {
    const kinds = session.queue.filter((t) => t.entryId === id).map((t) => t.kind)
    assert.equal(kinds[0], 'pick', 'a new word starts by recognising its meaning')
    assert.equal(kinds.length, 2)
    assert.notEqual(kinds[1], 'pick')
  }
  session.queue.slice(1).forEach((task, index) => assert.notEqual(task.entryId, session.queue[index].entryId))
})

test('a due review card is moved forward by a typed recall inside practice', () => {
  const due = item('due', { due: '2026-09-09T12:00:00Z', stability: 8, last_review: '2026-09-01T12:00:00Z' })
  const session = planPractice({ ...base, items: [due, item('other'), item('third')] })
  const recall = session.queue.find((t) => t.entryId === 'due' && t.kind === 'recall')
  assert.ok(recall)
  assert.equal(recall.cardId, 'card-due')
})

test('a missed answer makes an item a priority and drops it to an easier rung', () => {
  const key = senseTargetKey('miss', 'miss-s')
  const attempts = [{ id: 'x', taskId: 'x', targetKey: key, objective: 'production', kind: 'cloze', result: 'incorrect', rating: 1, assistance: 'none', modality: 'typed', responseMs: 1, at: '2026-09-09T12:00:00Z', lastExposureAt: null, replays: 0 }]
  const scores = scoreTargets({ items: [item('miss'), item('fine')], store: base.store, attempts, now })
  const [missed, fine] = scores
  assert.ok(missed.priority > fine.priority)
  assert.equal(missed.level, 1)
  assert.equal(missed.lastMissed, true)
})

test('a rating status timestamp does not invalidate an objective; a meaning edit does', () => {
  const entry = { id: 'entry', danish: 'svært', translation: 'difficult', example_sentence: 'Det er svært.', entry_kind: 'word', updated_at: '2026-09-01T12:00:00Z' }
  assert.equal(entryContentVersion(entry), entryContentVersion({ ...entry, updated_at: now.toISOString(), learning_status: 'mastered' }))
  assert.notEqual(entryContentVersion(entry), entryContentVersion({ ...entry, translation: 'hard' }))
})

test('a gap finds inflected forms but never guesses at phrases or short words', () => {
  assert.deepEqual(findInSentence('Vi spiste sammen i går.', 'at spise'), { surface: 'spiste', gapped: 'Vi _____ sammen i går.' })
  assert.deepEqual(findInSentence('Bilen er ny.', 'bil'), { surface: 'Bilen', gapped: '_____ er ny.' })
  assert.equal(findInSentence('Jeg er helt sikker.', 'helt sikker').surface, 'helt sikker')
  assert.equal(findInSentence('Han gik hjem.', 'gå'), null)
  assert.equal(findInSentence('Jeg er sikker.', 'helt sikker'), null)
})

test('pick-the-meaning never offers another meaning of the same word, and needs real options', () => {
  const pool = [
    { id: 'a', danish: 'a', senses: [sense('a1', 'большой')] },
    { id: 'b', danish: 'b', senses: [sense('b1', 'высокий голос')] },
    { id: 'c', danish: 'c', senses: [sense('c1', 'маленький')] },
    { id: 'd', danish: 'd', senses: [sense('d1', 'Я сегодня работаю.')], sentence: true },
  ]
  const options = selectMeaningDistractors({ answers: ['высокий', 'громкий'], pos: 'adjective', sentence: false, pool, count: 3, seed: 's' })
  assert.deepEqual([...options].sort(), ['большой', 'маленький'])

  const target = item('hoj')
  const candidate = { item: target, entryId: 'hoj', sense: target.vocabulary_entries.senses[0], primary: true, targetKey: senseTargetKey('hoj', 'hoj-s') }
  assert.equal(pickMeaningTask({ candidate, senses: [], distractors: [], meaningDistractors: ['one'], newTarget: false, reps: 0 }), null)
  const pick = pickMeaningTask({ candidate, senses: [], distractors: [], meaningDistractors: options, newTarget: false, reps: 0 })
  assert.equal(pick.kind, 'pick')
  assert.ok(pick.choices.includes(pick.answer))

  const cloze = clozeTypedTask({ candidate, senses: [], distractors: [], newTarget: false, reps: 0 })
  assert.equal(cloze.prompt, 'Jeg kan godt lide _____ i dag.')
  assert.equal(cloze.context, 'I like hoj today.')
})

test('a saved sentence is practised by building it and filling its longest word', () => {
  const sentence = item('s', {}, { danish: 'Jeg arbejder hjemme i dag.', entry_kind: 'sentence', senses: [sense('s-s', 'Я сегодня работаю дома.')] })
  const candidate = { item: sentence, entryId: 's', sense: sentence.vocabulary_entries.senses[0], primary: true, targetKey: senseTargetKey('s', 's-s') }
  const cloze = sentenceClozeTask({ candidate, senses: [], distractors: [], newTarget: false, reps: 0 })
  assert.equal(cloze.answer, 'arbejder')
  assert.equal(cloze.prompt, 'Jeg _____ hjemme i dag.')
  const session = planPractice({ ...base, items: [sentence, item('w1'), item('w2')] })
  const kinds = session.queue.filter((t) => t.entryId === 's').map((t) => t.kind)
  assert.ok(kinds.every((kind) => ['pick', 'assemble', 'cloze', 'produce', 'recall'].includes(kind)), kinds.join())
})
