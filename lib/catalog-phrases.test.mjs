import assert from 'node:assert/strict'
import test from 'node:test'
import { attestationCounter, comparePhraseCandidates, countPhraseOccurrences, normalizePhrase, phraseComponentIpa, phraseFormRows, phraseForms, phraseStressIndex, phraseHeadForms, phrasePartOfSpeech, phraseShape } from './catalog-phrases.ts'

const verbs = new Set(['stå', 'finde', 'glæde', 'have', 'komme'])
const isVerb = (token) => verbs.has(token)

test('normalization keeps real phrases and names why others are refused', () => {
  assert.deepEqual(normalizePhrase('  Stå  op '), { phrase: 'stå op', tokens: ['stå', 'op'] })
  assert.deepEqual(normalizePhrase('stå'), { rejected: 'not-multiword' })
  assert.deepEqual(normalizePhrase('stå op med solen hver dag'), { rejected: 'too-long' })
  assert.deepEqual(normalizePhrase('give nogen ret'), { rejected: 'placeholder' })
  assert.deepEqual(normalizePhrase('tage sin tid'), { rejected: 'placeholder' })
  assert.deepEqual(normalizePhrase('falde på en'), { rejected: 'placeholder' })
  assert.deepEqual(normalizePhrase('klemme sig ned i..'), { rejected: 'bad-characters' })
  assert.deepEqual(normalizePhrase('få 7 i et fag'), { rejected: 'bad-characters' })
  assert.ok('phrase' in normalizePhrase('en gang til'))
})

test('shape follows the words, not a guess', () => {
  assert.deepEqual(phraseShape(['stå', 'op'], isVerb), { shape: 'particle-verb', head: 'stå' })
  assert.deepEqual(phraseShape(['finde', 'ud', 'af'], isVerb), { shape: 'particle-verb', head: 'finde' })
  assert.deepEqual(phraseShape(['glæde', 'sig', 'til'], isVerb), { shape: 'reflexive-verb', head: 'glæde' })
  assert.deepEqual(phraseShape(['have', 'lyst', 'til'], isVerb), { shape: 'verb-expression', head: 'have' })
  assert.deepEqual(phraseShape(['på', 'grund', 'af'], isVerb), { shape: 'prepositional', head: null })
  assert.deepEqual(phraseShape(['i', 'morgen'], isVerb), { shape: 'adverbial', head: null })
  assert.deepEqual(phraseShape(['heller', 'ikke'], isVerb), { shape: 'other', head: null })
  assert.equal(phrasePartOfSpeech('reflexive-verb'), 'verb')
  assert.equal(phrasePartOfSpeech('prepositional'), 'preposition')
  assert.equal(phrasePartOfSpeech('adverbial'), 'adverb')
})

test('head forms drop participles, passives and clipped spellings', () => {
  assert.deepEqual(phraseHeadForms('stå', ['stod', 'stå', 'stående', 'stået', 'står', 'stås']), ['stod', 'stå', 'stået', 'står'])
  assert.deepEqual(phraseHeadForms('have', ["ha'", 'har', 'havde', 'haft', 'have']), ['haft', 'har', 'havde', 'have'])
  assert.deepEqual(phraseHeadForms('synes', ['syntes', 'synes', 'syns']), ['synes', 'syns', 'syntes'])
})

test('phrase forms inflect only the head and expand the reflexive over its closed set', () => {
  assert.deepEqual(phraseForms(['stå', 'op'], 'stå', ['stod', 'står']), ['stod op', 'står op'])
  const reflexive = phraseForms(['glæde', 'sig', 'til'], 'glæde', ['glæder'])
  assert.deepEqual(reflexive, ['glæder dig til', 'glæder jer til', 'glæder mig til', 'glæder os til', 'glæder sig til'])
  assert.deepEqual(phraseForms(['i', 'morgen'], null, []), ['i morgen'])
})

test('attestation counts contiguous occurrences only, once per sentence', () => {
  assert.equal(countPhraseOccurrences('Jeg står op. Han står op.', ['står op']), 2)
  assert.equal(countPhraseOccurrences('Hvornår står du op?', ['står op']), 0)
  const count = attestationCounter(['Jeg står op kl. syv.', 'Hvornår står du op?', 'Vi stod op, og de stod op.'])
  assert.equal(count(['står op', 'stod op']), 2)
})

test('candidates rank by attestation, then by their rarest word', () => {
  const base = { tokens: [], shape: 'adverbial', pos: 'adverb', head: null, forms: [], sources: [] }
  const list = [
    { ...base, phrase: 'b', attested: 5, component_rank: 900 },
    { ...base, phrase: 'a', attested: 5, component_rank: 100 },
    { ...base, phrase: 'c', attested: 9, component_rank: null },
  ].sort(comparePhraseCandidates)
  assert.deepEqual(list.map((c) => c.phrase), ['c', 'a', 'b'])
})

