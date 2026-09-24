import assert from 'node:assert/strict'
import test from 'node:test'
import { gradePracticeAnswer, isOfferedChoice } from './practice-grading.ts'

const base = { id: 't', targetKey: 'entry:e:sense:s', entryId: 'e', senseId: 's', translation: 'difficult', hint: 'h', example: 'Det er svært.', contentVersion: 'v', newTarget: false, retry: 0 }
const choose = { ...base, kind: 'choose', prompt: 'Det er _____.', answer: 'svært', danish: 'svært', answerIsSentence: false, choices: ['let', 'svært', 'stor'] }
const cloze = { ...base, kind: 'cloze', prompt: 'Vi _____ sammen.', answer: 'spiste', danish: 'at spise', answerIsSentence: false }
const produceWord = { ...base, kind: 'produce', prompt: 'difficult', answer: 'svært', danish: 'svært', answerIsSentence: false }
const produceSentence = { ...base, kind: 'produce', prompt: 'I work today.', answer: 'Jeg arbejder i dag.', danish: 'Jeg arbejder i dag.', answerIsSentence: true }
const assemble = { ...base, kind: 'assemble', prompt: 'He is tall.', answer: 'Han er høj.', danish: 'høj', answerIsSentence: true, choices: ['er', 'Han', 'høj.', 'lille'] }

test('a tapped answer is right or wrong by construction and always counts as supported', () => {
  assert.deepEqual(gradePracticeAnswer(choose, 'svært'), { result: 'correct', assistance: 'choices', feedback: 'Correct.' })
  assert.equal(gradePracticeAnswer(choose, 'let').result, 'incorrect')
  assert.equal(gradePracticeAnswer(assemble, 'Han er høj.').result, 'correct')
  assert.equal(gradePracticeAnswer(assemble, 'Han er lille').result, 'incorrect')
  assert.equal(isOfferedChoice(choose, 'anything'), false, 'free text cannot pose as a chosen option')
  assert.equal(isOfferedChoice(assemble, 'Han er høj.'), true)
  assert.equal(isOfferedChoice(assemble, 'Han er stor'), false)
  assert.equal(isOfferedChoice(assemble, 'Han Han er'), false, 'a tile is used once')
})

test('“I don’t know” is its own outcome, for tapped and typed exercises alike', () => {
  assert.deepEqual(gradePracticeAnswer(choose, '  ').result, 'dont_know')
  assert.equal(gradePracticeAnswer(produceWord, '').assistance, 'model')
})

test('a typed answer is checked locally: exact, harmless typo, wrong form, wrong word', () => {
  assert.equal(gradePracticeAnswer(produceWord, 'svært').result, 'correct')
  assert.equal(gradePracticeAnswer(produceWord, 'svaert').result, 'mostly')
  assert.equal(gradePracticeAnswer(produceWord, 'let').result, 'incorrect')
  const baseForm = gradePracticeAnswer(cloze, 'spise')
  assert.equal(baseForm.result, 'incorrect', 'the form is what the gap tests, so typo tolerance cannot forgive it')
  assert.match(baseForm.feedback, /spiste/)
  assert.equal(gradePracticeAnswer(produceWord, 'svært', 'hint').assistance, 'hint', 'a hint stays on the record')
})

test('a different typed sentence is unverified, never marked wrong on a guess', () => {
  assert.equal(gradePracticeAnswer(produceSentence, 'Jeg arbejder i dag.').result, 'correct')
  assert.equal(gradePracticeAnswer(produceSentence, 'I dag arbejder jeg.').result, 'unverified')
})
