import assert from 'node:assert/strict'
import test from 'node:test'
import { isSenseTargetKey, parseSenseTargetKey, senseTargetKey, TARGET_KEY_MAX_LENGTH } from './practice-senses.ts'
import { planPractice } from './practice-planner.ts'
import { currentTaskContentVersion } from './practice-content.ts'
import { assembleTask, chooseTask, selectDistractors, senseTask } from './practice-exercises.ts'

/** Practice targets are senses of saved entries (D8, D18). */

const now = new Date('2026-09-10T12:00:00Z')

function sense(id, text, patch = {}) {
  return { id, text, pos: 'adjective', gender: null, note: null, example: null, example_translation: null, source: 'ai', coverage: { recognized: 0, produced: 0, last_seen: null }, created_at: '2026-09-01T12:00:00Z', removed_at: null, ...patch }
}

function item(id, reps, senses, patch = {}) {
  return {
    id: `card-${id}`, entry_id: id, reps, due: '2026-09-09T12:00:00Z', last_review: '2026-09-08T12:00:00Z',
    stability: 2, difficulty: 5, elapsed_days: 1, scheduled_days: 1, lapses: 0, learning_steps: 0, state: 2,
    vocabulary_entries: { id, danish: id, translation: senses.map((s) => s.text).join(', '), senses, example_sentence: `Det er ${id}.`, example_translation: null, entry_kind: 'word', updated_at: '2026-09-01T12:00:00Z', ...patch },
  }
}

test('a sense key is free-form text that still fits the database column', () => {
  const key = senseTargetKey('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
  assert.equal(key, 'entry:11111111-1111-4111-8111-111111111111:sense:22222222-2222-4222-8222-222222222222')
  assert.ok(key.length <= TARGET_KEY_MAX_LENGTH, 'two uuids must still fit practice_attempts.target_key')
  assert.deepEqual(parseSenseTargetKey(key), { entryId: '11111111-1111-4111-8111-111111111111', senseId: '22222222-2222-4222-8222-222222222222' })
  assert.equal(parseSenseTargetKey('entry-1'), null)
  assert.equal(isSenseTargetKey('frame:request'), false)
})

test('distractors come from the learner’s own words, prefer the part of speech, and never offer a confirmed synonym', () => {
  const pool = [
    { id: 'lav', danish: 'lav', senses: [sense('a', 'низкий')] },
    { id: 'bil', danish: 'bil', senses: [sense('b', 'машина', { pos: 'noun' })] },
    { id: 'stor', danish: 'stor', senses: [sense('c', 'большой')] },
  ]
  const chosen = selectDistractors({ answer: 'høj', pos: 'adjective', pool, count: 3, seed: 'x' })
  assert.deepEqual([...chosen].sort(), ['bil', 'lav', 'stor'])
  assert.equal(chosen.indexOf('bil'), 2, 'the mismatched part of speech ranks last')

  const safe = selectDistractors({ answer: 'høj', pos: 'adjective', pool, excludeIds: ['lav'], count: 3, seed: 'x' })
  assert.equal(safe.includes('lav'), false, 'a confirmed synonym might genuinely fit the gap')
  assert.equal(selectDistractors({ answer: 'høj', pos: 'adjective', pool: [{ id: 'hoj2', danish: 'HØJ', senses: [] }], count: 3, seed: 'x' }).length, 0, 'the answer is never its own distractor')
  // Same seed, same board — the queue is persisted, so a reload must not reshuffle it.
  assert.deepEqual(selectDistractors({ answer: 'høj', pos: 'adjective', pool, count: 2, seed: 's' }), selectDistractors({ answer: 'høj', pos: 'adjective', pool, count: 2, seed: 's' }))
})

test('sense discrimination needs two real sentences, and shows the contrasting one', () => {
  const senses = [sense('s1', 'высокий'), sense('s2', 'громкий', { example: 'Hun taler med høj stemme.', example_translation: 'Она говорит громким голосом.' })]
  const entry = item('hoj', 5, senses)
  const candidate = { item: entry, entryId: 'hoj', sense: senses[0], primary: true, targetKey: senseTargetKey('hoj', 's1') }
  const built = senseTask({ candidate, senses, distractors: [], newTarget: false })
  assert.equal(built.kind, 'sense')
  assert.equal(built.prompt, 'Det er hoj.')
  assert.equal(built.contrast, 'Hun taler med høj stemme.')
  assert.deepEqual([...built.choices].sort(), ['высокий', 'громкий'].sort())
  assert.equal(built.answer, 'высокий')
  assert.equal('cardId' in built, false, 'a board never carries a Review card')

  const single = [sense('s1', 'высокий')]
  const alone = { item: item('hoj', 5, single), entryId: 'hoj', sense: single[0], primary: true, targetKey: senseTargetKey('hoj', 's1') }
  assert.equal(senseTask({ candidate: alone, senses: single, distractors: [], newTarget: false }), null, 'one meaning is nothing to discriminate')
})

test('without an example sentence the boards that need one are not built', () => {
  const bare = item('hoj', 5, [sense('s1', 'высокий')], { example_sentence: null })
  const bareCandidate = { item: bare, entryId: 'hoj', sense: sense('s1', 'высокий'), primary: true, targetKey: senseTargetKey('hoj', 's1') }
  assert.equal(chooseTask({ candidate: bareCandidate, senses: [], distractors: ['lav'], newTarget: false }), null)
  assert.equal(assembleTask({ candidate: bareCandidate, senses: [], distractors: [], newTarget: false }), null)
})

const plan = (items, attempts = []) => planPractice({ items, attempts, targetMinutes: 5, seed: 'seed', locale: 'en', now })

test('a known word rotates to the meaning least recently practised or reviewed (D18)', () => {
  const senses = [
    sense('s1', 'высокий', { coverage: { recognized: 3, produced: 1, last_seen: '2026-09-09T12:00:00Z' } }),
    sense('s2', 'громкий', { example: 'Hun taler med høj stemme.' }),
  ]
  const fresh = plan([item('hoj', 5, senses)])
  assert.ok(fresh.queue.every((task) => task.senseId === 's2'), 'the never-seen second meaning takes its turn')

  const practised = [{ id: 'a', taskId: 't', targetKey: senseTargetKey('hoj', 's2'), entryId: 'hoj', kind: 'cloze', result: 'correct', assistance: 'none', responseMs: 1, at: '2026-09-10T11:00:00Z' }]
  assert.ok(plan([item('hoj', 5, senses)], practised).queue.every((task) => task.senseId === 's1'), 'practice history counts as having seen it')
  assert.ok(plan([item('hoj', 1, senses)]).queue.every((task) => task.senseId === 's1'), 'a barely known word stays on its primary meaning')
})

test('a queued exercise survives another meaning being added, not its own meaning changing (D15)', () => {
  const senses = [sense('s1', 'высокий'), sense('s2', 'громкий', { example: 'Hun taler med høj stemme.' })]
  const [task] = plan([item('hoj', 1, senses)]).queue
  const grown = { ...item('hoj', 1, [...senses, sense('s3', 'выше', { source: 'user' })]).vocabulary_entries }
  assert.equal(currentTaskContentVersion(grown, task), task.contentVersion)
  const renamed = item('hoj', 1, [{ ...senses[0], text: 'шумный' }, senses[1]]).vocabulary_entries
  assert.notEqual(currentTaskContentVersion(renamed, task), task.contentVersion)
  const removed = item('hoj', 1, [{ ...senses[0], removed_at: '2026-09-10T12:00:00Z' }, senses[1]]).vocabulary_entries
  assert.equal(currentTaskContentVersion(removed, task), null)
})
