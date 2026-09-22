import assert from 'node:assert/strict'
import { test } from 'node:test'
import { audioBatches, audioObjectKey, audioSummary, audioTermLine, mergeHarvestedIpa, parseAudioReport, wordsFileContents } from './catalog-audio.ts'

test('a known part of speech becomes a disambiguating hint', () => {
  assert.equal(audioTermLine({ lemma: 'ved', pos: 'noun' }), 'ved|noun')
  assert.equal(audioTermLine({ lemma: 'ved', pos: null }), 'ved')
  assert.equal(audioTermLine({ lemma: 'godt', pos: 'phrase' }), 'godt')
})

test('batches keep frequency order and never exceed the size', () => {
  const terms = Array.from({ length: 5 }, (_, index) => ({ lemma: `ord${index}`, pos: null }))
  const batches = audioBatches(terms, 2)
  assert.deepEqual(batches.map((batch) => batch.length), [2, 2, 1])
  assert.equal(batches[0][0].lemma, 'ord0')
})

test('phrases never enter an audio batch', () => {
  const batches = audioBatches([{ lemma: 'godt lide', pos: 'phrase' }, { lemma: 'gulv', pos: 'noun' }], 10)
  assert.deepEqual(batches, [[{ lemma: 'gulv', pos: 'noun' }]])
})

test('an invalid batch size is refused rather than silently corrected', () => {
  assert.throws(() => audioBatches([], 0), /positive integer/u)
})

test('the words file is one term per line and ends with a newline', () => {
  assert.equal(wordsFileContents([{ lemma: 'gulv', pos: 'noun' }, { lemma: 'hus', pos: null }]), 'gulv|noun\nhus\n')
  assert.equal(wordsFileContents([]), '')
})

test('the report is read into one outcome per lemma', () => {
  const results = parseAudioReport({
    items: [
      { word: 'Gulv', ok: true, status: 'saved', path: '/audio/gulv.mp3', ipa: '[ˈgɔlˀ]' },
      { word: 'hus', ok: true, status: 'skipped', path: '/audio/hus.mp3' },
      { word: 'tinker', ok: false, status: 'failed', error: 'no article' },
    ],
  })
  assert.deepEqual(results, [
    { lemma: 'gulv', outcome: 'saved', path: '/audio/gulv.mp3', ipa: '[ˈgɔlˀ]' },
    { lemma: 'hus', outcome: 'skipped', path: '/audio/hus.mp3', ipa: null },
    { lemma: 'tinker', outcome: 'failed', path: null, ipa: null },
  ])
  assert.deepEqual(audioSummary(results), { saved: 1, skipped: 1, failed: 1 })
})

test('an ok item with no file is a failure, not a silent success', () => {
  assert.deepEqual(parseAudioReport({ items: [{ word: 'gulv', ok: true, status: 'dry_run' }] }), [
    { lemma: 'gulv', outcome: 'failed', path: null, ipa: null },
  ])
})

test('a report that is not a report yields nothing rather than throwing', () => {
  assert.deepEqual(parseAudioReport(null), [])
  assert.deepEqual(parseAudioReport({ items: 'none' }), [])
})

test('a word with a transcription but no recording still yields its IPA', () => {
  const results = parseAudioReport({ items: [{ word: 'hilse', ok: false, status: 'failed', ipa: '[ˈhilsə]' }] })
  assert.deepEqual(results, [{ lemma: 'hilse', outcome: 'failed', path: null, ipa: '[ˈhilsə]' }])
})

test('component transcriptions are discarded from harvested IPA', () => {
  const results = parseAudioReport({
    items: [
      { word: 'påtage', ok: true, status: 'saved', path: '/audio/paatage.mp3', ipa: '[-ˌtæˀ]' },
      { word: 'semifinale', ok: true, status: 'saved', path: '/audio/semifinale.mp3', ipa: '[ˈsemi-]' },
    ],
  })
  assert.deepEqual(results, [
    { lemma: 'påtage', outcome: 'saved', path: '/audio/paatage.mp3', ipa: null },
    { lemma: 'semifinale', outcome: 'saved', path: '/audio/semifinale.mp3', ipa: null },
  ])
})

test('harvested transcriptions merge across runs rather than replacing', () => {
  const first = mergeHarvestedIpa({}, [{ lemma: 'gulv', outcome: 'saved', path: 'a.mp3', ipa: '[ˈgɔlˀ]' }])
  // A second run with --skip-existing fetches no page, so it reports no IPA for the same word.
  const second = mergeHarvestedIpa(first, [{ lemma: 'gulv', outcome: 'skipped', path: 'a.mp3', ipa: null }])
  assert.deepEqual(second, { gulv: '[ˈgɔlˀ]' })
})

test('merging also removes component transcriptions left by older harvests', () => {
  assert.deepEqual(mergeHarvestedIpa({ påtage: '[-ˌtæˀ]', gulv: '[ˈgɔlˀ]' }, []), { gulv: '[ˈgɔlˀ]' })
})

test('an object key is ASCII, readable, and cannot collide', () => {
  assert.equal(audioObjectKey('adfærd', 'abcdef1234'), 'words/adfaerd-abcdef12.mp3')
  assert.equal(audioObjectKey('gå', '99887766'), 'words/gaa-99887766.mp3')
  // `få` transliterates to the same slug as `faa`; the digest is what keeps them apart, so one
  // word can never play another word's recording.
  assert.notEqual(audioObjectKey('få', 'aaaaaaaa'), audioObjectKey('faa', 'bbbbbbbb'))
  assert.match(audioObjectKey('på', '1234abcd'), /^words\/[a-z0-9-]+\.mp3$/u)
})
