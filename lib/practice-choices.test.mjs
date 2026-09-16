import assert from 'node:assert/strict'
import test from 'node:test'
import { actOnPractice, PracticeConflict } from './practice-server.ts'
import { countsForSchedule, finishPracticeTask, legacyEvidence, unaidedForm } from './practice.ts'
import { isPracticeAttempt, isPracticeTask } from './practice-validation.ts'

/**
 * D14. A task answered by tapping commits its attempt and may advance the sense objective, but it
 * must always commit `legacy_change = null` — that is the one rule keeping choice-based
 * recognition out of `review_cards`, `review_logs` and `commit_practice`'s mastery update.
 */

const card = { id: 'card-1', user_id: 'user', entry_id: 'entry-1', due: '2026-09-10T12:00:00Z', stability: 2, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 4, lapses: 0, learning_steps: 0, state: 2, last_review: '2026-09-08T12:00:00Z' }

function fixture(queue, current = null) {
  let store = { revision: 1, objectives: {}, session: { version: 1, id: '11111111-1111-4111-8111-111111111111', queue, attempts: [], completed: 0, elapsedSeconds: 10, createdAt: '2026-09-10T11:00:00Z', aiEnabled: false, aiCalls: 0, current } }
  const commits = []
  const client = {
    from(table) {
      const data = table === 'practice_state' ? store
        : table === 'profiles' ? { daily_new_limit: 2, default_translation_language: 'ru' }
        : table === 'review_cards' ? card
        : []
      const query = { then(resolve) { return Promise.resolve({ data, error: null }).then(resolve) } }
      for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single', 'maybeSingle', 'insert', 'update']) query[method] = () => query
      return query
    },
    async rpc(name, args) {
      assert.equal(name, 'commit_practice')
      commits.push(args)
      store = { revision: store.revision + 1, session: args.next_session, objectives: args.next_objectives }
      return { data: store, error: null }
    },
  }
  return { client, commits, state: () => store, action: (action, extra = {}) => ({ action, revision: store.revision, taskId: store.session.queue[0]?.id || '', responseMs: 1200, replays: 0, elapsedSeconds: 10, ...extra }) }
}

const targetKey = 'entry:11111111-1111-4111-8111-111111111111:sense:22222222-2222-4222-8222-222222222222'
// `cardId` is present on purpose. Choice tasks are never built with one, so this proves the rule
// holds on the assistance flag alone and not merely because no card was attached.
const senseChoice = {
  id: `${targetKey}:sense`, targetKey, entryId: null, objective: 'meaning', kind: 'sense', stage: 'remember',
  prompt: 'Han er en høj mand.', contrast: 'Hun taler med høj stemme.', answer: 'высокий',
  danish: 'høj', translation: 'высокий', hint: 'Read both sentences.', example: 'Han er en høj mand.',
  audioText: null, source: 'saved', newTarget: false, retry: 0, senseId: '22222222-2222-4222-8222-222222222222',
  choices: ['высокий', 'громкий'], cardId: card.id, contentVersion: 'v1',
}

test('a tapped answer commits its attempt but never writes legacy_change', async () => {
  const f = fixture([senseChoice])
  await actOnPractice(f.client, 'user', f.action('answer', { answer: 'высокий' }))
  const answered = f.state().session.current
  assert.equal(answered.assistance, 'choices')
  assert.equal(answered.result, 'correct')

  await actOnPractice(f.client, 'user', f.action('rate', { rating: 3 }))
  const rated = f.commits.at(-1)
  assert.equal(rated.legacy_change, null, 'a chosen answer must never touch review_cards')
  assert.ok(rated.attempt, 'the attempt itself is still recorded as evidence')
  assert.equal(rated.attempt.assistance, 'choices')
  assert.ok(isPracticeAttempt(rated.attempt), 'the stored attempt shape stays valid')
  // It may advance the sense objective's own FSRS state — that is the point of recording it.
  assert.ok(rated.next_objectives[targetKey], 'the sense objective is scheduled')
  assert.ok(rated.next_objectives[targetKey].card.reps >= 1)
})

test('Again on a tapped answer still records a failure without reaching the legacy card', async () => {
  const f = fixture([senseChoice])
  await actOnPractice(f.client, 'user', f.action('answer', { answer: 'громкий' }))
  await actOnPractice(f.client, 'user', f.action('rate', { rating: 1 }))
  const rated = f.commits.at(-1)
  assert.equal(rated.legacy_change, null, 'not even an Again may advance review_cards from a board')
  assert.equal(rated.attempt.rating, 1)
  // Again preserves the objective and requeues it in the same session.
  assert.equal(f.state().session.queue.length, 1)
  assert.equal(f.state().session.queue[0].targetKey, targetKey)
  assert.equal(f.state().session.queue[0].kind, 'sense')
})

