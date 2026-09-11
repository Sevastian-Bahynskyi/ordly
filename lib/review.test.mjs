import assert from 'node:assert/strict'
import test from 'node:test'
import { clozeSentence } from './review.ts'

test('a cloze never reveals the target through another occurrence or a substring', () => {
  assert.equal(clozeSentence('Hun er her, og jeg er her.', 'er'), 'Hun _____ her, og jeg _____ her.')
  assert.equal(clozeSentence('Jeg arbejder her.', 'er'), '')
  assert.equal(clozeSentence('Det er godt.', 'god'), '')
})
