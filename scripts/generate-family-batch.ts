/**
 * Bounded generation for one deterministic target batch (issue #16, Phase 2/3).
 *
 * DeepSeek writes only the Danish half of each family (frame, slots, variant target forms, and
 * optional word-order/accepted-answer judgements): no English, no Russian. Azure Translator fills
 * `en`/`ru` on the finished Danish sentence afterwards — mechanical translation only, so it cannot
 * inject a wrong sense, grammar choice or CEFR level. The existing gate
 * (scripts/check-family-batches.ts) is untouched and still the source of truth for correctness.
 *
 * Sequential, checkpointed, retried with backoff. Run again after an interruption: rows already
 * written to `--out` are skipped by sense_id.
 *
 *   pnpm exec tsx --env-file=.env.corpus.local scripts/generate-family-batch.ts \
 *     --work catalog/families/work/batch-0100.json --out catalog/families/out/batch-0100.json
 */
import { existsSync } from 'node:fs'
import { deepseekJson, spendLine, translate, translationFidelityOk, usage } from './azure-corpus'
import { readFile, writeFile } from 'node:fs/promises'
import { normalizeSentence, variantDanish, type FamilyWorkSense } from '../lib/catalog-families'
import { emptySlotsNeedVaryingTarget, finitePhraseAfterFrontedAdverbial, frontedSubordinateNeedsComma, infinitiveAfterAtOrModal, subjectPronounAfterPreposition, ordersUseSameWords, slotsDeclaredInFrame, invalidRequiresTarget, lemmaNotDuplicatedInFrame, mixedSFormConstruction, needsMinimumVariants, nonAsciiSlotName, sentenceAdverbBeforeVerb, targetMustOccurOnce } from '../lib/catalog-families-style'
import { countPhraseOccurrences } from '../lib/catalog-phrases'
import { parseFullForms } from '../lib/ddo-fullform'
import { findMisspellings } from '../lib/spelling'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const workPath = option('--work')
const outPath = option('--out')
const fullFormsPath = option('--fullforms')
if (!workPath || !outPath || !fullFormsPath) {
  console.error('Usage: generate-family-batch.ts --work <work.json> --out <out.json> --fullforms <ddo-fullforms.csv>')
  process.exit(1)
}
// The same DDO full-form index the gate itself uses (scripts/check-family-batches.ts), so a
// sentence is checked against exactly the word list the gate will judge it by, before Translator
// budget is spent on it.
const known = parseFullForms(await readFile(fullFormsPath, 'utf8')).known

// ---- DeepSeek: Danish only -------------------------------------------------

