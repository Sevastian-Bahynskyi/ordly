import assert from 'node:assert/strict'
import test from 'node:test'
import { speechObjectKey, speechSsml, speechText, transcriptMatches } from './speech-audio.ts'

test('keys are ASCII, distinct for look-alike spellings, and never a legacy DDO key', () => {
  assert.match(speechObjectKey('adfærd'), /^words\/adfaerd-[0-9a-f]{8}-azure\.mp3$/u)
  assert.match(speechObjectKey('gå ind for'), /^words\/gaa-ind-for-[0-9a-f]{8}-azure\.mp3$/u)
  assert.notEqual(speechObjectKey('få'), speechObjectKey('faa'))
  assert.equal(speechObjectKey('Stå  op'), speechObjectKey('stå op'))
  assert.match(speechObjectKey('på'), /^words\/[a-z0-9-]+\.mp3$/u)
})

test('ssml escapes the text and refuses a malformed rate', () => {
  assert.equal(speechText('  Hyggelig  aften '), 'hyggelig aften')
  assert.ok(speechSsml('rock & roll', '-15%').includes('rock &amp; roll'))
  assert.ok(speechSsml('ja', '-15%').includes("rate='-15%'"))
  assert.ok(speechSsml('ja', "0%'/><x").includes("rate='0%'"))
})

test('a transcript matches regardless of spacing, punctuation and case', () => {
  assert.ok(transcriptMatches('rødgrød', 'Rød grød.'))
  assert.ok(transcriptMatches('stå op', 'Stå op.'))
  assert.ok(!transcriptMatches('hver', 'Vær.'))
  assert.ok(!transcriptMatches('ja', null))
})
