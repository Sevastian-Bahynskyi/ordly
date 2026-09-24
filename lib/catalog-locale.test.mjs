import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { localeUpsertSql, validateLocaleFile } from './catalog-locale.ts'

const pilot = JSON.parse(readFileSync(new URL('../catalog/locale-pilot.en.json', import.meta.url), 'utf8'))
const row = { lemma: 'gulv', kind: 'word', sense_id: '93c644ae-08f2-5a1c-ac53-75bf47a66274', ordinal: 1, pos: 'noun', gender: 'et', text: 'floor', example: null, example_translation: null }
const file = (senses, patch = {}) => ({ lang: 'en', generator: 'test', senses, ...patch })

test('the English pilot is valid, and every sense is one the Russian catalog already has', () => {
  assert.deepEqual(validateLocaleFile(pilot), [])
  assert.equal(pilot.lang, 'en')
  assert.ok(pilot.senses.length >= 50)
  assert.ok(pilot.senses.some((sense) => sense.lemma === 'gulv' && sense.text === 'floor'))
})

test('a wording in the wrong script is refused rather than shown under the wrong language', () => {
  assert.deepEqual(validateLocaleFile(file([{ ...row, text: 'пол' }])), ['sense 1: English text is not Latin script'])
  assert.deepEqual(validateLocaleFile(file([{ ...row, text: 'floor' }], { lang: 'ru' })), ['sense 1: ru text is not Cyrillic'])
  assert.deepEqual(validateLocaleFile(file([{ ...row, example: 'Bogen ligger på gulvet.', example_translation: 'Книга лежит на полу.' }])), ['sense 1: English example translation is not Latin script'])
})

test('identity, provenance and completeness are checked before loading', () => {
  assert.deepEqual(validateLocaleFile(file([row], { generator: '' })), ['missing generator (provenance)'])
  assert.deepEqual(validateLocaleFile(file([{ ...row, sense_id: 'nope' }])), ['sense 1: bad sense_id'])
  assert.deepEqual(validateLocaleFile(file([row, row])), ['sense 2: duplicate sense', 'sense 2: duplicate ordinal'])
  assert.deepEqual(validateLocaleFile(file([{ ...row, example: 'Bogen ligger på gulvet.' }])), ['sense 1: an example needs its translation'])
  assert.deepEqual(validateLocaleFile(file([])), ['no senses'])
})

test('the load only adds wordings to existing senses and is idempotent', () => {
  const statement = localeUpsertSql(file([{ ...row, text: "floor's" }]))
  assert.match(statement, /existing\.lang <> 'en'/, 'a row joins to the sense in another language, so it cannot mint a meaning')
  assert.match(statement, /on conflict \(lemma, kind, sense_id, lang\) do update/)
  assert.match(statement, /'floor''s'/, 'text is quoted')
})
