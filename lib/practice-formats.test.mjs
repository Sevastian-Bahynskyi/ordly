import assert from 'node:assert/strict'
import test from 'node:test'
import { binaryTask, dialogueTasks, flashTask, matchTask, oddTask, sortTask } from './practice-formats.ts'
import { gradePracticeAnswer, isOfferedChoice } from './practice-grading.ts'
import { alternativeOrders, assembleTask } from './practice-exercises.ts'
import { senseTargetKey } from './practice-senses.ts'

function sense(id, text, patch = {}) {
  return { id, text, pos: 'adjective', gender: null, note: null, example: null, example_translation: null, source: 'ai', coverage: { recognized: 0, produced: 0, last_seen: null }, created_at: '2026-09-01T12:00:00Z', removed_at: null, ...patch }
}
function candidate(danish, text, patch = {}, entryPatch = {}) {
  const s = sense(`${danish}-s`, text, patch)
  const item = { id: `card-${danish}`, entry_id: danish, reps: 3, vocabulary_entries: { id: danish, danish, translation: text, senses: [s], entry_kind: 'word', example_sentence: null, example_translation: null, created_at: '2026-08-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z', ...entryPatch } }
  return { item, entryId: danish, sense: s, primary: true, targetKey: senseTargetKey(danish, s.id) }
}
const noun = (danish, text, gender) => candidate(danish, text, { pos: 'noun', gender })

test('binary never claims a meaning the word actually has as false', () => {
  const c = candidate('høj', 'высокий')
  for (const seed of ['a', 'b', 'c', 'd', 'e']) {
    const task = binaryTask({ candidate: { ...c, targetKey: `${c.targetKey}${seed}` }, senses: [c.sense], distractors: [], meaningDistractors: ['низкий'], newTarget: false })
    assert.ok(task.answer === 'true' ? task.claim === 'высокий' : task.claim === 'низкий')
    assert.deepEqual(task.choices, ['true', 'false'])
  }
  assert.equal(binaryTask({ candidate: c, senses: [c.sense], distractors: [], meaningDistractors: [], newTarget: false }), null, 'with no safe wrong meaning the answer would always be true: not offered')
  assert.equal(binaryTask({ candidate: candidate('Jeg går.', 'Я иду.', {}, { entry_kind: 'sentence' }), senses: [], distractors: [], meaningDistractors: ['x'], newTarget: false }), null)
})

test('match skips a board whose meanings could be read two ways', () => {
  const words = [candidate('lige', 'только что'), candidate('kun', 'только'), candidate('stor', 'большой'), candidate('lille', 'маленький'), candidate('ny', 'новый')]
  const task = matchTask(words, 's')
  const meanings = task.items.map((item) => item.answer)
  assert.equal(meanings.includes('только') && meanings.includes('только что'), false, '“только” is contained in “только что”')
  assert.equal(task.items.length, 4)
  assert.deepEqual([...task.choices].sort(), [...meanings].sort())
  assert.equal(matchTask(words.slice(0, 2), 's'), null, 'too few safe words: not offered')
})

test('sort and odd-one-out use only nouns whose gender the register recorded', () => {
  const nouns = [noun('bil', 'машина', 'en'), noun('hus', 'дом', 'et'), noun('bog', 'книга', 'en'), noun('bord', 'стол', 'et'), noun('plan', 'план', null), noun('stol', 'стул', 'en')]
  const sort = sortTask(nouns, 's')
  assert.deepEqual([...sort.categories], ['en', 'et'])
  assert.equal(sort.items.some((item) => item.text === 'plan'), false, 'a noun with two genders is never sorted')
  assert.ok(sort.items.every((item) => ['en', 'et'].includes(item.answer)))
  assert.equal(sortTask(nouns.filter((c) => c.sense.gender !== 'et'), 's'), null, 'one gender only: nothing to sort')

  const odd = oddTask(nouns, 's')
  const genders = odd.items.map((item) => item.answer)
  const oddGender = odd.items.find((item) => item.text === odd.answer).answer
  assert.equal(genders.filter((gender) => gender === oddGender).length, 1, 'exactly one item has the odd gender')
  assert.equal(odd.targetKey, odd.items.find((item) => item.text === odd.answer).targetKey, 'the odd noun is the assessed target')
})

