import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseIpa, kaikkiPartOfSpeech, parseKaikkiLine, selectIpaForPos } from './catalog-ipa.ts'

test('the phonetic reading wins over the phonemic one', () => {
  assert.equal(chooseIpa([{ ipa: '/ɡraːtis/' }, { ipa: '[ˈɡ̊ʁɑːd̥is]' }]), '[ˈɡ̊ʁɑːd̥is]')
})

test('a phonemic reading is used when there is no phonetic one', () => {
  assert.equal(chooseIpa([{ ipa: '/ɡraːtis/' }]), '/ɡraːtis/')
})

test('sound entries that only carry audio contribute no IPA', () => {
  assert.equal(chooseIpa([{ audio: 'da-gulv.ogg' }]), null)
  assert.equal(chooseIpa(null), null)
})

test('Wiktionary word classes map onto Ordly parts of speech, and unknown ones stay null', () => {
  assert.equal(kaikkiPartOfSpeech('adj'), 'adjective')
  assert.equal(kaikkiPartOfSpeech('prep_phrase'), 'phrase')
  assert.equal(kaikkiPartOfSpeech('suffix'), null)
  assert.equal(kaikkiPartOfSpeech(7), null)
})

test('a line is read into word, part of speech and IPA', () => {
  const line = JSON.stringify({ word: 'gulv', pos: 'noun', lang_code: 'da', sounds: [{ ipa: '[ˈɡɔlˀ]' }] })
  assert.deepEqual(parseKaikkiLine(line), { word: 'gulv', pos: 'noun', ipa: '[ˈɡɔlˀ]' })
})

test('lines without usable pronunciation, or in another language, are skipped', () => {
  assert.equal(parseKaikkiLine(''), null)
  assert.equal(parseKaikkiLine('{ not json'), null)
  assert.equal(parseKaikkiLine(JSON.stringify({ word: 'gulv', sounds: [] })), null)
  assert.equal(parseKaikkiLine(JSON.stringify({ word: 'floor', lang_code: 'en', sounds: [{ ipa: '/flɔː/' }] })), null)
})

test('the part of speech filters before an IPA is read', () => {
  const candidates = [
    { word: 'ved', pos: 'verb', ipa: '[veðˀ]' },
    { word: 'ved', pos: 'noun', ipa: '[veð]' },
  ]
  assert.equal(selectIpaForPos(candidates, 'verb'), '[veðˀ]')
  assert.equal(selectIpaForPos(candidates, 'noun'), '[veð]')
})

test('disagreeing candidates produce silence rather than a guess', () => {
  const candidates = [
    { word: 'ved', pos: 'verb', ipa: '[veðˀ]' },
    { word: 'ved', pos: 'noun', ipa: '[veð]' },
  ]
  assert.equal(selectIpaForPos(candidates, null), null)
  assert.equal(selectIpaForPos(candidates, 'adjective'), null)
})

test('an unclassified candidate is used only when nothing better matched', () => {
  const candidates = [
    { word: 'hej', pos: null, ipa: '[hɑjˀ]' },
    { word: 'hej', pos: 'interjection', ipa: '[hajˀ]' },
  ]
  assert.equal(selectIpaForPos(candidates, 'interjection'), '[hajˀ]')
  assert.equal(selectIpaForPos([candidates[0]], 'interjection'), '[hɑjˀ]')
  assert.equal(selectIpaForPos([], 'noun'), null)
})
