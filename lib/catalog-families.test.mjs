import assert from 'node:assert/strict'
import test from 'node:test'
import { familyId, minLevelForRank, publishFamily, validateFamily, variantDanish } from './catalog-families.ts'

const matrix = {
  version: 'test',
  situations: [{ id: 'home', levels: ['A1', 'A2'] }],
  grammar: [{ id: 'noun-definite', levels: ['A1', 'A2'] }, { id: 'noun-indefinite', levels: ['A1'] }],
}
const known = new Set('bogen tasken katten ligger på gulvet gulv et en der er i stuen har vi nyt nye stort huset hus'.split(' '))
const checks = {
  matrix,
  unknownWords: (sentence) => sentence.toLowerCase().replace(/[.!?,]/g, '').split(/\s+/).filter((word) => word && !known.has(word)),
  benchmark: new Set(['katten ligger på gulvet']),
}
const work = { lemma: 'gulv', kind: 'word', sense_id: '93c644ae-08f2-5a1c-ac53-75bf47a66274', pos: 'noun', gender: 'et', freq_rank: 900, min_level: 'A2', ru: 'пол', en: 'floor', forms: ['gulv', 'gulvet', 'gulve', 'gulvene'] }
const family = (patch = {}) => ({
  lemma: 'gulv', kind: 'word', sense_id: work.sense_id, level: 'A2', situation: 'home', grammar: 'noun-definite',
  frame: '{subject} ligger på {target}.',
  slots: { subject: [{ da: 'Bogen' }, { da: 'Tasken' }] },
  variants: [
    { slots: { subject: 0 }, target: 'gulvet', en: 'The book is lying on the floor.', ru: 'Книга лежит на полу.', orders: [] },
    { slots: { subject: 1 }, target: 'gulvet', en: 'The bag is lying on the floor.', ru: 'Сумка лежит на полу.', orders: ['På gulvet ligger tasken.'] },
  ],
  ...patch,
})

test('a family whose every variant checks out is clean, and publishing derives stable ids', () => {
  assert.deepEqual(validateFamily(family(), work, checks), [])
  const published = publishFamily(family())
  assert.equal(published.id, familyId(family()))
  assert.equal(published.id, publishFamily(family()).id)
  assert.deepEqual(published.variants.map((variant) => variant.danish), ['Bogen ligger på gulvet.', 'Tasken ligger på gulvet.'])
  assert.notEqual(published.variants[0].id, published.variants[1].id)
})

test('a form no source lists is never taught', () => {
  const bad = family({ variants: [family().variants[0], { ...family().variants[1], target: 'gulven' }] })
  assert.ok(validateFamily(bad, work, checks).some((error) => error.includes('"gulven" is not a verified form of gulv')))
})

test('an article that disagrees with the noun gender is a wrong inflection', () => {
  const bad = family({ grammar: 'noun-indefinite', level: 'A2', frame: 'Vi har {det} {target}.', slots: { det: [{ da: 'en' }, { da: 'et nyt' }] }, variants: [
    { slots: { det: 0 }, target: 'gulv', en: 'We have a floor.', ru: 'У нас есть пол.' },
    { slots: { det: 1 }, target: 'gulv', en: 'We have a new floor.', ru: 'У нас новый пол.' },
  ] })
  const errors = validateFamily(bad, work, checks)
  assert.ok(errors.some((error) => error.includes('v1: article does not agree')))
  assert.ok(!errors.some((error) => error.includes('v2: article')))
})

test('a combination the constraints exclude is refused', () => {
  const constrained = family({ slots: { subject: [{ da: 'Bogen' }, { da: 'Tasken' }] }, frame: '{subject} ligger på {target} {where}.', variants: undefined })
  constrained.slots.where = [{ da: 'i stuen', requires: { subject: [0] } }]
  constrained.variants = [
    { slots: { subject: 0, where: 0 }, target: 'gulvet', en: 'The book is lying on the floor in the living room.', ru: 'Книга лежит на полу в гостиной.' },
    { slots: { subject: 1, where: 0 }, target: 'gulvet', en: 'The bag is lying on the floor in the living room.', ru: 'Сумка лежит на полу в гостиной.' },
  ]
  assert.deepEqual(validateFamily(constrained, work, checks), ['gulv v2: where[0] may not appear with subject[1]'])
})

test('an alternative word order must use exactly the same words', () => {
  const bad = family({ variants: [family().variants[0], { ...family().variants[1], orders: ['På gulvet ligger bogen.'] }] })
  assert.ok(validateFamily(bad, work, checks).some((error) => error.includes('does not use the same words')))
})

test('level, matrix cell, spelling source and benchmark are all enforced', () => {
  assert.ok(validateFamily(family({ level: 'A1' }), work, checks).some((error) => error.includes('below this word\'s band')))
  assert.ok(validateFamily(family({ situation: 'moon' }), work, checks).some((error) => error.includes('unknown situation')))
  assert.ok(validateFamily(family(), work, { ...checks, unknownWords: () => null }).some((error) => error.includes('could not be consulted')))
  const copied = family({ slots: { subject: [{ da: 'Katten' }, { da: 'Tasken' }] }, variants: [{ ...family().variants[0], en: 'The cat is lying on the floor.', ru: 'Кошка лежит на полу.' }, family().variants[1]] })
  assert.ok(validateFamily(copied, work, checks).some((error) => error.includes('frozen benchmark')))
})

test('translations must be present, in the right script, and distinct per variant', () => {
  const bad = family({ variants: [family().variants[0], { ...family().variants[1], en: 'Сумка лежит на полу.', ru: 'Книга лежит на полу.' }] })
  const errors = validateFamily(bad, work, checks)
  assert.ok(errors.some((error) => error.includes('English translation missing or not English')))
  assert.ok(errors.some((error) => error.includes('Russian translation repeats')))
})

test('the frame fills to a capitalised sentence and the rank band sets the lowest level', () => {
  assert.equal(variantDanish({ frame: '{target} er stort.', slots: {} }, { slots: {}, target: 'huset' }), 'Huset er stort.')
  assert.deepEqual([1, 751, 1501, 3001, null].map(minLevelForRank), ['A1', 'A2', 'B1', 'B2', 'B1'])
})
