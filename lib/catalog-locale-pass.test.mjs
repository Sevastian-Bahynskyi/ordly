import assert from 'node:assert/strict'
import test from 'node:test'
import { checkLocaleReply } from './catalog-locale-pass.ts'

const work = [
  { lemma: 'gang', kind: 'word', sense_id: '11111111-1111-5111-8111-111111111111', ordinal: 1, pos: 'noun', gender: 'en', ru: 'раз', example: null, example_ru: null },
  { lemma: 'gang', kind: 'word', sense_id: '22222222-2222-5222-8222-222222222222', ordinal: 2, pos: 'noun', gender: 'en', ru: 'коридор', example: 'Han står på gangen.', example_ru: 'Он стоит в коридоре.' },
]
const reply = (senses) => ({ lang: 'en', generator: 'test', senses })
const good = [
  { ...work[0], text: 'time (occurrence)', example: null, example_translation: null },
  { ...work[1], text: 'corridor, hallway', example: 'Han står på gangen.', example_translation: 'He is standing in the hallway.' },
].map(({ ru, example_ru, ...row }) => row)

test('a reply that only adds wording is clean', () => {
  assert.deepEqual(checkLocaleReply(work, reply(good), 'en'), [])
})

test('a reply may not change what it translates', () => {
  const errors = checkLocaleReply(work, reply([{ ...good[0], pos: 'verb' }, { ...good[1], example: 'Han går på gangen.' }]), 'en')
  assert.deepEqual(errors, ['gang#1: part of speech or gender changed', 'gang#2: the Danish example must be copied unchanged'])
})

test('a dropped sense, a merged meaning and a missing example translation are all refused', () => {
  assert.deepEqual(checkLocaleReply(work, reply([good[0]]), 'en'), ['gang#2: missing from the reply'])
  assert.deepEqual(checkLocaleReply(work, reply([good[0], { ...good[1], text: 'Time (occurrence)' }]), 'en'), ['gang#2: worded the same as gang#1'])
  assert.deepEqual(checkLocaleReply(work, reply([good[0], { ...good[1], example_translation: null }]), 'en'), ['gang#2: the example needs a translation'])
})

test('Danish letters in an English wording mean the word was not translated', () => {
  assert.deepEqual(checkLocaleReply(work, reply([{ ...good[0], text: 'gång' }, good[1]]), 'en'), ['gang#1: English wording contains Danish letters'])
})