const RULES = `You write ONE reusable Danish sentence family for ONE catalog sense, for a spaced-repetition
app. Reply with a single JSON object and nothing else — no markdown fence, no commentary.

You are given: the sense's lemma, part of speech, gender, its meaning (Russian wording, and
English if present), and the verified forms of the word in this part of speech — you may only put
one of those exact forms into a sentence. You are also given a REQUIRED target: the exact CEFR
level, situation and grammar-feature ids the family must use (from catalog/benchmark/cefr-matrix.json).
Do not choose a different level, situation or grammar id. If you cannot honestly write this sense
at this target, reply {"sense_id": "...", "lemma": "...", "skip": "why"} instead — a skip is far
better than a doubtful or mismatched family.

Output shape (Danish only — do not include "en" or "ru" anywhere, a separate mechanical
translation step fills those):
{
  "lemma": "...", "kind": "word", "sense_id": "...",
  "level": "<the required level>", "situation": "<the required situation id>", "grammar": "<the required grammar id>",
  "frame": "{subject} ligger på {target}.",
  "slots": { "subject": [ { "da": "Bogen" }, { "da": "Tasken" }, { "da": "Min telefon" } ] },
  "variants": [
    { "slots": { "subject": 0 }, "target": "gulvet" },
    { "slots": { "subject": 1 }, "target": "gulvet", "orders": ["På gulvet ligger tasken."] }
  ]
}

Rules:
1. The sentence must demonstrate exactly this sense, not another one a reader could mistake it for.
2. Natural, idiomatic, grammatically correct Danish a native speaker would say. V2 word order,
   correct sin/hans, der/som, en/et, adjective agreement, definite suffix vs article+adjective.
   No calques from English or Russian.
3. frame has {target} exactly once and one lowercase {slot} per varying part, punctuation at the
   end; the first letter is capitalised automatically, so do not capitalise it yourself. A slot
   name is PLAIN ASCII ONLY — lowercase a-z, digits, underscore — never æ, ø or å, even though the
   slot's own Danish CONTENT (its "da" options) obviously does use them freely. {formål} is
   INVALID as a placeholder (the "å" breaks it — it silently stays as literal, unfilled text
   instead of being replaced, and everything downstream, including the translation, breaks on it);
   {purpose} or {formaal} naming the same slot is fine.
4. slots: 1-6 Danish phrase options per slot. An option that only fits some partners declares it:
   {"da": "i går", "requires": {"verb": [1]}} — may appear only when the "verb" slot picks option 1.
   "requires" may only name OTHER SLOTS, never "target" — "target" is not a slot (rule 5) and does
   not appear in a variant's chosen-option map, so a requires naming it is always invalid and
   rejected. If every option of a slot only makes sense with one particular target form and you
   are not varying the target anyway, just leave "requires" off — it is unneeded.
5. {target} is NEVER a slot and is never renamed. Even though the target word's own form
   changes between variants (present vs past tense, singular vs plural, indicative vs the passive
   auxiliary...), the frame always spells it literally {target} — do not invent a differently
   named placeholder such as {verb} or {adj} for the word being taught, even for a verb or
   adjective sense. If a frame has no other varying part, the family's own "slots" is {} and still
   give 2-6 variants that differ only in which verified form fills {target} (e.g. present-tense
   variants next to past-tense ones) — never stop at a single variant. EVERY variant object still
   has a "slots" field, even then: write "slots": {} on each variant rather than leaving the key
   out. Example, a verb sense with nothing else varying:
   { "frame": "Huset {target} bygget i 1990.", "slots": {},
     "variants": [ { "slots": {}, "target": "blev" }, { "slots": {}, "target": "bliver" } ] }
6. For kind "word", "target" is always exactly ONE of the given verified forms — a single word, never a phrase (kind "phrase": rule 20). A
   periphrastic construction (passive "blive" + past participle, perfect "have" + past participle,
   future "vil"/"skal" + infinitive, a modal + infinitive) puts every OTHER word in its own named
   slot or fixed frame text with the fitting option(s); "target" stays only this lemma's own
   verified form. Example: for "blive" (passive auxiliary) in "Huset {target} bygget i 1990.",
   target is "blev" (one word) and "bygget" is a fixed slot option, not part of target. The same
   applies in reverse when the LEMMA itself is the one in the infinitive: if you want a future-
   tense variant of a verb whose target is its bare infinitive, "vil" or "skal" MUST appear as
   fixed text or a slot option immediately before {target} in that variant's frame position —
   never drop it. "Ifølge planen {target} virksomheden mere personale." with target "ansætte" is
   WRONG (a bare infinitive cannot be the finite verb of a main clause — this is ungrammatical,
   not just informal); "Ifølge planen vil virksomheden {target} mere personale." with target
   "ansætte" is correct. The same rule applies to an ARTICLE before a noun target: "et menneske"
   or "en bil" is TWO words, not a verified form — the article ("en"/"et"/"den"/"det") goes in the
   frame's fixed text or its own slot option, and target stays the bare noun form ("menneske",
   "bil"). "har {target} brug for søvn" with target "et menneske" is WRONG; "har {article}
   menneske brug for søvn" — or simply "{target} har brug for søvn" with the indefinite meaning
   understood from context — with target "menneske" is correct.
7. variants: 2-6 explicit combinations. Every slot in the frame must have a chosen option index.
   "target" must appear exactly once in the filled sentence. "orders" (optional) lists other
   complete Danish word orders using the exact same words that are equally natural — omit if none
   or unsure. "accepted" (optional, at most 4) lists other single Danish words that would also
   correctly fill the gap given the sentence's meaning — omit if none.
8. Every variant must be a genuinely correct, complete sentence on its own — check agreement after
   substituting the slot, not just the base sentence.
8b. Two variants may never end up meaning the same thing in translation. When a frame has no other
    varying slot, pick target forms that are genuinely different in tense, number or mood — not an
    archaic or rare spelling of the same tense (an inflected-form list can contain such spellings;
    picking one anyway just produces a same-meaning duplicate, which the gate rejects). If you
    truly cannot find 2+ target forms giving distinct meanings for this frame, add a slot that
    varies instead (a different subject/time/place), or skip the sense with a reason.
10. Danish main clauses are V2: whatever occupies first position, the FINITE VERB comes second,
    before the subject. This applies to a fronted SUBORDINATE CLAUSE (its options start with
    selvom, hvis, da, fordi, når, mens, inden, før, siden, medmindre, uanset, idet...) — the literal
    text right after that placeholder's closing brace MUST begin with ", " (comma, space), and the
    text right after the comma must be the verb, before the subject. Correct: "{subordinate},
    fremlagde statsministeren en reform." Wrong: "{subordinate} statsministeren fremlagde en
    reform." (no comma, subject before verb). It EQUALLY applies to any other fronted element —
    a prepositional phrase, an adverb, a time expression — even with no comma needed. Correct:
    "Ifølge den nye lov skal borgerne betale en afgift." (verb "skal" right after the fronted
    phrase, before the subject "borgerne"). Wrong: "Ifølge den nye lov borgerne skal betale en
    afgift." (subject before verb — ungrammatical, the single most common mistake here). Whenever
    the frame's first words are not the grammatical subject, check that the very next thing is the
    verb.
11. An adjective target NEVER uses "slots": {} — always give it a real varying slot (a different
    subject/time/place). Nothing in an all-fixed frame could justify klar/klare/klarere/klarest
    disagreeing with a fixed subject, and if the target form stays the same too, the sentence
    cannot vary either way — there is no version of "slots": {} that works for an adjective.
    Non-adjective targets with "slots": {} must still use at least two genuinely different target
    forms (present vs past, singular vs plural) — the same form repeated with only a different
    "orders" entry is one sentence, not two variants, and will be rejected.
13. Every family needs 2-6 variants that are genuinely different sentences with genuinely
    different translations — never two variants that end up meaning (and translating to) the same
    thing. Before finishing, check this yourself: would a fluent reader translate variant 1 and
    variant 2 to distinct English sentences? If any two would not, fix it before replying, using
    whichever applies:
    - the target forms you picked are real but interchangeable in meaning here (see rule 8b) — use
      genuinely different tenses/numbers, or add a varying slot instead;
    - one target form is a special construction incompatible with how you built the rest of the
      sentence — in particular, an -s passive/mediopassive form (meddeltes, siges, ses, findes) is
      NOT a drop-in substitute for the periphrastic passive ("blive" + participle) or the ordinary
      active form; do not mix an -s passive variant into a family whose other variants and fixed
      frame text assume an active or "blive"-passive subject — pick one construction and stay in it;
    - the frame has a FIXED (non-slot) time expression (i går, i går aftes, i morgen, nu, dengang)
      that only makes sense for one of the tenses you are varying the target across — either drop
      the fixed time expression from the frame, or put it in its own slot with matching options for
      each tense, so present- and past-tense variants each get a time expression that actually
      fits.
14. Prefer common, everyday Danish words for any slot option or fixed frame text that is not the
    target itself. Avoid inventing an unusual compound (marketingkonsulent, nyhedsankeret) when a
    simpler, common word says the same thing (konsulenten, journalisten, tv-værten) — an
    ad-hoc compound risks not being in the spelling source even when it is valid Danish, and a
    sentence otherwise ready to publish is quarantined over one uncommon word.
15. Prefer B2-appropriate register when the target level is B2: subordinate clauses, passive,
   abstract topics, longer sentences are welcome and expected, not just simple A1-style sentences.
16. If a slot's option embeds its own person/number (a pronoun or a person-specific phrase like
   "fik jeg" — "I got"), every OTHER slot in the same combination must agree with that person —
   either write only impersonal/agreement-free options in that slot (preferred, simplest), or
   declare "requires" limiting the person-specific option to the matching {subject} option(s). A
   sentence that opens "Da vi..." ("When we...") and continues "...fik jeg..." ("...I got...")
   mixes two different people in one sentence, which is incoherent even though each half is
   grammatical on its own.
17. A Danish SENTENCE ADVERB (dog, nok, jo, vel, sikkert, måske, ikke as clause negation, and any
   grammar "sentence-adverbs" target) goes AFTER the finite verb in a non-fronted main clause,
   never between the subject and the verb. "Patienten dog nægtede at tage medicinen." is WRONG
   (adverb before the verb); "Patienten nægtede dog at tage medicinen." is correct (verb, then the
   adverb). If you front the adverb itself as {target} at the very start of the sentence, V2
   inversion applies as usual (rule 10): "{target} nægtede patienten at tage medicinen."
18. "verb-future" means the sentence must actually be in the future — "vil"/"skal" + the bare
   infinitive target (rule 6). Present or past tense variants do not belong in this grammar cell,
   even if the sentence is otherwise perfectly correct Danish — they simply demonstrate a
   different grammar cell (verb-present/verb-past) and are filed wrong.
19. "både X og Y" coordinating two NOUN predicates needs the copula "er" (or another appropriate
   verb) between the subject and "både" — "Konsulenten både koordinator og sælger." is missing a
   verb entirely and is ungrammatical; "Konsulenten er både koordinator og sælger." is correct.
20. When "kind" is "phrase", the lemma is a multi-word expression and "target" is exactly ONE of the
   given forms, copied exactly — a multi-word string such as "står op" or "glæder mig til". The
   expression's words must stand together in the sentence as one unbroken span: never split it by
   inversion ("Jeg står op klokken syv." — not "Klokken syv står jeg op.") or by an object or adverb
   placed inside it. Use a subject-first main clause, a subordinate clause, or an infinitive or
   perfect construction in which the expression stays together; an auxiliary (vil, skal, kan, har,
   er) is frame text before {target}. Never repeat one of the expression's words next to {target}.
   Keeping the words together NEVER overrides V2: if anything other than the subject opens a main
   clause, the finite verb comes second and the subject third, which splits a finite particle verb —
   so do not front anything then. "I morgen finder sted mødet." and "I sin artikel kom ind på
   journalisten emnet." are WRONG (subject after the whole expression); write "Mødet finder sted i
   morgen." / "Journalisten kom ind på emnet i sin artikel." instead. Likewise "pleje at" takes no
   modal ("Jeg plejer at løbe", never "Jeg vil pleje at løbe").
   A form containing a reflexive pronoun must agree with the subject (jeg → "glæder mig til", vi →
   "glæder os til", hun → "glæder sig til"): if the subject varies, the target form varies with it,
   and a subject option that does not agree with a variant's target is never combined with it.
   "grammar" "particle-verbs", "reflexive" or "fixed-expressions" means the sentence exercises the
   expression itself; a time, place or other cell means it exercises that function of the expression.`

