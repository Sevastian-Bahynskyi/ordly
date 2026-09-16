import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeSenses } from './sense-merge.ts'
import { createSense } from './senses.ts'

const NOW = '2026-09-16T12:00:00.000Z'

/** A sense that already carries scheduling history, i.e. one that must survive a regenerate. */
function storedSense(id, text, patch = {}) {
  return {
    id,
    text,
    pos: null,
    gender: null,
    note: null,
    example: null,
    example_translation: null,
    source: 'split',
    coverage: { recognized: 4, produced: 2, last_seen: '2026-09-10T08:00:00.000Z' },
    created_at: '2026-09-01T08:00:00.000Z',
    removed_at: null,
    ...patch,
  }
}

/** What the model hands back: fresh ids, no coverage, no history. */
function generatedSense(text, patch = {}) {
  return createSense(text, { source: 'ai', ...patch })
}

test('a returned sense keeps the existing id, coverage and created_at', () => {
  const existing = [storedSense('sense-a', 'трудно'), storedSense('sense-b', 'сложно')]
  const merged = mergeSenses(existing, [generatedSense('трудно'), generatedSense('сложно')], { now: NOW })

  assert.deepEqual(merged.map((sense) => sense.id), ['sense-a', 'sense-b'])
  assert.deepEqual(merged.map((sense) => sense.coverage.recognized), [4, 4])
  assert.deepEqual(merged.map((sense) => sense.created_at), ['2026-09-01T08:00:00.000Z', '2026-09-01T08:00:00.000Z'])
  assert.deepEqual(merged.map((sense) => sense.removed_at), [null, null])
  // Provenance belongs to the sense, not to the regenerate that restated it.
  assert.deepEqual(merged.map((sense) => sense.source), ['split', 'split'])
})

test('matching is normalized, so case, punctuation and spacing are the same meaning', () => {
  const existing = [storedSense('sense-a', 'дом'), storedSense('sense-b', 'здание')]
  const merged = mergeSenses(existing, [
    generatedSense('Дом'),
    generatedSense('  здание,  '),
  ], { now: NOW })

  assert.deepEqual(merged.map((sense) => sense.id), ['sense-a', 'sense-b'])
  // The freshest spelling wins; only identity is inherited.
  assert.deepEqual(merged.map((sense) => sense.text), ['Дом', 'здание,'])
  assert.equal(merged.filter((sense) => sense.removed_at).length, 0)
})

test('grammar from the regenerate is applied while identity is preserved', () => {
  const existing = [storedSense('sense-a', 'дом')]
  const merged = mergeSenses(existing, [generatedSense('дом', { pos: 'noun', gender: 'et' })], { now: NOW })

  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'sense-a')
  assert.equal(merged[0].pos, 'noun')
  assert.equal(merged[0].gender, 'et')
})

test('a genuinely new meaning gets a new id and never steals an existing one', () => {
  const existing = [storedSense('sense-a', 'трудно')]
  const merged = mergeSenses(existing, [generatedSense('трудно'), generatedSense('тяжело')], { now: NOW })

  assert.equal(merged.length, 2)
  assert.equal(merged[0].id, 'sense-a')
  assert.notEqual(merged[1].id, 'sense-a')
  assert.equal(merged[1].text, 'тяжело')
  assert.equal(merged[1].source, 'ai')
  assert.deepEqual(merged[1].coverage, { recognized: 0, produced: 0, last_seen: null })
})

test('a vanished sense is soft-deleted, never dropped', () => {
  const existing = [storedSense('sense-a', 'трудно'), storedSense('sense-b', 'сложно')]
  const merged = mergeSenses(existing, [generatedSense('трудно')], { now: NOW })

  assert.equal(merged.length, 2)
  const gone = merged.find((sense) => sense.id === 'sense-b')
  assert.ok(gone, 'the id must still be present so its FSRS objective is not orphaned')
  assert.equal(gone.removed_at, NOW)
  assert.equal(gone.coverage.recognized, 4)
  // Removed senses sort last, so the primary sense is still the first element.
  assert.equal(merged[0].id, 'sense-a')
  assert.equal(merged[0].removed_at, null)
})

test('an already removed sense keeps its original removal timestamp', () => {
  const existing = [
    storedSense('sense-a', 'трудно'),
    storedSense('sense-b', 'сложно', { removed_at: '2026-09-05T08:00:00.000Z' }),
  ]
  const merged = mergeSenses(existing, [generatedSense('трудно')], { now: NOW })

  assert.equal(merged.find((sense) => sense.id === 'sense-b').removed_at, '2026-09-05T08:00:00.000Z')
})

