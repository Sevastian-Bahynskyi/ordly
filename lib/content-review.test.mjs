import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adjudicatePass, backcheckPass, decideReview, disagreementStats, needsAdjudication, parseRepairs, parseVerdicts, repairPass, REVIEWER_PROMPTS, reviewPass } from './content-review.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/content-review.json', import.meta.url), 'utf8'))
const { items, replies } = fixture

/** A recorded-reply stand-in for DeepSeek: each op answers from its own queue, and every call is kept. */
function replay(queues) {
  const calls = []
  const complete = async (op, label, system, user, maxTokens) => {
    calls.push({ op, system, user, maxTokens })
    const queue = queues[op]
    if (!queue?.length) throw new Error(`no recorded reply left for ${op}`)
    return replies[queue.shift()]
  }
  return { complete, calls }
}

test('two agreeing reviews pass an item; a disagreement goes to the adjudicator, who decides', async () => {
  const { complete, calls } = replay({ 'deepseek.review-a': ['a_clean'], 'deepseek.review-b': ['b_one_reject'], 'deepseek.adjudicate': ['adjudicate_reject'] })
  const a = await reviewPass('a', items, complete)
  const b = await reviewPass('b', items, complete)
  const disputed = items.filter((item) => needsAdjudication(a.get(item.id), b.get(item.id)))
  assert.deepEqual(disputed.map((item) => item.id), ['s:2'])
  const adjudications = await adjudicatePass(disputed, { a, b }, complete)
  const decisions = Object.fromEntries(items.map((item) => [item.id, decideReview({ a: a.get(item.id), b: b.get(item.id), adjudication: adjudications.get(item.id) })]))
  assert.equal(decisions['s:1'].decision, 'pass')
  assert.equal(decisions['m:1'].decision, 'pass')
  assert.equal(decisions['s:2'].decision, 'reject')
  assert.ok(decisions['s:2'].disagreed)
  assert.match(decisions['s:2'].problems.join(' '), /anticipation/u)
  // The adjudicator sees the rejected item's problems; the reviewers never see each other.
  assert.match(calls.find((call) => call.op === 'deepseek.adjudicate').user, /rejected_by_the_other_because.*радуются Рождеству/u)
  assert.doesNotMatch(calls.find((call) => call.op === 'deepseek.review-b').user, /problems/u)
  const stats = disagreementStats(items, new Map(items.map((item) => [item.id, { a: a.get(item.id), b: b.get(item.id) }])))
  assert.equal(stats.disagreed, 1)
  assert.equal(stats.rate.toFixed(3), '0.333')
  assert.equal(stats.byKind.sentence.disagreed, 1)
})

test('an adjudicator that accepts overrules the rejecting reviewer', async () => {
  const { complete } = replay({ 'deepseek.review-a': ['a_clean'], 'deepseek.review-b': ['b_one_reject'], 'deepseek.adjudicate': ['adjudicate_accept'] })
  const a = await reviewPass('a', items, complete)
  const b = await reviewPass('b', items, complete)
  const adjudications = await adjudicatePass([items[1]], { a, b }, complete)
  assert.equal(decideReview({ a: a.get('s:2'), b: b.get('s:2'), adjudication: adjudications.get('s:2') }).decision, 'pass')
})

test('the two reviewers work from different instructions', () => {
  assert.notEqual(REVIEWER_PROMPTS.a, REVIEWER_PROMPTS.b)
  assert.match(REVIEWER_PROMPTS.b, /Read only the Danish/u)
})

test('prose instead of JSON, and a truncated reply, are asked again', async () => {
  const { complete, calls } = replay({ 'deepseek.review-a': ['not_json', 'truncated', 'a_clean'] })
  const verdicts = await reviewPass('a', items, complete)
  assert.equal(calls.length, 3)
  assert.equal(verdicts.size, 3)
})

test('an item left out of a reply is asked again on its own', async () => {
  const { complete, calls } = replay({ 'deepseek.review-a': ['missing_m1', 'm1_ok'] })
  const verdicts = await reviewPass('a', items, complete)
  assert.equal(verdicts.get('m:1').ok, true)
  assert.deepEqual(JSON.parse(calls[1].user).items.map((item) => item.id), ['m:1'])
})

test('a rejection without a reason and a non-boolean verdict are malformed; after the last attempt the item is unresolved', async () => {
  const { complete, calls } = replay({ 'deepseek.review-a': ['missing_m1', 'reject_without_reason', 'string_verdict'] })
  const verdicts = await reviewPass('a', items, complete, { attempts: 3 })
  assert.equal(calls.length, 3)
  assert.equal(verdicts.has('m:1'), false)
  const decision = decideReview({ a: verdicts.get('m:1'), b: { ok: true, problems: [] } })
  assert.equal(decision.decision, 'unresolved')
})

