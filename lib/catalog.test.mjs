import assert from 'node:assert/strict'
import { test } from 'node:test'
import { candidateLemmas, parseCatalogEntry, unlockedDraft } from './catalog.ts'
import { activeSenses, lockedSenses, translationFromSenses } from './senses.ts'

const ENTRY = {
  lemma: 'lige',
  kind: 'word',
  freq_rank: 120,
  pos: 'adverb',
  gender: null,
  definite_singular: null,
  pronunciation: 'ли́и',
  audio_path: 'words/lige.mp3',
  example_sentence: null,
  example_translation: null,
  word_catalog_sense: [
    { sense_id: '11111111-1111-4111-8111-111111111111', ordinal: 1, text: 'только что', pos: 'adverb', gender: null, example: 'Jeg er lige kommet.', example_translation: 'Я только что пришёл.' },
    { sense_id: '22222222-2222-4222-8222-222222222222', ordinal: 2, text: 'прямо', pos: 'adverb', gender: null, example: 'Gå lige frem.', example_translation: 'Иди прямо.' },
  ],
}

test('the typed form and everything the register inflects it from are candidates', () => {
  assert.deepEqual(candidateLemmas('Gulvet', [{ lemma: 'gulv' }]), ['gulvet', 'gulv'])
  assert.deepEqual(candidateLemmas('ved', [{ lemma: 'vide' }, { lemma: 'ved' }]), ['ved', 'vide'])
  assert.deepEqual(candidateLemmas('   ', []), [])
})

test('an entry with no meanings is not a catalog answer', () => {
  assert.equal(parseCatalogEntry({ ...ENTRY, word_catalog_sense: [] }), null)
  assert.equal(parseCatalogEntry({ lemma: 'lige' }), null)
  assert.equal(parseCatalogEntry(null), null)
})

test('meanings are read in ordinal order', () => {
  const parsed = parseCatalogEntry({ ...ENTRY, word_catalog_sense: [ENTRY.word_catalog_sense[1], ENTRY.word_catalog_sense[0]] })
  assert.deepEqual(parsed.senses.map((sense) => sense.ordinal), [1, 2])
})

test('unlocking teaches the picked meaning and locks the rest', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY), '22222222-2222-4222-8222-222222222222')
  assert.equal(draft.danish, 'lige')
  assert.equal(draft.pronunciation, 'ли́и')
  assert.deepEqual(activeSenses(draft.senses).map((sense) => sense.text), ['прямо'])
  assert.deepEqual(lockedSenses(draft.senses).map((sense) => sense.text), ['только что'])
})

test('a locked meaning never reaches the string the review flow grades against', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY), '22222222-2222-4222-8222-222222222222')
  assert.equal(translationFromSenses(draft.senses), 'прямо')
})

test('catalog sense ids are carried through, because FSRS state hangs off them', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY), '11111111-1111-4111-8111-111111111111')
  assert.deepEqual(
    draft.senses.map((sense) => sense.id).sort(),
    ENTRY.word_catalog_sense.map((sense) => sense.sense_id).sort(),
  )
})

test('the picked meaning hands its example to the entry, and does not repeat it', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY), '11111111-1111-4111-8111-111111111111')
  assert.equal(draft.example_sentence, 'Jeg er lige kommet.')
  assert.equal(draft.example_translation, 'Я только что пришёл.')
  assert.equal(activeSenses(draft.senses)[0].example, null)
  assert.equal(lockedSenses(draft.senses)[0].example, 'Gå lige frem.')
})

test('an unknown pick falls back to the first meaning rather than unlocking nothing', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY), 'no-such-sense')
  assert.deepEqual(activeSenses(draft.senses).map((sense) => sense.text), ['только что'])
})

test('a noun meaning the register classified is recorded as a fact, not an opinion', () => {
  const noun = parseCatalogEntry({
    ...ENTRY,
    lemma: 'gulv',
    pos: 'noun',
    gender: 'et',
    word_catalog_sense: [{ sense_id: '33333333-3333-4333-8333-333333333333', ordinal: 1, text: 'пол', pos: 'noun', gender: 'et', example: 'Bogen ligger på gulvet.', example_translation: 'Книга лежит на полу.' }],
  })
  assert.equal(unlockedDraft(noun, '33333333-3333-4333-8333-333333333333').senses[0].source, 'cor')
})
