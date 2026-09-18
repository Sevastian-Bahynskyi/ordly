import assert from 'node:assert/strict'
import { test } from 'node:test'
import { audioBatches, audioSummary, audioTermLine, parseAudioReport, wordsFileContents } from './catalog-audio.ts'

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
      { word: 'Gulv', ok: true, status: 'saved', path: '/audio/gulv.mp3' },
      { word: 'hus', ok: true, status: 'skipped', path: '/audio/hus.mp3' },
      { word: 'tinker', ok: false, status: 'failed', error: 'no article' },
    ],
  })
  assert.deepEqual(results, [
    { lemma: 'gulv', outcome: 'saved', path: '/audio/gulv.mp3' },
    { lemma: 'hus', outcome: 'skipped', path: '/audio/hus.mp3' },
    { lemma: 'tinker', outcome: 'failed', path: null },
  ])
  assert.deepEqual(audioSummary(results), { saved: 1, skipped: 1, failed: 1 })
})

test('an ok item with no file is a failure, not a silent success', () => {
  assert.deepEqual(parseAudioReport({ items: [{ word: 'gulv', ok: true, status: 'dry_run' }] }), [
    { lemma: 'gulv', outcome: 'failed', path: null },
  ])
})

test('a report that is not a report yields nothing rather than throwing', () => {
  assert.deepEqual(parseAudioReport(null), [])
  assert.deepEqual(parseAudioReport({ items: 'none' }), [])
})