interface DanishVariant { slots: Record<string, number>; target: string; orders?: string[]; accepted?: string[] }
interface DanishFamily {
  lemma: string; kind: 'word' | 'phrase'; sense_id: string
  level: string; situation: string; grammar: string
  frame: string; slots: Record<string, { da: string; requires?: Record<string, number[]> }[]>
  variants: DanishVariant[]
}
type DanishReply = DanishFamily | { sense_id: string; lemma: string; skip: string }

async function generateDanish(row: FamilyWorkSense & { target: { level: string; situation: string; grammar: string } }, correction: string | null): Promise<DanishReply> {
  const user = JSON.stringify({
    lemma: row.lemma, kind: row.kind, sense_id: row.sense_id, pos: row.pos, gender: row.gender,
    ru: row.ru, en: row.en, min_level: row.min_level, forms: row.forms, required_target: row.target,
    ...(correction ? { required_correction: correction } : {}),
  })
  return await deepseekJson('deepseek.generate', row.lemma, RULES, user) as DanishReply
}

// ---- Orchestration ----------------------------------------------------------

const work = JSON.parse(await readFile(workPath, 'utf8')) as (FamilyWorkSense & { target: { level: string; situation: string; grammar: string } })[]
const existingOut: unknown[] = existsSync(outPath) ? JSON.parse(await readFile(outPath, 'utf8')) as unknown[] : []
// One sense may get several families (one per target cell), so a reply is matched to its work row
// by sense and cell. A skip written before skips carried their cell matches by sense alone.
const cellKey = (senseId: string, target: { level: string; situation: string; grammar: string }): string => `${senseId}|${target.level}|${target.situation}|${target.grammar}`
const done = new Set(existingOut.map((raw) => {
  const row = raw as { sense_id?: string; level?: string; situation?: string; grammar?: string; target?: { level: string; situation: string; grammar: string } }
  if (row.level && row.situation && row.grammar) return cellKey(String(row.sense_id), { level: row.level, situation: row.situation, grammar: row.grammar })
  return row.target ? cellKey(String(row.sense_id), row.target) : String(row.sense_id)
}))
const results: unknown[] = [...existingOut]

