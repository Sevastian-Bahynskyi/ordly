import assert from 'node:assert/strict'
import test from 'node:test'
import { inferDanishInputKind } from './entry-kind.ts'

test('a split phrase is a phrase, even when its finite verb could open a sentence', () => {
  assert.equal(inferDanishInputKind('står … op'), 'phrase')
  assert.equal(inferDanishInputKind('går ... ud fra'), 'phrase')
  assert.equal(inferDanishInputKind('går ud fra det'), 'sentence', 'without the gap, the old rule holds')
  assert.equal(inferDanishInputKind('Jeg ved det ikke…'), 'sentence')
  assert.equal(inferDanishInputKind('stå op'), 'phrase')
  assert.equal(inferDanishInputKind('gulv'), 'word')
})
