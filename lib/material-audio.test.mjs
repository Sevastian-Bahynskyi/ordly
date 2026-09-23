import assert from 'node:assert/strict'
import test from 'node:test'
import { hasWordRecording } from './material-audio.ts'

test('a saved recording or catalog recording keeps a word out of Missing audio', () => {
  assert.equal(hasWordRecording({ audio_path: 'words/god.mp3', catalog_lemma: null }, {}), true)
  assert.equal(hasWordRecording({ audio_path: null, catalog_lemma: 'god' }, { 'god:word': 'words/god.mp3' }), true)
  assert.equal(hasWordRecording({ audio_path: null, catalog_lemma: 'god' }, { 'god:phrase': 'words/god.mp3' }), false)
  assert.equal(hasWordRecording({ audio_path: ' ', catalog_lemma: 'god' }, { 'god:word': null }), false)
  assert.equal(hasWordRecording({ audio_path: null, catalog_lemma: null }, {}), false)
})
