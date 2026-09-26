import assert from 'node:assert/strict'
import test from 'node:test'
import { isManualEntry, manualEntryVerdict } from './manual-entry.ts'

const draft = { editing: false, storedUnverified: false, danishChanged: true, hasDanish: true, catalogLemma: null, catalogStatus: 'miss', wroteMeaning: false }

test('a catalog miss is manual before anything is written', () => {
  assert.equal(isManualEntry(draft), true)
})

test('a catalog pick is not manual, and an empty form is nothing yet', () => {
  assert.equal(isManualEntry({ ...draft, catalogLemma: 'gulv' }), false)
  assert.equal(isManualEntry({ ...draft, hasDanish: false }), false)
})

test('a catalog hit becomes manual only once the learner writes their own meaning', () => {
  assert.equal(isManualEntry({ ...draft, catalogStatus: 'hit' }), false)
  assert.equal(isManualEntry({ ...draft, catalogStatus: 'hit', wroteMeaning: true }), true)
})

test('a saved entry is manual when it already was, or when its Danish is being changed', () => {
  const saved = { ...draft, editing: true, danishChanged: false, catalogLemma: 'gulv' }
  assert.equal(isManualEntry(saved), false)
  assert.equal(isManualEntry({ ...saved, storedUnverified: true }), true)
  assert.equal(isManualEntry({ ...saved, danishChanged: true }), true)
})

test('saving waits while the catalog is still being asked, so the warning cannot be skipped', () => {
  assert.equal(manualEntryVerdict({ ...draft, catalogStatus: 'pending' }), 'pending')
  assert.equal(manualEntryVerdict({ ...draft, catalogStatus: 'pending', catalogLemma: 'gulv' }), 'verified')
  assert.equal(manualEntryVerdict({ ...draft, editing: true, catalogStatus: 'idle', danishChanged: false }), 'verified')
  assert.equal(manualEntryVerdict(draft), 'manual')
})
