import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addCatalogMeaning, candidateLemmas, encounteredFormOf, lookupCatalog, parseCatalogEntry, unlockedDraft } from './catalog.ts'
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
  assert.equal(parseCatalogEntry({ ...ENTRY, word_catalog_sense: [] }, 'ru'), null)
  assert.equal(parseCatalogEntry({ lemma: 'lige' }, 'ru'), null)
  assert.equal(parseCatalogEntry(null, 'ru'), null)
})

test('meanings are read in ordinal order', () => {
  const parsed = parseCatalogEntry({ ...ENTRY, word_catalog_sense: [ENTRY.word_catalog_sense[1], ENTRY.word_catalog_sense[0]] }, 'ru')
  assert.deepEqual(parsed.senses.map((sense) => sense.ordinal), [1, 2])
})

test('unlocking teaches the picked meaning and locks the rest', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY, 'ru'), '22222222-2222-4222-8222-222222222222')
  assert.equal(draft.danish, 'lige')
  assert.equal(draft.pronunciation, 'ли́и')
  assert.equal(draft.audio_path, 'words/lige.mp3')
  assert.deepEqual(activeSenses(draft.senses).map((sense) => sense.text), ['прямо'])
  assert.deepEqual(lockedSenses(draft.senses).map((sense) => sense.text), ['только что'])
})

test('a locked meaning never reaches the string the review flow grades against', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY, 'ru'), '22222222-2222-4222-8222-222222222222')
  assert.equal(translationFromSenses(draft.senses), 'прямо')
})

test('catalog sense ids are carried through, because FSRS state hangs off them', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY, 'ru'), '11111111-1111-4111-8111-111111111111')
  assert.deepEqual(
    draft.senses.map((sense) => sense.id).sort(),
    ENTRY.word_catalog_sense.map((sense) => sense.sense_id).sort(),
  )
})

test('the picked meaning hands its example to the entry, and does not repeat it', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY, 'ru'), '11111111-1111-4111-8111-111111111111')
  assert.equal(draft.example_sentence, 'Jeg er lige kommet.')
  assert.equal(draft.example_translation, 'Я только что пришёл.')
  assert.equal(activeSenses(draft.senses)[0].example, null)
  assert.equal(lockedSenses(draft.senses)[0].example, 'Gå lige frem.')
})

test('an unknown pick falls back to the first meaning rather than unlocking nothing', () => {
  const draft = unlockedDraft(parseCatalogEntry(ENTRY, 'ru'), 'no-such-sense')
  assert.deepEqual(activeSenses(draft.senses).map((sense) => sense.text), ['только что'])
})

test('a noun meaning the register classified is recorded as a fact, not an opinion', () => {
  const noun = parseCatalogEntry({
    ...ENTRY,
    lemma: 'gulv',
    pos: 'noun',
    gender: 'et',
    word_catalog_sense: [{ sense_id: '33333333-3333-4333-8333-333333333333', ordinal: 1, text: 'пол', pos: 'noun', gender: 'et', example: 'Bogen ligger på gulvet.', example_translation: 'Книга лежит на полу.' }],
  }, 'ru')
  assert.equal(unlockedDraft(noun, '33333333-3333-4333-8333-333333333333').senses[0].source, 'cor')
})

// Issue #14: one sense identity, several learner languages.
const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'
const BILINGUAL = {
  ...ENTRY,
  word_catalog_sense: [
    ...ENTRY.word_catalog_sense.map((sense) => ({ ...sense, lang: 'ru' })),
    { sense_id: S1, ordinal: 1, lang: 'en', text: 'just (now)', pos: 'adverb', gender: null, example: 'Jeg er lige kommet.', example_translation: 'I have just arrived.' },
  ],
}

test('the same catalog sense reads in the learner language and keeps its identity', () => {
  const english = parseCatalogEntry(BILINGUAL, 'en')
  const russian = parseCatalogEntry(BILINGUAL, 'ru')
  assert.deepEqual(english.senses.map((sense) => [sense.sense_id, sense.text]), [[S1, 'just (now)']])
  assert.deepEqual(russian.senses.map((sense) => [sense.sense_id, sense.text]), [[S1, 'только что'], [S2, 'прямо']])
  assert.equal(english.senses[0].example_translation, 'I have just arrived.')
  assert.equal(unlockedDraft(english, S1).senses.find((sense) => !sense.locked).id, unlockedDraft(russian, S1).senses.find((sense) => !sense.locked).id)
})

