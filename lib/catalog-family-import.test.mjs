import assert from 'node:assert/strict'
import test from 'node:test'
import { familyChunkSql, familyCleanupSql, snapshotId } from './catalog-family-import.ts'

const family = { id: '11111111-1111-5111-8111-111111111111', lemma: 'gulv', kind: 'word', sense_id: '93c644ae-08f2-5a1c-ac53-75bf47a66274', level: 'A2', situation: 'home', grammar: 'noun-definite', frame: '{target} er koldt.', slots: {}, variants: [{ id: '22222222-2222-5222-8222-222222222222', version: 'abc', danish: 'Gulvet er koldt.', target: 'gulvet', en: 'The floor is cold.', ru: 'Пол холодный.', orders: [] }] }

test('a chunk writes only families whose sense exists, and replaces their variants', () => {
  const sql = familyChunkSql([family], { snapshot: 'aaaaaaaaaaaaaaaa', generator: 'test', gate: 'g' })
  assert.match(sql, /exists \(select 1 from public\.word_catalog_sense s/)
  assert.match(sql, /delete from public\.catalog_sentence_variant v using known/)
  assert.match(sql, /"translations":\{"en":"The floor is cold\.","ru":"Пол холодный\."\}/)
  assert.throws(() => familyChunkSql([], { snapshot: 'a', generator: 't', gate: 'g' }))
})

test('a payload containing the quote tag still round-trips', () => {
  const sql = familyChunkSql([{ ...family, frame: '$f0$ {target}.' }], { snapshot: 'aaaaaaaaaaaaaaaa', generator: 'test', gate: 'g' })
  assert.match(sql, /\$f1\$\[/)
})

test('cleanup refuses unless the whole snapshot is loaded, and the snapshot id is content-derived', () => {
  assert.match(familyCleanupSql('0123456789abcdef', 12), /\(select n from loaded\) = 12/)
  assert.throws(() => familyCleanupSql("x' or true --", 12))
  assert.throws(() => familyCleanupSql('0123456789abcdef', 0))
  assert.equal(snapshotId(['a', 'b']), snapshotId(['a', 'b']))
  assert.notEqual(snapshotId(['a', 'b']), snapshotId(['b', 'a']))
})

test('a Ukrainian overlay adds its translation only while the variant says the same Danish', () => {
  const meta = { snapshot: 'aaaaaaaaaaaaaaaa', generator: 'test', gate: 'g' }
  const id = family.variants[0].id
  const current = familyChunkSql([family], { ...meta, extra: { uk: { [id]: { danish: 'Gulvet er koldt.', uk: 'Підлога холодна.' } } } })
  assert.match(current, /"translations":\{"en":"The floor is cold\.","ru":"Пол холодный\.","uk":"Підлога холодна\."\}/)
  const stale = familyChunkSql([family], { ...meta, extra: { uk: { [id]: { danish: 'Gulvet er varmt.', uk: 'Підлога тепла.' } } } })
  assert.doesNotMatch(stale, /"uk"/, 'an edited sentence never shows a translation of its old text')
})
