import assert from 'node:assert/strict'
import test from 'node:test'
import { createSense } from './senses.ts'
import {
  canonicalLinkPair,
  conceptMatchesSenseScript,
  conceptSharedBySenses,
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
  // The pair is kept apart, because it is what the model is asked to rule on.
  assert.equal(ranked[0].sourceSense, 'трудно, тяжело')
  assert.equal(ranked[0].candidateSense, 'трудно')
})

test('a meaning that merely contains another is not the same meaning', () => {
  // `kun` is "только"; the third meaning of `lige` is "только что". The pair is dropped here,
  // before any AI call, rather than left for the model to get wrong.
  const kun = entry('a', 'kun', [createSense('только', { source: 'ai', pos: 'adverb' })])
  const lige = entry('b', 'lige', [
    createSense('ровный, прямой', { source: 'ai', pos: 'adjective' }),
    createSense('только что', { source: 'ai', pos: 'adverb' }),
  ])
  assert.deepEqual(rankSynonymCandidates(kun, [lige]), [])

  // A genuine repeat of the same meaning still scores full marks.
  const bare = entry('c', 'blot', [createSense('только', { source: 'ai', pos: 'adverb' })])
  assert.equal(rankSynonymCandidates(kun, [bare])[0].score, 1)

  // A sense written as a list is several wordings of one meaning, not a longer phrase.
  const svaert = entry('d', 'svært', [createSense('трудно, тяжело', { source: 'split', pos: 'adverb' })])
  const besvaerligt = entry('e', 'besværligt', [createSense('трудно', { source: 'ai', pos: 'adverb' })])
  assert.equal(rankSynonymCandidates(svaert, [besvaerligt])[0].score, 1, 'a listed alternative still matches')
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

test('a concept written in the wrong script is the model drifting to English', () => {
  // The real failure: `bare` ("только") joined to `lige` ("только что") under "just now".
  // English "just" spans *only* and *just now*; Russian keeps them apart, so an English answer
  // means the distinction that decided the question is already gone.
  assert.equal(conceptMatchesSenseScript('just now', ['только', 'только что']), false)
  assert.equal(conceptMatchesSenseScript('still / yet', ['всё ещё', 'ещё']), false)

  // The same pair answered in the learner's language is exactly what was asked for.
  assert.equal(conceptMatchesSenseScript('только', ['только', 'только что']), true)
  assert.equal(conceptMatchesSenseScript('всё ещё', ['всё ещё', 'ещё']), true)

  // An English-speaking learner's senses are Latin too, so nothing is rejected for them.
  assert.equal(conceptMatchesSenseScript('only', ['only', 'just only']), true)

  // Punctuation and digits carry no script, so they never make a Cyrillic concept look Latin.
  assert.equal(conceptMatchesSenseScript('всё ещё (2)', ['всё ещё']), true)
  assert.equal(conceptMatchesSenseScript('', ['только']), false, 'an unexplained edge is not stored')
})

test('a narrowed meaning never becomes a candidate at all', () => {
  // `bare` means "только"; `lige`'s third meaning is "только что". The extra word is the whole
  // difference between *only* and *just now*, so the pair must not reach the model.
  const bare = entry('a', 'bare', [
    createSense('только', { source: 'ai', pos: 'adverb' }),
    createSense('просто', { source: 'ai', pos: 'adverb' }),
  ])
  const lige = entry('b', 'lige', [
    createSense('ровный', { source: 'ai', pos: 'adjective' }),
    createSense('прямо', { source: 'ai', pos: 'adverb' }),
    createSense('только что', { source: 'ai', pos: 'adverb' }),
  ])
  assert.deepEqual(rankSynonymCandidates(bare, [lige]), [], 'no shared meaning survives the narrowing rule')

  // Same shape, same verdict: "ещё" is not "всё ещё".
  const stadig = entry('c', 'stadig', [createSense('всё ещё', { source: 'ai', pos: 'adverb' })])
  const endnu = entry('d', 'endnu', [createSense('ещё', { source: 'ai', pos: 'adverb' })])
  assert.deepEqual(rankSynonymCandidates(stadig, [endnu]), [])

  // A meaning genuinely held in common still links.
  const kun = entry('e', 'kun', [createSense('только', { source: 'ai', pos: 'adverb' })])
  assert.equal(rankSynonymCandidates(bare, [kun])[0].candidateSense, 'только')

  // And so does a pair whose wordings overlap without either containing the other.
  const sjovt = entry('f', 'sjovt', [createSense('забавно', { source: 'ai' }), createSense('весело', { source: 'ai' })])
  const morsomt = entry('g', 'morsomt', [createSense('забавно', { source: 'ai' }), createSense('смешно', { source: 'ai' })])
  assert.equal(rankSynonymCandidates(sjovt, [morsomt]).length, 1)
})

test('the named concept has to be a meaning both words carry', () => {
  // Every good edge the graph has had names a meaning present on both sides; every bad one
  // named a meaning only one side had.
  assert.equal(conceptSharedBySenses('только', ['только', 'просто']), true)
  assert.equal(conceptSharedBySenses('только', ['только']), true)
  assert.equal(conceptSharedBySenses('только что', ['только', 'просто']), false, 'bare never means "только что"')
  assert.equal(conceptSharedBySenses('всё ещё', ['ещё']), false, 'endnu never means "всё ещё"')
  assert.equal(conceptSharedBySenses('забавно', ['забавно', 'весело']), true)
  assert.equal(conceptSharedBySenses('', ['только']), false)
  assert.equal(conceptSharedBySenses('около', []), false)
})

test('an overlap that is only a preposition is not a shared meaning', () => {
  // "получать в качестве" and "иметь в виду" have "в" in common and nothing else.
  const faa = entry('a', 'få', [createSense('получать, получать в качестве', { source: 'ai' })])
  const mene = entry('b', 'mene', [createSense('иметь в виду', { source: 'ai' })])
  assert.deepEqual(rankSynonymCandidates(faa, [mene]), [])

  // A real word in common still counts, short neighbours and all.
  const vide = entry('c', 'vide', [createSense('иметь в виду', { source: 'ai' })])
  assert.equal(rankSynonymCandidates(mene, [vide])[0].candidateSense, 'иметь в виду')
})