test('a meaning missing in the learner language is flagged, never shown in another language', () => {
  const english = parseCatalogEntry(BILINGUAL, 'en')
  assert.deepEqual(english.missing, [{ sense_id: S2, ordinal: 2 }])
  assert.equal(english.senses.some((sense) => sense.text === 'прямо'), false)
  const draft = unlockedDraft(english, S1)
  assert.equal(draft.senses.some((sense) => sense.text === 'прямо'), false, 'not even as a locked meaning')
  assert.equal(draft.example_translation, 'I have just arrived.', 'the entry example translation follows the language too')

  // A word whose every meaning is missing is still a catalog answer: its headword, forms and audio
  // need no translation, so the learner can save it with their own meaning.
  const untranslated = parseCatalogEntry({ ...ENTRY, word_catalog_sense: ENTRY.word_catalog_sense.map((sense) => ({ ...sense, lang: 'ru' })) }, 'en')
  assert.equal(untranslated.senses.length, 0)
  assert.equal(untranslated.missing.length, 2)
  const headword = unlockedDraft(untranslated, null)
  assert.equal(headword.danish, 'lige')
  assert.deepEqual(headword.senses, [])
  assert.equal(headword.example_translation, '', 'a Russian example translation is not offered to an English learner')
})

test('Ukrainian keeps working with no supplied meanings at all', () => {
  const ukrainian = parseCatalogEntry(BILINGUAL, 'uk')
  assert.equal(ukrainian.senses.length, 0)
  assert.equal(ukrainian.missing.length, 2)
})

test('the encountered form is claimed only when it is a verified form of the headword', () => {
  const gulv = { lemma: 'gulv', forms: [{ form_key: 'definite_singular', form_text: 'gulvet', gender: '' }, { form_key: 'indefinite_singular', form_text: 'gulv', gender: '' }] }
  assert.deepEqual(encounteredFormOf(gulv, 'Gulvet'), { text: 'gulvet', verified: true, isHeadword: false })
  assert.deepEqual(encounteredFormOf(gulv, 'gulv'), { text: 'gulv', verified: true, isHeadword: true })
  assert.deepEqual(encounteredFormOf({ lemma: 'gulv', forms: [] }, 'gulvene'), { text: 'gulvene', verified: false, isHeadword: false })
})

test('adding a catalog meaning to a saved word unlocks it in place, never a second card', () => {
  const saved = unlockedDraft(parseCatalogEntry(ENTRY, 'ru'), S1).senses
  const draft = unlockedDraft(parseCatalogEntry(ENTRY, 'ru'), S2).senses
  const added = addCatalogMeaning(saved, draft, S2)
  assert.equal(added.status, 'added')
  assert.deepEqual(activeSenses(added.senses).map((sense) => sense.id).sort(), [S1, S2].sort())
  assert.equal(added.senses.length, 2, 'the locked copy is unlocked, not duplicated')

  assert.equal(addCatalogMeaning(added.senses, draft, S2).status, 'already-saved')

  // A manually saved word gains the catalog meaning with its catalog id; its own meanings stay.
  const manual = [{ id: 'm1', text: 'только', pos: null, gender: null, note: null, example: null, example_translation: null, source: 'user', coverage: { recognized: 2, produced: 0, last_seen: null }, created_at: '2026-09-01T00:00:00Z', removed_at: null }]
  const merged = addCatalogMeaning(manual, draft, S2)
  assert.equal(merged.status, 'added')
  assert.deepEqual(merged.senses.map((sense) => sense.id), ['m1', S2])
  assert.deepEqual(merged.senses[0], manual[0], 'existing meanings and their coverage are untouched')

  // No meaning was supplied in the learner language, so the learner wrote one: it is appended once.
  const own = [{ ...manual[0], id: 'o1', text: 'straight', source: 'user' }]
  const withOwn = addCatalogMeaning(manual, own, null)
  assert.deepEqual(withOwn.senses.map((sense) => sense.text), ['только', 'straight'])
  assert.equal(addCatalogMeaning(withOwn.senses, own, null).status, 'already-saved')
})