test('a removed sense that comes back is resurrected under its original id', () => {
  const existing = [
    storedSense('sense-a', 'трудно'),
    storedSense('sense-b', 'сложно', { removed_at: '2026-09-05T08:00:00.000Z' }),
  ]
  const merged = mergeSenses(existing, [generatedSense('трудно'), generatedSense('сложно')], { now: NOW })

  assert.equal(merged.length, 2)
  const back = merged.find((sense) => sense.text === 'сложно')
  assert.equal(back.id, 'sense-b')
  assert.equal(back.removed_at, null)
  assert.equal(back.coverage.produced, 2, 'resurrecting must bring the history back with the id')
})

test('a live sense is matched before a removed one with the same text', () => {
  const existing = [
    storedSense('sense-old', 'дом', { removed_at: '2026-09-05T08:00:00.000Z' }),
    storedSense('sense-live', 'дом'),
  ]
  const merged = mergeSenses(existing, [generatedSense('дом')], { now: NOW })

  assert.equal(merged[0].id, 'sense-live')
  assert.equal(merged[0].removed_at, null)
  assert.equal(merged[1].id, 'sense-old')
})

test('two returned senses that normalize to one meaning collapse instead of duplicating an id', () => {
  const existing = [storedSense('sense-a', 'дом')]
  const merged = mergeSenses(existing, [generatedSense('дом'), generatedSense('Дом.')], { now: NOW })

  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'sense-a')
  assert.equal(new Set(merged.map((sense) => sense.id)).size, merged.length)
})

test('examples already generated for a sense survive a meanings regenerate', () => {
  const existing = [
    storedSense('sense-a', 'трудно'),
    storedSense('sense-b', 'тяжело', {
      example: 'Det er tungt at bære.',
      example_translation: 'Это тяжело нести.',
    }),
  ]
  // The translation call returns senses with no example fields at all (D10 keeps them lazy).
  const merged = mergeSenses(existing, [generatedSense('трудно'), generatedSense('тяжело')], { now: NOW })

  assert.equal(merged[1].example, 'Det er tungt at bære.')
  assert.equal(merged[1].example_translation, 'Это тяжело нести.')
})

test('an empty result leaves the entry untouched rather than emptying it', () => {
  const existing = [storedSense('sense-a', 'трудно')]
  assert.deepEqual(mergeSenses(existing, [], { now: NOW }), existing)
  assert.deepEqual(mergeSenses(existing, null, { now: NOW }), existing)
  assert.deepEqual(mergeSenses(existing, [generatedSense('   ')], { now: NOW }), existing)
})

test('ordering follows the regenerate, so the primary sense can be re-chosen by the model', () => {
  const existing = [storedSense('sense-a', 'трудно'), storedSense('sense-b', 'сложно')]
  const merged = mergeSenses(existing, [generatedSense('сложно'), generatedSense('трудно')], { now: NOW })

  assert.deepEqual(merged.map((sense) => sense.id), ['sense-b', 'sense-a'])
})

test('the editor round trip loses no id and duplicates none', () => {
  // Mirrors EntryEditor: the merge result is split into the rows the user edits and the
  // tombstones held aside, and save writes `[...live, ...archived]` back as one array.
  const existing = [
    storedSense('sense-a', 'трудно'),
    storedSense('sense-b', 'сложно'),
    storedSense('sense-c', 'тяжело', { removed_at: '2026-09-05T08:00:00.000Z' }),
  ]
  const regenerated = [generatedSense('Сложно'), generatedSense('нелегко')]

  const merged = mergeSenses(existing, regenerated, { now: NOW })
  const live = merged.filter((sense) => !sense.removed_at)
  const archived = merged.filter((sense) => sense.removed_at)
  const saved = [...live, ...archived]

  assert.deepEqual(live.map((sense) => sense.id), ['sense-b', saved[1].id])
  assert.equal(live[0].coverage.recognized, 4)
  // Every id the entry ever had is still resolvable in the saved array.
  for (const sense of existing) {
    assert.ok(saved.some((item) => item.id === sense.id), `${sense.id} was dropped`)
  }
  assert.equal(new Set(saved.map((sense) => sense.id)).size, saved.length)
  // 'трудно' vanished from the regenerate and 'тяжело' was already gone.
  assert.deepEqual(archived.map((sense) => sense.id).sort(), ['sense-a', 'sense-c'])

  // And the merge is idempotent: regenerating the same meanings again changes no id.
  const again = mergeSenses(saved, regenerated, { now: '2026-09-17T12:00:00.000Z' })
  assert.deepEqual(
    again.map((sense) => sense.id).sort(),
    saved.map((sense) => sense.id).sort(),
  )
  assert.equal(again.find((sense) => sense.id === 'sense-a').removed_at, NOW, 'a tombstone must not be re-stamped')
})

test('an entry with no senses yet simply takes the generated ones', () => {
  const merged = mergeSenses([], [generatedSense('дом', { pos: 'noun', gender: 'et' })], { now: NOW })
  assert.equal(merged.length, 1)
  assert.equal(merged[0].source, 'ai')
  assert.equal(merged[0].removed_at, null)
})
