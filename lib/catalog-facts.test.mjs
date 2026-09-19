import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCatalogFact, corFormForTag, corLemmaHasPartOfSpeech, resolvePartOfSpeech } from './catalog-facts.ts'

const GULV_FORMS = [{ form: 'gulv', lemma: 'gulv', tag: 'sb.itk.sg.ubest' }]
const GULV_LEMMA = [
  { form: 'gulv', lemma: 'gulv', tag: 'sb.itk.sg.ubest' },
  { form: 'gulvet', lemma: 'gulv', tag: 'sb.itk.sg.best' },
  { form: 'gulve', lemma: 'gulv', tag: 'sb.itk.pl.ubest' },
]
const VED_FORMS = [
  { form: 'ved', lemma: 'vide', tag: 'vb.præs.aktiv' },
  { form: 'ved', lemma: 'ved', tag: 'sb.itk.sg.ubest' },
  { form: 'ved', lemma: 'ved', tag: 'præp' },
]

function fact(overrides = {}) {
  return buildCatalogFact({
    lemma: 'gulv',
    kind: 'word',
    freqRank: 2841,
    posHint: 'noun',
    formRows: GULV_FORMS,
    lemmaRows: GULV_LEMMA,
    ipa: '[ˈɡɔlˀ]',
    ipaSource: 'wiktionary',
    ...overrides,
  })
}

test('a noun carries its gender and both inflected forms, read from the register', () => {
  assert.deepEqual(fact(), {
    lemma: 'gulv',
    kind: 'word',
    freq_rank: 2841,
    pos: 'noun',
    gender: 'et',
    definite_singular: 'gulvet',
    indefinite_plural: 'gulve',
    ipa: '[ˈɡɔlˀ]',
    ipa_source: 'wiktionary',
  })
})

test('an inflected form is never built by appending an article', () => {
  assert.equal(corFormForTag(GULV_LEMMA, 'gulv', 'sb.itk.sg.best'), 'gulvet')
  assert.equal(corFormForTag(GULV_LEMMA, 'gulv', 'sb.fk.sg.best'), null)
  const undecided = [...GULV_LEMMA, { form: 'gulvene', lemma: 'gulv', tag: 'sb.itk.sg.best' }]
  assert.equal(corFormForTag(undecided, 'gulv', 'sb.itk.sg.best'), null)
})

test('a word the register reads two ways reaches the generator with no part of speech', () => {
  assert.equal(resolvePartOfSpeech(VED_FORMS, 'ved', null), null)
  const built = fact({ lemma: 'ved', posHint: null, formRows: VED_FORMS, lemmaRows: VED_FORMS })
  assert.equal(built.pos, null)
  assert.equal(built.gender, null)
})

test('the frequency list only hints: COR must confirm the class before it is used', () => {
  assert.equal(resolvePartOfSpeech(VED_FORMS, 'ved', 'noun'), 'noun')
  assert.equal(resolvePartOfSpeech(VED_FORMS, 'ved', 'adjective'), null)
})

test('no gender means no inflected forms either', () => {
  const built = fact({ posHint: 'adjective', formRows: [{ form: 'gulv', lemma: 'gulv', tag: 'adj.pos' }] })
  assert.equal(built.gender, null)
  assert.equal(built.definite_singular, null)
  assert.equal(built.indefinite_plural, null)
})

test('a phrase is never judged against a register that holds no phrases', () => {
  const built = buildCatalogFact({
    lemma: 'godt lide',
    kind: 'phrase',
    freqRank: null,
    posHint: null,
    formRows: [],
    lemmaRows: [],
    ipa: null,
    ipaSource: null,
  })
  assert.deepEqual(built, {
    lemma: 'godt lide',
    kind: 'phrase',
    freq_rank: null,
    pos: 'phrase',
    gender: null,
    definite_singular: null,
    indefinite_plural: null,
    ipa: null,
    ipa_source: null,
  })
})

test('an IPA source is recorded only when there is an IPA', () => {
  assert.equal(fact({ ipa: null }).ipa_source, null)
})

test('COR answers whether a lemma is a lemma in a part of speech', () => {
  assert.ok(corLemmaHasPartOfSpeech(VED_FORMS, 'ved', 'noun'))
  assert.ok(!corLemmaHasPartOfSpeech(VED_FORMS, 'ved', 'verb'))
})
