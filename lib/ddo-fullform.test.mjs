import assert from 'node:assert/strict'
import test from 'node:test'
import { formsOf, parseFullForms } from './ddo-fullform.ts'

const sample = ['gulv\tgulv\t\tsb.\t1', 'gulvet\tgulv\t\tsb.\t1', 'ved\tved\t1\tsb.\t2', 'veddet\tved\t1\tsb.\t2', 'ved\tved\t3\tpræp.\t3', 'ved\tvide\t\tvb.\t4', 'vidste\tvide\t\tvb.\t4', 'NATO\tNATO\t\tfork.\t5'].join('\n')

test('forms are grouped by lemma and word class, so a homograph keeps its own paradigm', () => {
  const index = parseFullForms(sample)
  assert.deepEqual(formsOf(index, 'gulv', 'noun'), ['gulv', 'gulvet'])
  assert.deepEqual(formsOf(index, 'ved', 'preposition'), ['ved'])
  assert.deepEqual(formsOf(index, 'ved', 'noun'), ['ved', 'veddet'])
  assert.deepEqual(formsOf(index, 'vide', 'verb'), ['ved', 'vide', 'vidste'])
})

test('an unmapped word class is known for spelling but never a verified form', () => {
  const index = parseFullForms(sample)
  assert.ok(index.known.has('nato'))
  assert.deepEqual(formsOf(index, 'NATO', 'noun'), ['nato'])
})