test('the same harness DOES write legacy_change for an unaided typed answer', async () => {
  // Control. Without this the null above could just mean the fixture never writes a legacy change.
  const typed = { ...senseChoice, id: 'entry-1:meaning', targetKey: 'entry-1', kind: 'recall', objective: 'meaning', choices: undefined, contrast: undefined, answer: 'высокий' }
  const f = fixture([typed])
  await actOnPractice(f.client, 'user', f.action('answer', { answer: 'высокий' }))
  assert.equal(f.state().session.current.assistance, 'none')
  await actOnPractice(f.client, 'user', f.action('rate', { rating: 3 }))
  const rated = f.commits.at(-1)
  assert.ok(rated.legacy_change, 'an unaided typed answer is exactly what may advance review_cards')
  assert.equal(rated.legacy_change.id, card.id)
  assert.equal(rated.legacy_change.expectedReps, card.reps)
})

test('the same task typed unaided is the path that does advance the legacy card', () => {
  const typed = { ...senseChoice, kind: 'recall', choices: undefined, objective: 'meaning' }
  assert.equal(legacyEvidence(typed, { assistance: 'none' }), true)
  assert.equal(legacyEvidence(senseChoice, { assistance: 'choices' }), false)
  assert.equal(legacyEvidence({ ...senseChoice, cardId: undefined }, { assistance: 'none' }), false)
  // A choices answer is still schedulable evidence for the objective; only the legacy door closes.
  assert.equal(countsForSchedule(senseChoice, { assistance: 'choices', target: 'yes' }, 3), true)
  assert.equal(countsForSchedule(senseChoice, { assistance: 'hint', target: 'yes' }, 3), false)
})

test('free text cannot be passed off as a chosen option', async () => {
  const f = fixture([senseChoice])
  await assert.rejects(actOnPractice(f.client, 'user', f.action('answer', { answer: 'anything at all' })), PracticeConflict)
})

test('a word bank accepts only its own tiles, in any order the learner places them', async () => {
  const assemble = { ...senseChoice, id: `${targetKey}:assemble`, kind: 'assemble', prompt: 'He is a tall man.', answer: 'Han er en høj mand.', answerIsSentence: true, choices: ['Han', 'er', 'en', 'høj', 'mand.', 'lille'], contrast: undefined }
  const ok = fixture([assemble])
  await actOnPractice(ok.client, 'user', ok.action('answer', { answer: 'Han er en høj mand.' }))
  assert.equal(ok.state().session.current.result, 'correct')
  assert.equal(ok.state().session.current.assistance, 'choices')

  const wrong = fixture([assemble])
  await actOnPractice(wrong.client, 'user', wrong.action('answer', { answer: 'Han er en lille mand.' }))
  assert.equal(wrong.state().session.current.result, 'incorrect', 'a distractor tile is graded as wrong, not repaired by AI')

  const forged = fixture([assemble])
  await assert.rejects(actOnPractice(forged.client, 'user', forged.action('answer', { answer: 'Han er en stor mand.' })), PracticeConflict)
})

test('a supported success returns as unaided production, and discrimination is not re-served', () => {
  const assemble = { ...senseChoice, kind: 'assemble', choices: ['Han', 'er', 'høj'], answerIsSentence: true }
  const [retry] = finishPracticeTask([assemble], 3, 'choices')
  assert.equal(retry.kind, 'produce')
  assert.equal(retry.choices, undefined, 'the tiles are gone, so the retry actually tests recall')
  assert.ok(isPracticeTask(retry))
  // Sense discrimination has no unaided form: the choice is the exercise.
  assert.equal(unaidedForm(senseChoice), null)
  assert.deepEqual(finishPracticeTask([senseChoice], 3, 'choices'), [])
  // An explicit Again keeps the original board, exactly as guided practice requires.
  assert.equal(finishPracticeTask([senseChoice], 1, 'choices')[0].kind, 'sense')
})

test('the new kinds and assistance survive round-tripping through stored state', () => {
  for (const kind of ['assemble', 'choose', 'sense']) {
    assert.ok(isPracticeTask({ ...senseChoice, kind }), `${kind} must validate as a stored task`)
  }
  assert.ok(isPracticeAttempt({ id: 'a', taskId: 'b', targetKey, objective: 'meaning', kind: 'choose', result: 'correct', rating: 3, assistance: 'choices', modality: 'typed', responseMs: 900, at: '2026-09-10T12:00:00Z', lastExposureAt: null, replays: 0 }))
  // `practice_attempts.target_key` is capped at 100 characters in the database.
  assert.ok(targetKey.length <= 100)
  assert.equal(isPracticeAttempt({ id: 'a', taskId: 'b', targetKey: 'x'.repeat(101), objective: null, kind: 'choose', result: 'correct', rating: 3, assistance: 'choices', modality: 'typed', responseMs: 900, at: '2026-09-10T12:00:00Z', lastExposureAt: null, replays: 0 }), false)
})