test('a dialogue is offered only for a saved headword, and only in a language its situation exists in', () => {
  const saved = [candidate('gerne', 'охотно'), candidate('måske', 'может быть')]
  const russian = dialogueTasks(saved, 'ru', 's')
  assert.deepEqual(russian.map((task) => task.danish).sort(), ['gerne', 'måske'])
  assert.ok(russian.every((task) => task.support && /[а-я]/i.test(task.support)))
  assert.equal(dialogueTasks(saved, 'uk', 's').length, 0, 'no Ukrainian situation: ineligible, not shown in another language')
  assert.equal(dialogueTasks([candidate('hund', 'собака')], 'en', 's').length, 0)
  const [gerne] = dialogueTasks(saved, 'en', 's')
  assert.ok(gerne.choices.includes(gerne.answer) && gerne.accepted.every((reply) => gerne.choices.includes(reply)))
})

test('prepared alternatives are accepted: a second natural reply and a second word order', () => {
  const [gerne] = dialogueTasks([candidate('gerne', 'охотно')], 'en', 's')
  for (const reply of [gerne.answer, ...gerne.accepted]) assert.equal(gradePracticeAnswer(gerne, reply).result, 'correct')
  const distractor = gerne.choices.find((choice) => choice !== gerne.answer && !gerne.accepted.includes(choice))
  assert.equal(gradePracticeAnswer(gerne, distractor).result, 'incorrect')

  const order = { id: 'o', targetKey: 'k', entryId: 'e', senseId: 's', kind: 'assemble', prompt: 'Today I work.', answer: 'Jeg arbejder i dag.', accepted: ['I dag arbejder jeg.'], danish: 'arbejde', translation: '', hint: '', example: '', answerIsSentence: true, contentVersion: 'v', newTarget: false, retry: 0, choices: ['i', 'dag', 'Jeg', 'arbejder', 'jeg', 'I', 'dag.', 'arbejder'] }
  const board = { ...order, choices: ['arbejder', 'dag.', 'Jeg', 'i'] }
  assert.equal(gradePracticeAnswer(board, 'Jeg arbejder i dag.').result, 'correct')
  assert.equal(gradePracticeAnswer(board, 'i dag. arbejder Jeg').result, 'correct', 'the other valid order, built from the same tiles')
  assert.equal(gradePracticeAnswer(board, 'arbejder Jeg i dag.').result, 'incorrect')
  assert.equal(gradePracticeAnswer(board, 'Jeg arbejder i morgen.'), null, 'a word the board never offered')
})

test('matching and sorting attribute a mistake to the one word, not the board', () => {
  const task = matchTask([candidate('stor', 'большой'), candidate('lille', 'маленький'), candidate('ny', 'новый'), candidate('gammel', 'старый')], 's')
  const placement = Object.fromEntries(task.items.map((item) => [item.text, item.answer]))
  ;[placement.stor, placement.lille] = [placement.lille, placement.stor]
  const grade = gradePracticeAnswer(task, JSON.stringify(placement))
  assert.equal(grade.feedback, 'partial')
  assert.deepEqual(grade.targets.filter((target) => target.result === 'incorrect').map((target) => target.entryId).sort(), ['lille', 'stor'])
  assert.equal(grade.targets.filter((target) => target.result === 'correct').length, 2)

  assert.equal(isOfferedChoice(task, JSON.stringify({ ...placement, ny: placement.gammel })), false, 'one meaning cannot be placed twice')
  assert.equal(gradePracticeAnswer(task, '{"stor":"большой"}'), null, 'an incomplete board is not an answer')
  assert.equal(gradePracticeAnswer(task, 'not json'), null)
})

