import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogCleanupSql } from './catalog-import.ts'

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
