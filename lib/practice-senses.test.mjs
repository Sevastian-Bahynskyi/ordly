import assert from 'node:assert/strict'
import test from 'node:test'
import { isSenseTargetKey, parseSenseTargetKey, senseCandidates, senseTargetKey, SENSE_PROMOTION_MIN_REPS, TARGET_KEY_MAX_LENGTH } from './practice-senses.ts'
import { planPractice } from './practice-planner.ts'
import { entryContentVersion, senseContentVersion } from './practice-content.ts'
import { assembleTask, chooseTask, selectDistractors, senseExerciseTask, senseTask } from './practice-exercises.ts'

/** D18: a sense is promotable only once its entry's recognition card has reps >= 3. */

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

test('a sense is not promotable until its entry is genuinely recognised', () => {
  const senses = [sense('s1', 'высокий')]
  for (let reps = 0; reps < SENSE_PROMOTION_MIN_REPS; reps += 1) {
    assert.deepEqual(senseCandidates([item('hoj', reps, senses)], {}), [], `reps ${reps} is too early to produce a meaning`)
  }
  const eligible = senseCandidates([item('hoj', SENSE_PROMOTION_MIN_REPS, senses)], {})
  assert.equal(eligible.length, 1)
  assert.equal(eligible[0].targetKey, senseTargetKey('hoj', 's1'))
  assert.equal(eligible[0].primary, true)
})

test('the primary sense leads; a second meaning waits until the first is a target', () => {
  const senses = [sense('s1', 'высокий'), sense('s2', 'громкий')]
  const eligible = senseCandidates([item('hoj', 5, senses)], {})
  assert.deepEqual(eligible.map((candidate) => candidate.sense.id), ['s1'], 'only the primary sense is offered first')

  const withPrimary = senseCandidates([item('hoj', 5, senses)], { [senseTargetKey('hoj', 's1')]: { task: {}, card: {} } })
  assert.deepEqual(withPrimary.map((candidate) => candidate.sense.id), ['s2'])
})

test('an entry-keyed objective from before this step counts as the primary sense, with no data change', () => {
  const senses = [sense('s1', 'высокий'), sense('s2', 'громкий')]
  const migrated = senseCandidates([item('hoj', 5, senses)], { hoj: { task: {}, card: {} } })
  assert.deepEqual(migrated.map((candidate) => candidate.sense.id), ['s2'], 'the legacy objective already covers the primary sense')
})

test('among eligible senses the coldest coverage wins', () => {
  const warm = item('warm', 5, [sense('w1', 'тёплый', { coverage: { recognized: 3, produced: 1, last_seen: '2026-09-09T12:00:00Z' } })])
  const cool = item('cool', 5, [sense('c1', 'прохладный', { coverage: { recognized: 3, produced: 1, last_seen: '2026-01-01T12:00:00Z' } })])
  const never = item('never', 5, [sense('n1', 'никогда')])
  const order = senseCandidates([warm, cool, never], {}).map((candidate) => candidate.sense.id)
  assert.deepEqual(order, ['n1', 'c1', 'w1'], 'never-seen first, then oldest last_seen')
})

test('promotion spends the shared two-new-targets-per-day budget and stops at one sense a session', () => {
  const items = [item('hoj', 5, [sense('s1', 'высокий'), sense('s2', 'громкий')]), item('svaert', 5, [sense('t1', 'трудно')])]
  const store = { revision: 0, session: null, objectives: {} }
  const input = { items, store, attempts: [], introducedToday: 0, dailyLimit: 10, language: 'en', aiEnabled: false, now }

  const promoted = planPractice(input).queue.filter((task) => task.senseId)
  assert.equal(promoted.length, 1, 'at most one sense is admitted per session')
  assert.equal(promoted[0].newTarget, true, 'so it counts against today’s new-target cap')
  assert.ok(isSenseTargetKey(promoted[0].targetKey))

  const spent = planPractice({ ...input, introducedToday: 2 })
  assert.equal(spent.queue.filter((task) => task.senseId).length, 0, 'a used-up daily budget admits no sense')

  const backlog = planPractice({ ...input, items: Array.from({ length: 20 }, (_, i) => item(`e${i}`, 5, [sense(`s${i}`, `m${i}`)])) })
  assert.equal(backlog.queue.filter((task) => task.senseId).length, 0, 'a large due queue admits nothing new')
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
  const built = senseTask({ candidate, senses, distractors: [], newTarget: false, reps: 1 })
  assert.equal(built.kind, 'sense')
  assert.equal(built.prompt, 'Det er hoj.')
  assert.equal(built.contrast, 'Hun taler med høj stemme.')
  assert.deepEqual([...built.choices].sort(), ['высокий', 'громкий'].sort())
  assert.equal(built.answer, 'высокий')
  assert.equal(built.cardId, undefined, 'a board must never carry the legacy card')

  const single = [sense('s1', 'высокий')]
  const alone = { item: item('hoj', 5, single), entryId: 'hoj', sense: single[0], primary: true, targetKey: senseTargetKey('hoj', 's1') }
  assert.equal(senseTask({ candidate: alone, senses: single, distractors: [], newTarget: false, reps: 1 }), null, 'one meaning is nothing to discriminate')
})

