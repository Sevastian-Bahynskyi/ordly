import assert from 'node:assert/strict'
import test from 'node:test'
import { danishWords, replaceWordInText } from './danish-text.ts'

test('words are split the way Danish writes them', () => {
  assert.deepEqual(danishWords('Han kan godt lide badetøj.'), ['Han', 'kan', 'godt', 'lide', 'badetøj'])
  assert.deepEqual(danishWords('en 8-årig dreng'), ['en', 'årig', 'dreng'], 'a token holding a digit is not a word to spell')
  assert.deepEqual(danishWords('barnets bog'), ['barnets', 'bog'])
  assert.deepEqual(danishWords('...'), [])
})

test('a correction replaces the word itself and nothing that merely contains it', () => {
  assert.equal(replaceWordInText('Jeg har badetoj med.', 'badetoj', 'badetøj'), 'Jeg har badetøj med.')
  assert.equal(replaceWordInText('Huset i hus.', 'hus', 'hus!'), 'Huset i hus!.', 'the occurrence inside `Huset` is skipped')
  assert.equal(replaceWordInText('Æblet er rødt', 'Æblet', 'Æblerne'), 'Æblerne er rødt', 'æøå count as letters on both sides')
  assert.equal(replaceWordInText('nothing to do', 'absent', 'x'), 'nothing to do')
  // Only the first occurrence: the learner may have meant the second one differently.
  assert.equal(replaceWordInText('tak, tak', 'tak', 'takk'), 'takk, tak')
})
