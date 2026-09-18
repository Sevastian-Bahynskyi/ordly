import assert from 'node:assert/strict'
import test from 'node:test'
import { isReadableCyrillic, normalizePronunciationText } from './pronunciation.ts'

/** Issue #5 §2: nothing that mixes scripts may be written or served as a reading hint. */

test('a value with a Latin homoglyph hiding in it is not readable Cyrillic', () => {
  // Every one of these was actually in `pronunciation_cache`. They look like words on screen.
  assert.equal(isReadableCyrillic('фоклaa'), false, 'Latin a, U+0061')
  assert.equal(isReadableCyrillic('гaнг'), false)
  assert.equal(isReadableCyrillic('хoнклэл'), false, 'Latin o, U+006F')
  assert.equal(isReadableCyrillic('дэ́aфо'), false)
  assert.equal(isReadableCyrillic('áф-'), false, 'Latin a with acute, U+00E1 — no plain A-Z in sight')
  assert.equal(isReadableCyrillic('yнлингс'), false, 'Latin y, U+0079')
})

test('ordinary reading hints pass, including stress marks, hyphens and several words', () => {
  assert.equal(isReadableCyrillic('сдэ́эди'), true)
  assert.equal(isReadableCyrillic('но́эн-синнэ'), true)
  assert.equal(isReadableCyrillic('во́дан го де'), true)
  assert.equal(isReadableCyrillic('гэн-тэ\''), true)
})

test('empty and script-less values are not hints either', () => {
  assert.equal(isReadableCyrillic(''), false)
  assert.equal(isReadableCyrillic('   '), false)
  assert.equal(isReadableCyrillic('-'), false)
  assert.equal(isReadableCyrillic('stadig'), false, 'Danish spelling is never the answer (AGENTS.md §8)')
})

test('the cache key folds case and whitespace, and nothing else', () => {
  assert.equal(normalizePronunciationText('  Håndklæde '), 'håndklæde')
  assert.equal(normalizePronunciationText('tage  på\tstranden'), 'tage på stranden')
})