/** A read-only fake of the two catalog reads the lookup makes. */
function catalogClient(catalog, cor) {
  return {
    from(table) {
      const filters = {}
      const query = {
        select: () => query,
        eq: (column, value) => { filters[column] = value; return query },
        in: (column, values) => { filters[column] = values; return query },
        then(resolve) {
          const data = table === 'cor_form' ? cor.filter((row) => row.form === filters.form)
            : catalog.filter((row) => row.kind === filters.kind && filters.lemma.includes(row.lemma))
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return query
    },
  }
}

const GULV = {
  lemma: 'gulv', kind: 'word', freq_rank: 1500, pos: 'noun', gender: 'et', definite_singular: 'gulvet', pronunciation: null, audio_path: null, example_sentence: null, example_translation: null,
  word_catalog_sense: [
    { sense_id: '93c644ae-08f2-5a1c-ac53-75bf47a66274', ordinal: 1, lang: 'ru', text: 'пол', pos: 'noun', gender: 'et', example: null, example_translation: null },
    { sense_id: '93c644ae-08f2-5a1c-ac53-75bf47a66274', ordinal: 1, lang: 'en', text: 'floor', pos: 'noun', gender: 'et', example: null, example_translation: null },
  ],
  word_catalog_form: [{ form_key: 'indefinite_singular', form_text: 'gulv', gender: '' }, { form_key: 'definite_singular', form_text: 'gulvet', gender: '' }],
}
const COR = [{ form: 'gulvet', lemma: 'gulv', tag: 'sb.' }]

test('an encountered form resolves to its headword in the learner language, with the same sense in either language', async () => {
  const english = await lookupCatalog(catalogClient([GULV], COR), 'gulvet', 'en')
  assert.equal(english.candidates.length, 1)
  const [gulv] = english.candidates
  assert.equal(gulv.lemma, 'gulv')
  assert.deepEqual(gulv.senses.map((sense) => sense.text), ['floor'])
  assert.deepEqual(encounteredFormOf(gulv, 'gulvet'), { text: 'gulvet', verified: true, isHeadword: false })
  assert.equal(unlockedDraft(gulv, gulv.senses[0].sense_id).danish, 'gulv', 'the headword is saved, not the inflection')

  // Switching the learner language changes the wording offered, never the identity.
  const russian = await lookupCatalog(catalogClient([GULV], COR), 'gulvet', 'ru')
  assert.deepEqual(russian.candidates[0].senses.map((sense) => [sense.sense_id, sense.text]), [[gulv.senses[0].sense_id, 'пол']])
})

test('adding the headword directly yields the same catalog shape as adding its inflection', async () => {
  const viaForm = (await lookupCatalog(catalogClient([GULV], COR), 'gulvet', 'en')).candidates[0]
  const direct = (await lookupCatalog(catalogClient([GULV], COR), 'gulv', 'en')).candidates[0]
  const shape = (entry) => ({ ...unlockedDraft(entry, entry.senses[0].sense_id), senses: unlockedDraft(entry, entry.senses[0].sense_id).senses.map(({ created_at: _c, ...sense }) => sense) })
  assert.deepEqual(shape(viaForm), shape(direct))
  assert.deepEqual(viaForm.forms, direct.forms)
})

test('an ambiguous form offers every reading, and a miss leaves the manual flow alone', async () => {
  const vide = { ...GULV, lemma: 'vide', pos: 'verb', gender: null, word_catalog_form: [], word_catalog_sense: [{ sense_id: '44444444-4444-4444-8444-444444444444', ordinal: 1, lang: 'en', text: 'to know', pos: 'verb', gender: null, example: null, example_translation: null }] }
  const ved = { ...GULV, lemma: 'ved', pos: 'preposition', gender: null, word_catalog_form: [], word_catalog_sense: [{ sense_id: '55555555-5555-4555-8555-555555555555', ordinal: 1, lang: 'en', text: 'at, by, near', pos: 'preposition', gender: null, example: null, example_translation: null }] }
  const both = await lookupCatalog(catalogClient([vide, ved], [{ form: 'ved', lemma: 'vide', tag: 'v.' }, { form: 'ved', lemma: 'ved', tag: 'præp.' }]), 'ved', 'en')
  assert.deepEqual(both.candidates.map((entry) => entry.lemma), ['ved', 'vide'], 'both readings, the typed lemma first; nothing is chosen for the learner')

  const miss = await lookupCatalog(catalogClient([], []), 'tinker', 'en')
  assert.deepEqual(miss, { candidates: [], miss: 'unknown' })
})
