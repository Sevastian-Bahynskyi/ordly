import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanDictionary, findMisspellings } from './spelling.ts'

/**
 * Issue #5 §3. These tests build the real dictionary once (~571 ms, ~126 MB), because the whole
 * question is whether the shipped data behaves — a mocked dictionary would prove nothing.
 */

test('the morphological fields that made real words look wrong are stripped, flags are not', () => {
  const cleaned = cleanDictionary([
    'blive ph:blir al:bliver al:blev',
    '-årig/24,10,49,39',
    'hvem po:pron',
    'hus/5,2',
  ].join('\n'))
  assert.deepEqual(cleaned.split('\n'), ['blive', '-årig/24,10,49,39', 'hvem', 'hus/5,2'])
})

test('the real vocabulary is accepted, including the words the raw dictionary flagged', async () => {
  // Loaded naively these four are rejected; they are 4 of the 12.2% the morphological fields broke.
  const clean = await findMisspellings('Blive hvem hver nogle hyggelig København selvfølgelig skulderen håndklæde.')
  assert.deepEqual(clean, [], 'no real Danish word may be flagged — a false positive teaches a wrong lesson')
})

test('learner typos are caught, with the correction ranked first', async () => {
  const found = await findMisspellings('Jeg har badetoj og en lejlighet, og jeg begynner.')
  assert.deepEqual(found.map((item) => item.word), ['badetoj', 'lejlighet', 'begynner'])
  assert.equal(found[0].suggestions[0], 'badetøj')
  assert.equal(found[1].suggestions[0], 'lejlighed')
  assert.equal(found[2].suggestions[0], 'begynder')
})

test('a word that is not Danish at all is flagged, capitalised or not', async () => {
  const [flagged] = await findMisspellings('tinker')
  assert.equal(flagged.word, 'tinker')
  // A sentence-initial capital is not a mistake: the lowercase form is checked too.
  assert.deepEqual(await findMisspellings('Huset er stort.'), [])
})

test('what it cannot judge, it stays quiet about — that is the model’s half of the job', async () => {
  // `skulderne` and `stadigt` are real words in the wrong form. Orthography belongs to nspell;
  // form and naturalness stay with the model, so a spell checker must not object here.
  assert.deepEqual(await findMisspellings('Han skulderne gør ondt.'), [])
  assert.deepEqual(await findMisspellings('Jeg er stadigt træt.'), [])
})
