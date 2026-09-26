import assert from 'node:assert/strict'
import test from 'node:test'
import { englishPlural, slavicPlural } from './plural.ts'

test('Slavic plurals follow the last digits, not the size', () => {
  const word = (n) => slavicPlural(n, 'слово', 'слова', 'слів')
  assert.deepEqual([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(word),
    ['слів', 'слово', 'слова', 'слова', 'слів', 'слів', 'слів', 'слів', 'слово', 'слова', 'слів', 'слово', 'слів'])
  assert.equal(englishPlural(1, 'word', 'words'), 'word')
  assert.equal(englishPlural(0, 'word', 'words'), 'words')
})