test('the exercise rotates with reps and always lands on something playable', () => {
  const senses = [sense('s1', 'высокий'), sense('s2', 'громкий', { example: 'Hun taler med høj stemme.' })]
  const entry = item('hoj', 5, senses)
  const candidate = { item: entry, entryId: 'hoj', sense: senses[0], primary: true, targetKey: senseTargetKey('hoj', 's1') }
  const kinds = [0, 1, 2, 3].map((reps) => senseExerciseTask({ candidate, senses, distractors: ['lav', 'stor', 'bred'], reps, newTarget: false }).kind)
  assert.deepEqual(kinds, ['choose', 'sense', 'assemble', 'produce'])
  for (const kind of kinds) assert.ok(['choose', 'sense', 'assemble', 'produce'].includes(kind))

  // With no example sentence at all, only unaided production is possible — and it is still offered.
  const bare = item('hoj', 5, [sense('s1', 'высокий')], { example_sentence: null })
  const bareCandidate = { item: bare, entryId: 'hoj', sense: sense('s1', 'высокий'), primary: true, targetKey: senseTargetKey('hoj', 's1') }
  assert.equal(chooseTask({ candidate: bareCandidate, senses: [], distractors: ['lav'], reps: 0, newTarget: false }), null)
  assert.equal(assembleTask({ candidate: bareCandidate, senses: [], distractors: [], reps: 0, newTarget: false }), null)
  assert.equal(senseExerciseTask({ candidate: bareCandidate, senses: [], distractors: ['lav'], reps: 0, newTarget: false }).kind, 'produce')
})

test('across entries every primary sense is promoted before any secondary one (D18)', () => {
  const secondaryCold = item('hoj', 5, [sense('s1', 'высокий', { coverage: { recognized: 1, produced: 1, last_seen: '2026-09-09T12:00:00Z' } }), sense('s2', 'громкий')])
  const primaryWarm = item('lav', 5, [sense('l1', 'низкий', { coverage: { recognized: 4, produced: 2, last_seen: '2026-09-09T11:00:00Z' } })])
  const objectives = { [senseTargetKey('hoj', 's1')]: { task: {}, card: {} } }
  const order = senseCandidates([secondaryCold, primaryWarm], objectives).map((candidate) => candidate.sense.id)
  assert.deepEqual(order, ['l1', 's2'], 'a never-seen secondary meaning still waits behind a warm primary one')
})

test('a sense objective keeps its schedule when another meaning is added or accepted (D15)', () => {
  const senses = [sense('s1', 'высокий'), sense('s2', 'громкий', { example: 'Hun taler med høj stemme.' })]
  const before = item('hoj', 5, senses)
  const key = senseTargetKey('hoj', 's2')
  const card = { due: '2026-09-09T12:00:00Z', stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 3, reps: 2, lapses: 0, learning_steps: 0, state: 2, last_review: '2026-09-06T12:00:00Z' }
  const objective = { task: { id: `${key}:0`, targetKey: key, entryId: 'hoj', senseId: 's2', objective: 'production', kind: 'produce', contentVersion: senseContentVersion(before.vocabulary_entries, senses[1]) }, card }

  const grown = [...senses, sense('s3', 'выше', { source: 'user' }), sense('s4', 'важный')]
  const after = item('hoj', 5, grown, { translation: grown.map((s) => s.text).join(', ') })
  const store = { revision: 0, session: null, objectives: { [key]: objective } }
  const plan = planPractice({ items: [after], store, attempts: [], introducedToday: 0, dailyLimit: 2, language: 'en', aiEnabled: false, now })
  assert.ok(plan.queue.some((task) => task.targetKey === key), 'the due sense objective is still served, so its FSRS card is reused')

  const renamed = item('hoj', 5, [senses[0], { ...senses[1], text: 'шумный' }])
  const stale = planPractice({ items: [renamed], store, attempts: [], introducedToday: 0, dailyLimit: 2, language: 'en', aiEnabled: false, now })
  assert.equal(stale.queue.some((task) => task.targetKey === key && !task.newTarget), false, 'a changed meaning is a different target')
})

test('an accepted user sense does not change the entry version, so review-backed tasks survive it', () => {
  const senses = [sense('s1', 'трудно')]
  const base = item('svaert', 5, senses).vocabulary_entries
  const accepted = { ...base, senses: [...senses, sense('u1', 'тяжело', { source: 'user' })], translation: 'трудно, тяжело' }
  assert.equal(entryContentVersion(accepted), entryContentVersion(base))
  assert.notEqual(entryContentVersion({ ...base, senses: [...senses, sense('a2', 'сложно')] }), entryContentVersion(base), 'a real new meaning still is a change')
})