test('flash-reveal is recorded as a self-rating, never as checked recall', () => {
  const task = flashTask({ candidate: candidate('høj', 'высокий'), senses: [], distractors: [], newTarget: false })
  assert.deepEqual(gradePracticeAnswer(task, 'known'), { result: 'self_known', assistance: 'self', feedback: 'self_known' })
  assert.equal(gradePracticeAnswer(task, 'unknown').result, 'self_unknown')
  assert.equal(gradePracticeAnswer(task, 'correct'), null, 'a client cannot claim a checked verdict')
})

test('a harmless typo is forgiven, but another verified form of the word is the wrong form', () => {
  const cloze = { id: 'c', targetKey: 'k', entryId: 'e', senseId: 's', kind: 'cloze', prompt: 'Vi bor i _____.', answer: 'huset', danish: 'hus', translation: '', hint: '', example: '', answerIsSentence: false, contentVersion: 'v', newTarget: false, retry: 0, forms: ['hus', 'huse', 'husene'] }
  assert.equal(gradePracticeAnswer(cloze, 'huset').result, 'correct')
  assert.equal(gradePracticeAnswer(cloze, 'huest').result, 'mostly', 'a slip of the fingers')
  assert.deepEqual(gradePracticeAnswer(cloze, 'huse'), { result: 'incorrect', assistance: 'none', feedback: 'wrong_form' }, 'one letter away, but a different form')
  assert.equal(gradePracticeAnswer(cloze, 'hus').feedback, 'wrong_form')
})

test('a simple main clause ending in a time phrase also accepts the fronted order; anything less simple gets none', () => {
  assert.deepEqual(alternativeOrders('Jeg arbejder i dag.'), { accepted: ['I dag arbejder jeg.'] })
  assert.deepEqual(alternativeOrders('Jeg er ikke hjemme i aften.'), { accepted: ['I aften er jeg ikke hjemme.'] })
  assert.deepEqual(alternativeOrders('Vi vil spise nu.'), { accepted: ['Nu vil vi spise.'] })
  for (const sentence of ['Det gør jeg i dag.', 'De store huse ligger her i dag.', 'Hun siger, at hun kommer i dag.', 'Vi ses i morgen?', 'Jeg spiser og drikker i dag.', 'Bogen ligger på bordet i dag.']) {
    assert.deepEqual(alternativeOrders(sentence), {}, sentence)
  }
  // A real word-bank exercise built from saved Material accepts it.
  const c = candidate('arbejde', 'работать', {}, { example_sentence: 'Jeg arbejder i dag.', example_translation: 'Я сегодня работаю.' })
  const task = assembleTask({ candidate: c, senses: [c.sense], distractors: [], newTarget: false })
  assert.deepEqual(task.accepted, ['I dag arbejder jeg.'])
  assert.equal(gradePracticeAnswer(task, 'i dag. arbejder Jeg').result, 'correct')
})

test('a misspelling nearer another form of the word is the wrong form, and produce is protected too', () => {
  const cloze = { id: 'c', targetKey: 'k', entryId: 'e', senseId: 's', kind: 'cloze', prompt: 'Vi bor i _____.', answer: 'huset', danish: 'hus', translation: '', hint: '', example: '', answerIsSentence: false, contentVersion: 'v', newTarget: false, retry: 0, forms: ['hus', 'huse', 'husene'] }
  assert.equal(gradePracticeAnswer(cloze, 'husne').feedback, 'wrong_form', 'closer to “husene” than to “huset”')
  const produce = { ...cloze, kind: 'produce', prompt: 'дом', answer: 'hus', forms: ['huset', 'huse', 'husene'] }
  assert.equal(gradePracticeAnswer(produce, 'huset').feedback, 'wrong_form')
  assert.equal(gradePracticeAnswer(produce, 'hus').result, 'correct')
})

test('“I don’t know” on a board gives every word its own outcome', () => {
  const task = matchTask([candidate('stor', 'большой'), candidate('lille', 'маленький'), candidate('ny', 'новый')], 's')
  const grade = gradePracticeAnswer(task, '')
  assert.equal(grade.result, 'dont_know')
  assert.deepEqual(grade.targets.map((target) => target.result), ['dont_know', 'dont_know', 'dont_know'])
})
