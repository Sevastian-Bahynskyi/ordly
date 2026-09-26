import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogCleanupSql, catalogPhraseFormsJsonSql } from './catalog-import.ts'

test('catalog cleanup removes stale meanings and entries against the exact snapshot', () => {
  const sql = catalogCleanupSql([
    { lemma: "hånd'værk", kind: 'word', senseIds: ['11111111-1111-5111-8111-111111111111'] },
    { lemma: 'godt lide', kind: 'phrase', senseIds: ['22222222-2222-5222-8222-222222222222'] },
  ])

  assert.match(sql, /delete from public\.word_catalog_sense stored/)
  assert.match(sql, /delete from public\.word_catalog stored/)
  assert.ok(sql.indexOf('word_catalog_sense') < sql.indexOf('word_catalog stored'))
  assert.match(sql, /11111111-1111-5111-8111-111111111111/)
  assert.match(sql, /22222222-2222-5222-8222-222222222222/)
  assert.match(sql, /hånd''værk/)
})

test('catalog cleanup refuses an empty snapshot', () => {
  assert.throws(() => catalogCleanupSql([]), /empty catalog/)
})

test('phrase forms load only onto phrases the catalog holds, and never duplicate', () => {
  const sql = catalogPhraseFormsJsonSql([{ lemma: 'stå op', form_key: 'present', form_text: 'står … op' }])
  assert.match(sql, /insert into public\.word_catalog_form \(lemma, kind, form_key, form_text, gender, source\)/)
  assert.match(sql, /'phrase'/)
  assert.match(sql, /join public\.word_catalog c on c\.lemma = f ->> 'lemma' and c\.kind = 'phrase'/)
  assert.match(sql, /on conflict do nothing/)
  assert.ok(sql.includes('"står … op"'))
})
