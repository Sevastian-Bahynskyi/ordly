import assert from 'node:assert/strict'
import test from 'node:test'
import { createSense } from './senses.ts'
import {
  canonicalLinkPair,
  discoverySenses,
  linkedSensesFor,
  rankSynonymCandidates,
  SYNONYM_CANDIDATE_LIMIT,
  synonymNeighbourIds,
  synonymSearchFilter,
  synonymSearchTerms,
} from './synonyms.ts'

const entry = (id, danish, senses, extra = {}) => ({ id, danish, senses, entry_kind: 'word', ...extra })

test('user-authored senses are never evidence, so the graph cannot learn from itself', () => {
  const source = entry('a', 'svært', [createSense('трудно', { source: 'split', pos: 'adverb' })])
  const fromUser = entry('b', 'noget', [createSense('трудно', { source: 'user', pos: 'adverb' })])
  const fromAi = entry('c', 'besværligt', [createSense('трудно', { source: 'ai', pos: 'adverb' })])

  assert.deepEqual(discoverySenses(fromUser), [], 'a My-answer-was-right sense is not discovery evidence')
  assert.deepEqual(rankSynonymCandidates(source, [fromUser]), [], 'and it cannot produce a candidate on its own')
  assert.equal(rankSynonymCandidates(source, [fromAi]).length, 1)

  // The same exclusion applies to the source entry: an entry whose only meanings are the
  // learner's own accepted answers has nothing to search for.
  const userOnly = entry('d', 'ligegyldigt', [createSense('всё равно', { source: 'user' })])
  assert.deepEqual(synonymSearchTerms(userOnly), [])
  assert.deepEqual(rankSynonymCandidates(userOnly, [fromAi]), [])
})

test('candidates need a shared meaning, and a shared part of speech breaks the tie', () => {
  const source = entry('a', 'svært', [createSense('трудно, тяжело', { source: 'split', pos: 'adverb' })])
  const sameMeaningSamePos = entry('b', 'besværligt', [createSense('трудно', { source: 'ai', pos: 'adverb' })])
  const sameMeaningOtherPos = entry('c', 'vanskelighed', [createSense('трудно', { source: 'ai', pos: 'noun' })])
  const unrelated = entry('d', 'hus', [createSense('дом', { source: 'ai', pos: 'noun' })])

  const ranked = rankSynonymCandidates(source, [unrelated, sameMeaningOtherPos, sameMeaningSamePos])
  assert.deepEqual(ranked.map((candidate) => candidate.id), ['b', 'c'], 'no shared meaning, no candidate')
  assert.ok(ranked[0].score > ranked[1].score, 'a shared part of speech outranks a mismatched one')
  assert.deepEqual(ranked[0].pos, ['adverb'])
  assert.ok(ranked[0].shared.includes('трудно'))
})

test('the entry itself, duplicates and sentence entries never become candidates', () => {
  const source = entry('a', 'svært', [createSense('трудно', { source: 'split' })])
  const self = entry('a', 'svært', [createSense('трудно', { source: 'split' })])
  const duplicate = entry('b', 'Svært ', [createSense('трудно', { source: 'ai' })])
  const sentence = entry('c', 'Det er trudno.', [createSense('трудно', { source: 'ai' })], { entry_kind: 'sentence' })
  const untranslated = entry('d', 'stadig', [])

  assert.deepEqual(rankSynonymCandidates(source, [self, duplicate, sentence, untranslated]), [])
})

test('an already-ruled-on entry stays excluded and the AI shortlist is capped', () => {
  const source = entry('a', 'svært', [createSense('трудно', { source: 'split' })])
  const pool = Array.from({ length: 30 }, (_, index) =>
    entry(`p${String(index).padStart(2, '0')}`, `ord${index}`, [createSense('трудно', { source: 'ai' })]))

  const all = rankSynonymCandidates(source, pool)
  assert.equal(all.length, SYNONYM_CANDIDATE_LIMIT, 'cost per discovery call does not grow with the vocabulary')

  const excluded = rankSynonymCandidates(source, pool, { excludeIds: [all[0].id, all[1].id] })
  assert.ok(!excluded.some((candidate) => candidate.id === all[0].id || candidate.id === all[1].id))

  // Deterministic: same inputs, same order.
  assert.deepEqual(rankSynonymCandidates(source, pool).map((c) => c.id), all.map((c) => c.id))
})

