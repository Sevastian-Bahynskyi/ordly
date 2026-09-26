/**
 * Newly populated catalog content reaches Practice (issue #16, acceptance: "a learner can save and
 * practise at least one newly populated item in each selected level band and learner language").
 *
 * Runs against a disposable local stack with the catalog loaded, as a signed-in learner (RLS on):
 * for one new phrase sense and one new word sense per band, it reads the families exactly as
 * Practice does (lib/practice-server.ts, catalogContexts) and applies Practice's own filter
 * (lib/practice-contexts.ts, contextsBySense) for a learner at that band, in English, Russian and Ukrainian (issue #24).
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… LEARNER_EMAIL=… LEARNER_PASSWORD=… \
 *     pnpm exec tsx supabase/tests/catalog-contexts.mjs
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { senseId } from '../../lib/catalog-import.ts'
import { contextsBySense } from '../../lib/practice-contexts.ts'

const url = process.env.SUPABASE_URL
if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):/u.test(url)) throw new Error('Refusing to run anywhere but a local stack')
const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { error: signInError } = await client.auth.signInWithPassword({ email: process.env.LEARNER_EMAIL, password: process.env.LEARNER_PASSWORD })
if (signInError) throw signInError

// One newly populated phrase sense and one word sense per band, each with a family at that band.
const probes = {
  A1: [['heller ikke', 'phrase'], ['hvad', 'word']],
  A2: [['stå op', 'phrase'], ['sin', 'word']],
  B1: [['uden for', 'phrase'], ['flytte', 'word']],
  B2: [['gå ind for', 'phrase'], ['regering', 'word']],
}

let checked = 0
for (const [band, pairs] of Object.entries(probes)) {
  for (const [lemma, kind] of pairs) {
    const id = senseId(lemma, kind, 1)
    const { data, error } = await client.from('catalog_sentence_family')
      .select('sense_id, level, catalog_sentence_variant(id, version, danish, target, translations, orders, accepted)').eq('sense_id', id)
    assert.equal(error, null)
    assert.ok(data.some((row) => row.level === band), `${lemma}: no ${band} family loaded`)
    for (const locale of ['en', 'ru', 'uk']) {
      const contexts = contextsBySense(data, locale, band)[id] || []
      const atBand = contexts.filter((context) => data.find((row) => row.catalog_sentence_variant.some((variant) => variant.id === context.variantId))?.level === band)
      assert.ok(atBand.length >= 2, `${lemma} (${kind}) ${band} ${locale}: ${atBand.length} usable sentences`)
      console.log(`${band} ${locale} ${kind.padEnd(6)} ${lemma.padEnd(12)} ${atBand.length} sentences, e.g. "${atBand[0].sentence}" → "${atBand[0].translation}"`)
      checked += 1
    }
  }
}
console.log(`ok: ${checked} band × language × kind combinations each give Practice at least two catalog sentences`)
