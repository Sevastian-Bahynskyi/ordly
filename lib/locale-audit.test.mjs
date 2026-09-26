import assert from 'node:assert/strict'
import test from 'node:test'
import { drawLocaleAudit, localeAuditBlocks, tallyLocaleAudit, unreadLocaleItems } from './locale-audit.ts'

const senses = Array.from({ length: 300 }, (_, i) => ({
  lemma: `ord${i}`, kind: i % 10 === 0 ? 'phrase' : 'word', sense_id: `s${i}`, ordinal: 1, pos: i % 3 === 0 ? 'verb' : 'noun',
  text: `слово ${i}`, example: i % 2 ? `Eksempel ${i}.` : null, example_translation: i % 2 ? `Приклад ${i}.` : null,
  source: { ru: `слово ${i}`, en: `word ${i}` },
}))
const variants = Array.from({ length: 120 }, (_, i) => ({ id: `v${i}`, level: ['A1', 'A2', 'B1', 'B2'][i % 4], danish: `Sætning ${i}.`, en: `Sentence ${i}.`, ru: `Предложение ${i}.`, uk: `Речення ${i}.`, lemma: `ord${i}` }))

test('the sample is reproducible from its seed and covers every stratum', () => {
  const one = drawLocaleAudit(senses, variants, { seed: 7, size: 120 })
  assert.deepEqual(one, drawLocaleAudit(senses, variants, { seed: 7, size: 120 }))
  assert.notDeepEqual(one.map((item) => item.id), drawLocaleAudit(senses, variants, { seed: 8, size: 120 }).map((item) => item.id))
  const strata = new Set(one.flatMap((item) => item.strata))
  for (const stratum of ['type: wording', 'type: example', 'type: family', 'kind: phrase', 'kind: word', 'pos: verb', 'level: A1', 'level: B2']) assert.ok(strata.has(stratum), stratum)
  assert.equal(new Set(one.map((item) => item.id)).size, one.length, 'no item twice')
})

test('the tally reports clean rates with a margin, and a severe finding blocks publication', () => {
  const items = drawLocaleAudit(senses, variants, { seed: 1, size: 60 })
  const clean = items.map((item) => ({ id: item.id, failures: [] }))
  const rows = tallyLocaleAudit(items, clean)
  assert.equal(rows[0].stratum, 'overall')
  assert.equal(rows[0].rate, 1)
  assert.deepEqual(localeAuditBlocks(rows), [])
  const severe = clean.map((verdict, index) => index === 0 ? { ...verdict, failures: ['russian'] } : verdict)
  const blocked = tallyLocaleAudit(items, severe)
  assert.equal(blocked[0].severe, 1)
  assert.ok(localeAuditBlocks(blocked).some((row) => row.stratum === 'overall'))
  const repaired = severe.map((verdict, index) => index === 0 ? { ...verdict, repaired: true } : verdict)
  assert.deepEqual(localeAuditBlocks(tallyLocaleAudit(items, repaired)), [], 'a repaired severe finding no longer blocks')
  const unnatural = clean.map((verdict, index) => index < 6 ? { ...verdict, failures: ['unnatural'] } : verdict)
  assert.ok(localeAuditBlocks(tallyLocaleAudit(items, unnatural)).some((row) => row.stratum === 'overall'), '90% is below 95%')
})

test('an item nobody has read is not clean', () => {
  const items = drawLocaleAudit(senses, variants, { seed: 3, size: 30 })
  const unread = items.map((item) => ({ id: item.id, failures: null }))
  assert.equal(unreadLocaleItems(items, unread).length, items.length)
  assert.equal(tallyLocaleAudit(items, unread)[0].reviewed, 0)
})