test('search terms are capped, selective first, and safe inside a PostgREST filter', () => {
  const source = entry('a', 'svært', [
    createSense('очень трудно, (сложно)', { source: 'split' }),
    createSense('дом', { source: 'ai' }),
  ])

  const terms = synonymSearchTerms(source, 4)
  assert.equal(terms.length, 4)
  assert.ok(terms.every((term) => !/[%_*\\,().:"']/.test(term)), 'no wildcard or delimiter characters survive')
  assert.ok(terms[0].length >= terms[terms.length - 1].length, 'longest (most selective) term first')
  assert.ok(terms.includes('трудно'))
  assert.ok(!terms.includes('что'), 'stop words are dropped')
  assert.equal(synonymSearchFilter(['трудно', 'дом']), 'translation.ilike.*трудно*,translation.ilike.*дом*')
})

test('a symmetric edge is built in the canonical order the entry_links check demands', () => {
  const low = '11111111-1111-1111-1111-111111111111'
  const high = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

  assert.deepEqual(canonicalLinkPair(high, low), { a_id: low, b_id: high })
  assert.deepEqual(canonicalLinkPair(low, high), { a_id: low, b_id: high })
  assert.deepEqual(canonicalLinkPair(high.toUpperCase(), low), { a_id: low, b_id: high })
})

test('neighbours are read in both directions, and confirmed-only is available for teaching paths', () => {
  const links = [
    { a_id: 'a', b_id: 'b', kind: 'synonym', confirmed: true },
    { a_id: 'c', b_id: 'a', kind: 'synonym', confirmed: false },
    { a_id: 'a', b_id: 'd', kind: 'related', confirmed: true },
    { a_id: 'e', b_id: 'f', kind: 'synonym', confirmed: true },
  ]

  assert.deepEqual(synonymNeighbourIds('a', links).sort(), ['b', 'c'], 'direction does not matter')
  assert.deepEqual(synonymNeighbourIds('a', links, { confirmedOnly: true }), ['b'],
    'an unconfirmed edge must not reach distractor generation')
  assert.deepEqual(synonymNeighbourIds('x', links), [])
})

test('linked senses collect every non-removed meaning of the synonym neighbours', () => {
  const links = [
    { a_id: 'a', b_id: 'b', kind: 'synonym', confirmed: true },
    { a_id: 'a', b_id: 'c', kind: 'synonym', confirmed: false },
  ]
  const entries = [
    entry('b', 'besværligt', [
      createSense('тяжело', { source: 'ai' }),
      createSense('нудно', { source: 'ai', removed_at: '2026-09-16T10:00:00Z' }),
    ]),
    entry('c', 'hårdt', [createSense('жёстко', { source: 'user' })]),
    entry('z', 'hus', [createSense('дом', { source: 'ai' })]),
  ]

  assert.deepEqual(linkedSensesFor('a', links, entries).map((sense) => sense.text), ['тяжело', 'жёстко'])
  assert.deepEqual(linkedSensesFor('a', links, entries, { confirmedOnly: true }).map((sense) => sense.text), ['тяжело'])
  assert.deepEqual(linkedSensesFor('a', [], entries), [])
})

test('a dismissed suggestion is a tombstone: never a neighbour for grading or teaching', () => {
  const links = [
    { a_id: 'a', b_id: 'b', kind: 'synonym', confirmed: false, dismissed_at: '2026-09-16T10:00:00Z' },
    { a_id: 'a', b_id: 'c', kind: 'synonym', confirmed: false, dismissed_at: null },
  ]
  assert.deepEqual(synonymNeighbourIds('a', links), ['c'])
})