test('a class a source declares outranks the leading-verb heuristic', async () => {
  const { declaredCategory } = await import('./catalog-phrases.ts')
  const heal = (token) => token === 'hele'
  assert.deepEqual(phraseShape(['hele', 'tiden'], heal), { shape: 'verb-expression', head: 'hele' })
  assert.deepEqual(phraseShape(['hele', 'tiden'], heal, 'adverb'), { shape: 'adverbial', head: null })
  assert.equal(phrasePartOfSpeech('other', 'pronoun'), 'pronoun')
  assert.equal(phrasePartOfSpeech('particle-verb', 'adverb'), 'verb')
  const sources = [
    { source: 'dsl-framenet-1.0', ref: 'framenet:1', category: 'verb' },
    { source: 'wikidata-lexemes', ref: 'wikidata:L1', category: 'adverb' },
    { source: 'ddo-fullforms', ref: 'ddo:1', category: 'preposition' },
  ]
  assert.equal(declaredCategory(sources), 'preposition')
  assert.equal(declaredCategory(sources.slice(0, 2)), 'adverb')
  assert.equal(declaredCategory([{ source: 'wikidata-lexemes', ref: 'wikidata:L2' }]), null)
})

const STÅ = [
  { form_key: 'infinitive', form_text: 'stå' }, { form_key: 'present', form_text: 'står' }, { form_key: 'past', form_text: 'stod' },
  { form_key: 'past_participle', form_text: 'stået' }, { form_key: 'imperative', form_text: 'stå' }, { form_key: 'present_participle', form_text: 'stående' },
]

test('a verb phrase records its inflected forms and the split forms a finite head takes', () => {
  assert.deepEqual(phraseFormRows(['stå', 'op'], 'stå', STÅ), [
    { form_key: 'imperative', form_text: 'stå op' },
    { form_key: 'infinitive', form_text: 'stå op' },
    { form_key: 'past', form_text: 'stod op' },
    { form_key: 'past', form_text: 'stod … op' },
    { form_key: 'past_participle', form_text: 'stået op' },
    { form_key: 'present', form_text: 'står op' },
    { form_key: 'present', form_text: 'står … op' },
  ])
})

test('a reflexive phrase splits after its head and expands the pronoun on both sides of the gap', () => {
  const rows = phraseFormRows(['glæde', 'sig', 'til'], 'glæde', [{ form_key: 'present', form_text: 'glæder' }])
  assert.deepEqual(rows.filter((row) => row.form_text.includes('…')).map((row) => row.form_text), ['glæder … dig til', 'glæder … jer til', 'glæder … mig til', 'glæder … os til', 'glæder … sig til'])
  assert.equal(rows.length, 10)
})

test('a phrase without a head verb, or a head with no recorded paradigm, records no forms', () => {
  assert.deepEqual(phraseFormRows(['i', 'morgen'], null, []), [])
  assert.deepEqual(phraseFormRows(['stå', 'op'], 'stå', []), [])
})

test('a phrase pronunciation is read from the IPA of every one of its words, or not at all', () => {
  const ipa = new Map([['stå', '[ˈsdɔˀ]'], ['op', '[ʌb]']])
  assert.equal(phraseComponentIpa(['stå', 'op'], (word) => ipa.get(word) ?? null), '[ˈsdɔˀ] [ʌb]')
  assert.equal(phraseComponentIpa(['stå', 'ud'], (word) => ipa.get(word) ?? null), null, 'one word without IPA: no pronunciation')
})

test('a phrase carries one stress, placed by its type', () => {
  assert.equal(phraseStressIndex(['stå', 'op'], 'particle-verb'), 1)
  assert.equal(phraseStressIndex(['finde', 'ud', 'af'], 'particle-verb'), 1)
  assert.equal(phraseStressIndex(['tage', 'af', 'sted'], 'particle-verb'), 2, 'a two-word particle stresses its last word')
  assert.equal(phraseStressIndex(['sove', 'over', 'sig'], 'particle-verb'), 1, 'a closing reflexive is unstressed')
  assert.equal(phraseStressIndex(['sætte', 'sig', 'ned'], 'reflexive-verb'), 2, 'a reflexive verb with an adverb particle stresses the particle')
  assert.equal(phraseStressIndex(['sætte', 'sig', 'ind', 'i'], 'reflexive-verb'), 2)
  assert.equal(phraseStressIndex(['kigge', 'sig', 'omkring'], 'reflexive-verb'), 2)
  assert.equal(phraseStressIndex(['komme', 'sig', 'over'], 'particle-verb'), 0, 'a reflexive labelled a particle verb is still read as reflexive')
  assert.equal(phraseStressIndex(['vente', 'på'], 'prepositional-verb'), 0)
  assert.equal(phraseStressIndex(['glæde', 'sig', 'til'], 'reflexive-verb'), 0)
  assert.equal(phraseStressIndex(['have', 'lyst', 'til'], 'collocation'), 1)
  assert.equal(phraseStressIndex(['lade', 'være', 'med', 'at'], 'collocation'), 1)
  assert.equal(phraseStressIndex(['på', 'grund', 'af'], 'complex-preposition'), 1)
  assert.equal(phraseStressIndex(['i', 'morgen'], 'time-expression'), 1)
  assert.equal(phraseStressIndex(['møde', 'hinanden'], 'collocation'), 1)
  assert.equal(phraseStressIndex(['gå', 'i', 'seng'], 'idiom'), 2)
  assert.equal(phraseStressIndex(['i', 'det', 'hele', 'taget'], 'adverbial'), 3)
})
