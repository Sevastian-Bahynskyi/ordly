import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  activeSenses,
  createSense,
  entrySenses,
  normalizeSenseText,
  parseSenses,
  primarySense,
  splitTranslationIntoSenses,
  translationFromSenses,
} from './senses.ts'

const migration = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20260916094500_entry_senses.sql', import.meta.url)),
  'utf8',
)

test('phase-1 backfill splits a word translation and never splits a sentence translation', () => {
  const word = splitTranslationIntoSenses('трудно, сложно', 'word')
  assert.equal(word.length, 2)
  assert.deepEqual(word.map((sense) => sense.text), ['трудно', 'сложно'])
  assert.deepEqual(word.map((sense) => sense.source), ['split', 'split'])
  assert.deepEqual(word.map((sense) => sense.pos), [null, null])
  assert.equal(translationFromSenses(word), 'трудно, сложно')

  // Comma-splitting a sentence translation is destructive: the graded answer would be shredded.
  const sentence = splitTranslationIntoSenses('Я думаю, что это трудно, но хорошо.', 'sentence')
  assert.equal(sentence.length, 1)
  assert.equal(sentence[0].text, 'Я думаю, что это трудно, но хорошо.')
  assert.equal(translationFromSenses(sentence), 'Я думаю, что это трудно, но хорошо.')

  assert.deepEqual(splitTranslationIntoSenses('весь; целый / полный', 'word').map((s) => s.text), ['весь', 'целый', 'полный'])
  assert.deepEqual(splitTranslationIntoSenses('  ,  , ', 'word'), [])
  assert.deepEqual(splitTranslationIntoSenses(null, 'word'), [])
})

test('the SQL helper keeps the same entry_kind guard as the TypeScript mirror', () => {
  // The backfill and the trigger both go through private.senses_from_translation, so the
  // sentence guard has to live inside that function, not at its call sites.
  assert.match(migration, /create or replace function private\.senses_from_translation/)
  assert.match(migration, /if entry_kind = 'word' then\s+parts := regexp_split_to_array\(raw, '\[;,\/\]'\);\s+else\s+parts := array\[raw\];/)
  assert.match(migration, /before insert or update on public\.vocabulary_entries/)
  // A nested UPDATE inside the sync trigger would recurse; it only ever mutates NEW.
  const trigger = migration.slice(migration.indexOf('function private.sync_entry_senses'), migration.indexOf('drop trigger if exists vocabulary_sync_senses'))
  assert.ok(!/update\s+public\.vocabulary_entries/i.test(trigger))
  // A BEFORE trigger runs ahead of the CHECK, so a non-array must pass through untouched.
  assert.match(trigger, /jsonb_typeof\(new\.senses\) <> 'array'/)
  // The backfill must leave every trigger it paused switched back on.
  assert.equal((migration.match(/disable trigger vocabulary_touch_updated_at/g) || []).length, 1)
  assert.equal((migration.match(/enable trigger vocabulary_touch_updated_at/g) || []).length, 1)
})

test('raw bulk add rows keep an empty sense list and stay out of review', () => {
  // Raw bulk add writes danish only: translation is null, so nothing can be derived.
  assert.deepEqual(splitTranslationIntoSenses(null, 'word'), [])
  assert.equal(translationFromSenses([]), '')
  assert.equal(primarySense([]), null)
  assert.deepEqual(entrySenses({ senses: [], translation: null, entry_kind: 'word' }), [])
  assert.match(migration, /and translation is not null\s+and btrim\(translation\) <> ''/)
})

test('translation is rebuilt from non-removed senses only', () => {
  const senses = [
    createSense('трудно', { source: 'split' }),
    createSense('тяжело', { source: 'ai', removed_at: '2026-09-16T10:00:00Z' }),
    createSense('сложно', { source: 'user' }),
  ]
  assert.equal(translationFromSenses(senses), 'трудно, сложно')
  assert.deepEqual(activeSenses(senses).map((sense) => sense.text), ['трудно', 'сложно'])
  assert.equal(primarySense(senses)?.text, 'трудно')

  // Soft-deleting the first sense promotes the next one to primary.
  const withoutFirst = [{ ...senses[0], removed_at: '2026-09-16T11:00:00Z' }, ...senses.slice(1)]
  assert.equal(primarySense(withoutFirst)?.text, 'сложно')
})

test('parseSenses tolerates raw jsonb and keeps ids stable for later regeneration matching', () => {
  const parsed = parseSenses([
    { id: 'keep-me', text: ' дом ', pos: 'noun', gender: 'et', source: 'ai' },
    { text: 'машина', pos: 'noun', gender: 'nonsense' },
    { text: 'быстро', pos: 'not-a-pos', gender: 'en' },
    { text: '   ' },
    null,
    'нет',
  ])

  assert.equal(parsed.length, 3)
  assert.equal(parsed[0].id, 'keep-me')
  assert.equal(parsed[0].text, 'дом')
  assert.equal(parsed[0].gender, 'et')
  assert.equal(parsed[1].gender, null, 'an invalid gender is dropped, not stored')
  assert.equal(parsed[2].pos, null, 'an invalid part of speech is dropped')
  assert.equal(parsed[2].gender, null, 'gender is only meaningful on a noun')
  assert.deepEqual(parsed[0].coverage, { recognized: 0, produced: 0, last_seen: null })
  assert.deepEqual(parseSenses(undefined), [])
  assert.deepEqual(parseSenses({ text: 'дом' }), [])

  // Sense identity survives casing/punctuation drift, which is what step 3 matches on.
  assert.equal(normalizeSenseText('  Трудно, '), normalizeSenseText('трудно'))
  assert.notEqual(normalizeSenseText('трудно'), normalizeSenseText('сложно'))
})

test('entries written before the migration fall back to the legacy translation string', () => {
  assert.deepEqual(
    entrySenses({ senses: [], translation: 'трудно, сложно', entry_kind: 'word' }).map((s) => s.text),
    ['трудно', 'сложно'],
  )
  assert.deepEqual(
    entrySenses({ senses: undefined, translation: 'Я думаю, что это хорошо.', entry_kind: 'sentence' }).map((s) => s.text),
    ['Я думаю, что это хорошо.'],
  )
  // Stored senses win over the denormalized string.
  assert.deepEqual(
    entrySenses({ senses: [{ text: 'дом', pos: 'noun', gender: 'et' }], translation: 'стале, значение' }).map((s) => s.text),
    ['дом'],
  )
})