test('an id answered twice with different verdicts counts as unanswered; unknown ids are ignored', () => {
  const text = JSON.stringify({ items: [{ id: 's:1', ok: true }, { id: 's:1', ok: false, problems: ['x'] }, { id: 'zz', ok: true }, { id: 's:2', ok: false, problems: 'wrong tense' }] })
  const verdicts = parseVerdicts(text, ['s:1', 's:2'])
  assert.equal(verdicts.has('s:1'), false)
  assert.equal(verdicts.has('zz'), false)
  assert.deepEqual(verdicts.get('s:2'), { ok: false, problems: ['wrong tense'] })
})

test('the back-translation comparison reports drift per sentence', async () => {
  const { complete } = replay({ 'deepseek.backcheck': ['backcheck'] })
  const result = await backcheckPass([
    { id: 's:1', danish: 'Jeg glæder mig til ferien.', back: 'Jeg ser frem til ferien.' },
    { id: 's:2', danish: 'Børnene glæder sig til julen.', back: 'Børnene er glade for julen.' },
  ], complete)
  assert.equal(result.get('s:1').same, true)
  assert.equal(result.get('s:2').same, false)
})

test('verdicts recorded in the calibration batch replay to the same decisions', async () => {
  const { items: recordedItems, replies: recorded } = fixture.recorded
  const answers = { 'deepseek.review-a': recorded.a, 'deepseek.review-b': recorded.b, 'deepseek.adjudicate': recorded.adjudicate }
  const complete = async (op) => answers[op]
  const a = await reviewPass('a', recordedItems, complete)
  const b = await reviewPass('b', recordedItems, complete)
  const disputed = recordedItems.filter((item) => needsAdjudication(a.get(item.id), b.get(item.id)))
  const adjudications = await adjudicatePass(disputed, { a, b }, complete)
  const decisions = recordedItems.map((item) => decideReview({ a: a.get(item.id), b: b.get(item.id), adjudication: adjudications.get(item.id) }).decision)
  // Reviewer A rejected "to give up" for give sig; the adjudicator agreed. The second sense's
  // example was rejected by B for its translations, the adjudicator agreed; its meaning passed.
  assert.deepEqual(decisions, ['reject', 'reject', 'pass', 'reject'])
  assert.equal(disputed.length, 3)
})

test('a repair fixes only the part the reviewers named, per kind, or drops the item', async () => {
  const meaning = { id: 'm:x#1', kind: 'meaning', lemma: 'lade være', entry_kind: 'phrase', pos: 'verb', meaning: { ru: 'оставлять в покое', en: 'to leave alone', uk: 'залишати в спокої' } }
  const example = { id: 'e:x#1', kind: 'example', lemma: 'have lyst', entry_kind: 'phrase', pos: 'verb', meaning: { ru: 'хотеть', en: 'to want' }, danish: 'Jeg har lyst til en kop te.', target: 'har lyst', translations: { en: 'I want a cup of tea.', ru: 'Мне хочется чашку чая.', uk: 'Мені хочеться чашку чаю.' } }
  const bad = { id: 'e:y#1', kind: 'example', lemma: 'få sig', entry_kind: 'phrase', pos: 'verb', meaning: { ru: 'x', en: 'x' }, danish: 'Hun fik sig efter det dårlige nyhed.', target: 'fik sig', translations: { en: 'x', ru: 'x', uk: 'x' } }
  const reply = JSON.stringify({ items: [
    { id: 'm:x#1', meaning: { ru: 'оставлять в покое', en: 'to leave alone', uk: 'залишати у спокої' } },
    { id: 'e:x#1', translations: { en: 'I feel like a cup of tea.', ru: 'Мне хочется чашки чая.', uk: 'Мені хочеться чашки чаю.' }, danish: 'Something else.' },
    { id: 'e:y#1', drop: 'the Danish is ungrammatical (det nyhed)' },
  ] })
  const calls = []
  const found = await repairPass([
    { item: meaning, problems: ['uk: в → у'] }, { item: example, problems: ['uk genitive'] }, { item: bad, problems: ['det dårlige nyhed'] },
  ], async (op, label, system, user) => { calls.push({ op, system, user }); return reply })
  assert.equal(calls[0].op, 'deepseek.repair')
  assert.ok(JSON.parse(calls[0].user).items.every((entry) => entry.problems.length), 'every item goes with its defects')
  assert.deepEqual(found.get('m:x#1'), { meaning: { ru: 'оставлять в покое', en: 'to leave alone', uk: 'залишати у спокої' } })
  assert.deepEqual(found.get('e:x#1'), { translations: { en: 'I feel like a cup of tea.', ru: 'Мне хочется чашки чая.', uk: 'Мені хочеться чашки чаю.' } }, 'the Danish is never rewritten by a repair')
  assert.deepEqual(found.get('e:y#1'), { drop: 'the Danish is ungrammatical (det nyhed)' })

  // A reply that gives a kind the wrong part is no repair at all.
  const wrong = parseRepairs(JSON.stringify({ items: [{ id: 'm:x#1', translations: { en: 'a', ru: 'б', uk: 'в' } }, { id: 'e:x#1', meaning: { ru: 'x' } }] }), [meaning, example])
  assert.equal(wrong.size, 0)
})
