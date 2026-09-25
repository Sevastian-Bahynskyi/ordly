import assert from 'node:assert/strict'
import test from 'node:test'
import { emptySlotsNeedVaryingTarget, frontedSubordinateNeedsComma, invalidRequiresTarget, mixedSFormConstruction } from './catalog-families-style.ts'

test('a fronted subordinate clause without a comma is flagged', () => {
  const slots = { subordinate: [{ da: 'Selvom oppositionen protesterede' }, { da: 'Da krisen ramte landet' }] }
  const bad = '{subordinate} statsministeren fremlagde en reform.'
  const good = '{subordinate}, fremlagde statsministeren en reform.'
  assert.equal(frontedSubordinateNeedsComma(bad, slots).length, 1)
  assert.deepEqual(frontedSubordinateNeedsComma(good, slots), [])
})

test('a slot that does not front a subordinate clause is left alone', () => {
  const slots = { subject: [{ da: 'Bogen' }, { da: 'Tasken' }] }
  assert.deepEqual(frontedSubordinateNeedsComma('{subject} ligger på {target}.', slots), [])
})

test('a trailing (non-fronted) subordinate clause is not flagged', () => {
  const slots = { verb: [{ da: 'gennemgået' }] }
  assert.deepEqual(frontedSubordinateNeedsComma('Eleverne {target} allerede {verb} pensum, da læreren introducerede emnet.', slots), [])
})

test('an adjective target with empty slots is always flagged, varying or not', () => {
  assert.equal(emptySlotsNeedVaryingTarget('adjective', {}, [{ target: 'klar' }, { target: 'klare' }]).length, 1)
  assert.equal(emptySlotsNeedVaryingTarget('adjective', {}, [{ target: 'klar' }, { target: 'klar' }]).length, 1)
})

test('an adjective target is fine once a real slot is present', () => {
  assert.deepEqual(emptySlotsNeedVaryingTarget('adjective', { subject: [{ da: 'Planen' }, { da: 'Planerne' }] }, [{ target: 'klar' }, { target: 'klare' }]), [])
})

test('a verb target with empty slots needs at least two distinct forms', () => {
  assert.equal(emptySlotsNeedVaryingTarget('verb', {}, [{ target: 'dele' }, { target: 'dele' }]).length, 1)
  assert.deepEqual(emptySlotsNeedVaryingTarget('verb', {}, [{ target: 'blev' }, { target: 'bliver' }]), [])
})

test('a family with a real slot is never checked for target variety', () => {
  assert.deepEqual(emptySlotsNeedVaryingTarget('verb', { subject: [{ da: 'Han' }] }, [{ target: 'dele' }, { target: 'dele' }]), [])
})

test('mixing an -s passive verb form with a non-s form is flagged', () => {
  assert.equal(mixedSFormConstruction([{ target: 'meddelte' }, { target: 'meddeltes' }]).length, 1)
})

test('mixing an -s noun form with a non-s form is flagged too', () => {
  assert.equal(mixedSFormConstruction([{ target: 'dele' }, { target: 'deles' }]).length, 1)
})

test('a "requires" naming "target" is flagged', () => {
  const slots = { resultat: [{ requires: { target: ['ringede'] } }] }
  assert.equal(invalidRequiresTarget(slots).length, 1)
})

test('a "requires" naming a real slot is fine', () => {
  const slots = { time: [{ requires: { verb: [1] } }] }
  assert.deepEqual(invalidRequiresTarget(slots), [])
})

test('consistent forms, all -s or all not, are fine', () => {
  assert.deepEqual(mixedSFormConstruction([{ target: 'blev' }, { target: 'bliver' }]), [])
  assert.deepEqual(mixedSFormConstruction([{ target: 'siges' }, { target: 'siges' }]), [])
})
