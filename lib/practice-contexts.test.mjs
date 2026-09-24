import assert from 'node:assert/strict'
import test from 'node:test'
import { contextLevelCap, contextsBySense } from './practice-contexts.ts'
import { contextAssembleTask, contextClozeTask } from './practice-exercises.ts'
import { gradePracticeAnswer } from './practice-grading.ts'
import { planPractice } from './practice-planner.ts'
import { senseTargetKey } from './practice-senses.ts'
import { isPracticeSession } from './practice-validation.ts'

const SENSE = '93c644ae-08f2-5a1c-ac53-75bf47a66274'
const rows = [
  { sense_id: SENSE, level: 'A2', catalog_sentence_variant: [
    { id: 'v2', version: 'x2', danish: 'Tasken ligger på gulvet.', target: 'gulvet', translations: { en: 'The bag is lying on the floor.', ru: 'Сумка лежит на полу.' }, orders: ['På gulvet ligger tasken.'], accepted: ['jorden'] },
    { id: 'v1', version: 'x1', danish: 'Bogen ligger på gulvet.', target: 'gulvet', translations: { ru: 'Книга лежит на полу.' }, orders: [] },
  ] },
  { sense_id: SENSE, level: 'B2', catalog_sentence_variant: [{ id: 'v3', version: 'x3', danish: 'Gulvene blev slebet.', target: 'Gulvene', translations: { en: 'The floors were sanded.', ru: 'Полы отшлифовали.' }, orders: [] }] },
  { sense_id: SENSE, level: 'A1', catalog_sentence_variant: 'broken' },
]

function sense(id, text, patch = {}) {
  return { id, text, pos: 'noun', gender: 'et', note: null, example: null, example_translation: null, source: 'cor', coverage: { recognized: 0, produced: 0, last_seen: null }, created_at: '2026-09-01T12:00:00Z', removed_at: null, ...patch }
}
function item(reps = 3, patch = {}) {
  const s = sense(SENSE, 'floor')
  return {
    id: 'card-gulv', user_id: 'u', entry_id: 'e-gulv', due: '2026-09-20T12:00:00Z', last_review: '2026-09-15T12:00:00Z',
    stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 5, reps, lapses: 0, learning_steps: 0, state: 2,
    vocabulary_entries: { id: 'e-gulv', user_id: 'u', danish: 'gulv', translation: 'floor', senses: [s], entry_kind: 'word', catalog_lemma: 'gulv', example_sentence: null, example_translation: null, created_at: '2026-08-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z', ...patch },
  }
}
const candidateOf = (it) => ({ item: it, entryId: 'e-gulv', sense: it.vocabulary_entries.senses[0], primary: true, targetKey: senseTargetKey('e-gulv', SENSE) })

test('only sentences translated into the learner language, at or just above their level, are offered', () => {
  const en = contextsBySense(rows, 'en', 'A1')
  assert.deepEqual(en[SENSE].map((c) => c.variantId), ['v2'], 'the Russian-only sentence is missing in English, not substituted; B2 is above an A1 learner')
  assert.deepEqual(contextsBySense(rows, 'ru', 'B1')[SENSE].map((c) => c.variantId), ['v1', 'v2', 'v3'])
  assert.deepEqual(contextsBySense(rows, 'uk', 'B2'), {})
  assert.deepEqual(['A1', 'A2', 'B1', 'B2', 'C1', null].map(contextLevelCap), [1, 2, 3, 3, 3, 1])
})

test('a catalog gap is the verified target form, and another form of the word is a wrong form, not a typo', () => {
  const context = contextsBySense(rows, 'en', 'B1')[SENSE][0]
  const task = contextClozeTask({ candidate: candidateOf(item()), senses: [], distractors: [], newTarget: false, forms: ['gulv', 'gulvet', 'gulve'], context })
  assert.equal(task.prompt, 'Tasken ligger på _____.')
  assert.equal(task.answer, 'gulvet')
  assert.equal(task.context, 'The bag is lying on the floor.')
  assert.deepEqual(task.source, { variantId: 'v2', version: 'x2' })
  assert.equal(gradePracticeAnswer(task, 'gulvet', 'none').result, 'correct')
  assert.equal(gradePracticeAnswer(task, 'gulve', 'none').feedback, 'wrong_form')
  assert.equal(gradePracticeAnswer(task, 'jorden', 'none').result, 'correct', 'a prepared alternative that fits the gap is not called wrong')
})

test('a catalog word-order task accepts every authored order', () => {
  const context = contextsBySense(rows, 'en', 'B1')[SENSE][0]
  const task = contextAssembleTask({ candidate: candidateOf(item()), senses: [], distractors: ['hus', 'bil'], newTarget: false, context })
  assert.equal(task.kind, 'assemble')
  assert.deepEqual(task.accepted, ['På gulvet ligger tasken.'])
  // Tiles keep the capital and stop they carry in the main sentence.
  assert.equal(gradePracticeAnswer(task, 'på gulvet. ligger Tasken', 'none').result, 'correct')
  assert.equal(gradePracticeAnswer(task, 'Tasken ligger på gulvet.', 'none').result, 'correct')
  assert.equal(gradePracticeAnswer(task, 'ligger Tasken på gulvet.', 'none').result, 'incorrect')
})

test('a saved catalog word with no example of its own is still practised in context', () => {
  const plan = planPractice({ items: [item(3)], attempts: [], targetMinutes: 5, seed: 'seed', locale: 'en', now: new Date('2026-09-25T12:00:00Z'), contextsBySense: contextsBySense(rows, 'en', 'B1') })
  const sourced = plan.queue.filter((task) => task.source)
  assert.ok(sourced.length >= 1, 'at least one exercise is built from the catalog sentence')
  assert.ok(sourced.every((task) => task.targetKey === senseTargetKey('e-gulv', SENSE)), 'the target stays the learner\'s own saved sense')
  assert.ok(isPracticeSession(plan), 'the persisted session with catalog sources still validates')

  const without = planPractice({ items: [item(3)], attempts: [], targetMinutes: 5, seed: 'seed', locale: 'uk', now: new Date('2026-09-25T12:00:00Z'), contextsBySense: contextsBySense(rows, 'uk', 'B1') })
  assert.equal(without.queue.some((task) => task.source), false, 'no Ukrainian sentence: nothing is substituted')
})
