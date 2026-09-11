import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMemoryPack } from './practice-pack.ts'

test('AI examples must contain the whole target and fit the short practice format', () => {
  const pack = { example: 'Det er svært.', translation: 'Это трудно.', hint: 'Picture a difficult task.' }
  assert.equal(parseMemoryPack(pack, 'svært').example, pack.example)
  assert.equal(parseMemoryPack({ ...pack, example: 'Jeg arbejder her.' }, 'er'), null)
  assert.equal(parseMemoryPack({ ...pack, example: 'Jeg er sikker.' }, 'helt sikker'), null)
  assert.equal(parseMemoryPack({ ...pack, example: 'svært '.repeat(17) }, 'svært'), null)
  assert.equal(parseMemoryPack({ ...pack, hint: null }, 'svært'), null)
})