const GENERATE_ATTEMPTS = 3

for (const row of work) {
  if (done.has(cellKey(row.sense_id, row.target)) || done.has(row.sense_id)) { console.log(`· ${row.lemma}: already generated, skipping`); continue }
  console.log(`… ${row.lemma} → ${row.target.level}/${row.target.situation}/${row.target.grammar}`)

  let accepted: DanishFamily | null = null
  let lastReason = 'unknown'
  for (let attempt = 1; attempt <= GENERATE_ATTEMPTS && !accepted; attempt += 1) {
    const seedNote = (row as { note?: string }).note ?? null
    const reply = await generateDanish(row, attempt > 1 ? lastReason : seedNote)
    if ('skip' in reply) { lastReason = `model skipped: ${reply.skip}`; console.log(`  attempt ${attempt}: ${lastReason}`); continue }
    if (reply.level !== row.target.level || reply.situation !== row.target.situation || reply.grammar !== row.target.grammar) {
      lastReason = `target mismatch: model returned ${reply.level}/${reply.situation}/${reply.grammar}, required ${row.target.level}/${row.target.situation}/${row.target.grammar}`
      console.log(`  attempt ${attempt}: ${lastReason}`)
      continue
    }
    const spellingErrors: string[] = []
    const occurrenceErrors: string[] = []
    for (const variant of reply.variants) {
      const danish = variantDanish({ frame: reply.frame, slots: reply.slots }, variant)
      if (!danish) continue
      occurrenceErrors.push(...targetMustOccurOnce(danish, variant.target))
      occurrenceErrors.push(...ordersUseSameWords(danish, variant.orders))
      if (row.pos === 'verb') occurrenceErrors.push(...infinitiveAfterAtOrModal(danish, variant.target, row.lemma.split(' ')[0]), ...finitePhraseAfterFrontedAdverbial(danish, variant.target, row.lemma.split(' ')[0]))
      occurrenceErrors.push(...subjectPronounAfterPreposition(danish))
      // A multi-word preposition with nothing after it is the one-word adverb (`uden for byen`, but
      // `vi stod udenfor`): the sense being taught is the preposition, so it needs its complement.
      if (row.kind === 'phrase' && row.pos === 'preposition' && new RegExp(`${variant.target.replace(/\s+/gu, '\\s+')}\\s*[.!?,]`, 'iu').test(danish)) occurrenceErrors.push(`"${variant.target}" is a preposition here and must be followed by its complement (uden for byen) — with nothing after it, it is the adverb, spelled as one word`)
      if (!row.forms.includes(variant.target.toLocaleLowerCase('da-DK'))) occurrenceErrors.push(`"${variant.target}" is not one of the given forms — copy a form exactly`)
      else if (countPhraseOccurrences(danish, [variant.target]) === 0) occurrenceErrors.push(`the target "${variant.target}" does not appear as one unbroken span in "${danish}"`)
      const misspellings = await findMisspellings(danish)
      if (misspellings === null) continue // source unavailable locally; the real gate still checks it
      const unknown = misspellings.map((m) => m.word).filter((word) => !known.has(word.toLocaleLowerCase('da-DK')))
      if (unknown.length) spellingErrors.push(`"${danish}" has unknown word(s) ${unknown.join(', ')}`)
    }
    const styleErrors = [
      ...needsMinimumVariants(reply.variants),
      ...nonAsciiSlotName(reply.frame),
      ...sentenceAdverbBeforeVerb(reply.grammar, reply.frame),
      ...frontedSubordinateNeedsComma(reply.frame, reply.slots),
      ...emptySlotsNeedVaryingTarget(row.pos, reply.slots, reply.variants),
      ...mixedSFormConstruction(reply.variants),
      ...invalidRequiresTarget(reply.slots),
      ...slotsDeclaredInFrame(reply.frame, reply.slots),
      ...lemmaNotDuplicatedInFrame(row.lemma, reply.frame),
      ...occurrenceErrors,
      ...spellingErrors,
    ]
    if (styleErrors.length) {
      lastReason = `style check: ${styleErrors.join('; ')}`
      console.log(`  attempt ${attempt}: ${lastReason}`)
      continue
    }
    accepted = reply
  }
  if (!accepted) {
    console.log(`  giving up after ${GENERATE_ATTEMPTS} attempts: ${lastReason}`)
    results.push({ sense_id: row.sense_id, lemma: row.lemma, target: row.target, skip: lastReason })
    await writeFile(outPath, `${JSON.stringify(results, null, 1)}\n`)
    continue
  }
  const variants: (DanishVariant & { en: string; ru: string })[] = []
  for (const variant of accepted.variants) {
    const danish = variantDanish({ frame: accepted.frame, slots: accepted.slots }, variant)
    if (!danish) { console.log(`  variant unfillable, dropping`); continue }
    const en = await translate(danish, 'en')
    const ru = await translate(danish, 'ru')
    if (!(await translationFidelityOk(danish, en, ru))) continue
    // Two Danish sentences the translation cannot tell apart (`voksede op` / `er vokset op`, both
    // "grew up") are one exercise to a learner, and the gate refuses the repeat: keep the first.
    const seen = (text: string): string => normalizeSentence(text)
    if (variants.some((kept) => seen(kept.en) === seen(en) || seen(kept.ru) === seen(ru))) { console.log(`  "${danish}" translates like an earlier variant — dropped`); continue }
    variants.push({ ...variant, en, ru })
  }
  if (variants.length < 2) {
    // Too few sentences survived the round-trip check to make a family: a reported skip, which a
    // later run can regenerate, rather than a malformed family the gate would count as a failure.
    console.log(`  only ${variants.length} variant(s) survived the translation check — skipped`)
    results.push({ sense_id: row.sense_id, lemma: row.lemma, target: row.target, skip: `translation fidelity: ${variants.length} of ${accepted.variants.length} variants survived` })
    await writeFile(outPath, `${JSON.stringify(results, null, 1)}\n`)
    continue
  }
  results.push({ ...accepted, variants })
  await writeFile(outPath, `${JSON.stringify(results, null, 1)}\n`)
  console.log(`  ok: ${variants.length} variant(s) · spend so far $${usage.modelUsd.toFixed(4)} model, ${usage.translatorChars} translator chars`)
}

console.log(`Done. ${results.length} row(s) → ${outPath}`)
console.log(spendLine())
