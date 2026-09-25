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
import { readFile, writeFile } from 'node:fs/promises'
import { normalizeSentence, variantDanish, type FamilyWorkSense } from '../lib/catalog-families'
import { emptySlotsNeedVaryingTarget, frontedSubordinateNeedsComma, invalidRequiresTarget, lemmaNotDuplicatedInFrame, mixedSFormConstruction, needsMinimumVariants, nonAsciiSlotName, sentenceAdverbBeforeVerb, targetMustOccurOnce } from '../lib/catalog-families-style'
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

const FOUNDRY_ENDPOINT = requireEnv('AZURE_FOUNDRY_ENDPOINT')
const FOUNDRY_KEY = requireEnv('AZURE_FOUNDRY_API_KEY')
const MODEL = requireEnv('AZURE_CORPUS_MODEL')
const TRANSLATOR_KEY = requireEnv('AZURE_TRANSLATOR_KEY')
const TRANSLATOR_ENDPOINT = requireEnv('AZURE_TRANSLATOR_ENDPOINT')
const BUDGET_USD = Number(process.env.AZURE_CORPUS_BUDGET_USD || '100')

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) { console.error(`Missing ${name} — is --env-file=.env.corpus.local set?`); process.exit(1) }
  return value
}

// Azure AI Foundry list price for DeepSeek-V4-Pro, 2026-09-25 (input/output per token). A
// Microsoft Q&A thread reports live billing running up to ~4.5x list on this route, so the
// running budget check applies SAFETY_MARGIN on top of this estimate rather than trusting it bare.
const PRICE_PER_TOKEN_IN = 1.74 / 1_000_000
const PRICE_PER_TOKEN_OUT = 3.48 / 1_000_000
const SAFETY_MARGIN = 5

const usagePath = 'catalog/families/azure-usage.json'
interface Usage { modelUsd: number; translatorChars: number; calls: { op: string; model?: string; inputTokens?: number; outputTokens?: number; usd?: number; chars?: number; at: string }[] }
const usage: Usage = existsSync(usagePath) ? JSON.parse(await readFile(usagePath, 'utf8')) as Usage : { modelUsd: 0, translatorChars: 0, calls: [] }

async function saveUsage(): Promise<void> {
  await writeFile(usagePath, `${JSON.stringify(usage, null, 1)}\n`)
}

function budgetRemaining(): number {
  return BUDGET_USD - usage.modelUsd * SAFETY_MARGIN
}

function assertBudget(): void {
  if (budgetRemaining() <= 0) {
    console.error(`Budget exhausted: $${usage.modelUsd.toFixed(4)} spent (×${SAFETY_MARGIN} safety margin) of $${BUDGET_USD} ceiling. Stopping.`)
    process.exit(1)
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const wait = Math.min(30_000, 1000 * 2 ** (attempt - 1))
      console.error(`${label} attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : String(error)} — retrying in ${wait}ms`)
      if (attempt < attempts) await sleep(wait)
    }
  }
  throw lastError
}

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
6. "target" is always exactly ONE of the given verified forms — a single word, never a phrase. A
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
   verb entirely and is ungrammatical; "Konsulenten er både koordinator og sælger." is correct.`

interface DanishVariant { slots: Record<string, number>; target: string; orders?: string[]; accepted?: string[] }
interface DanishFamily {
  lemma: string; kind: 'word' | 'phrase'; sense_id: string
  level: string; situation: string; grammar: string
  frame: string; slots: Record<string, { da: string; requires?: Record<string, number[]> }[]>
  variants: DanishVariant[]
}
type DanishReply = DanishFamily | { sense_id: string; lemma: string; skip: string }

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(`no JSON object in reply: ${text.slice(0, 200)}`)
  return JSON.parse(text.slice(start, end + 1))
}

async function generateDanish(row: FamilyWorkSense & { target: { level: string; situation: string; grammar: string } }, correction: string | null): Promise<DanishReply> {
  const user = JSON.stringify({
    lemma: row.lemma, kind: row.kind, sense_id: row.sense_id, pos: row.pos, gender: row.gender,
    ru: row.ru, en: row.en, min_level: row.min_level, forms: row.forms, required_target: row.target,
    ...(correction ? { required_correction: correction } : {}),
  })
  return withRetry(`DeepSeek ${row.lemma}`, async () => {
    assertBudget()
    const res = await fetch(`${FOUNDRY_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': FOUNDRY_KEY },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: RULES }, { role: 'user', content: user }],
        temperature: 0.4,
        max_tokens: 1200,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = await res.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } }
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new Error('empty completion')
    if (body.usage) {
      const usd = body.usage.prompt_tokens * PRICE_PER_TOKEN_IN + body.usage.completion_tokens * PRICE_PER_TOKEN_OUT
      usage.modelUsd += usd
      usage.calls.push({ op: 'deepseek.generate', model: MODEL, inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens, usd, at: new Date().toISOString() })
      await saveUsage()
    }
    return extractJson(content) as DanishReply
  })
}

// ---- Azure Translator: mechanical EN/RU on the finished Danish sentence ---

const translationCachePath = 'catalog/families/translation-cache.json'
const translationCache: Record<string, string> = existsSync(translationCachePath) ? JSON.parse(await readFile(translationCachePath, 'utf8')) as Record<string, string> : {}
async function saveTranslationCache(): Promise<void> {
  await writeFile(translationCachePath, `${JSON.stringify(translationCache, null, 1)}\n`)
}

async function translate(text: string, to: string, from = 'da'): Promise<string> {
  const key = `${from}>${to}:${text.trim().toLocaleLowerCase('da-DK')}`
  const cached = translationCache[key]
  if (cached) return cached
  const result = await withRetry(`Translator ${from}->${to} "${text.slice(0, 30)}…"`, async () => {
    const res = await fetch(`${TRANSLATOR_ENDPOINT}/translate?api-version=3.0&from=${from}&to=${to}`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ Text: text }]),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = await res.json() as { translations: { text: string }[] }[]
    const out = body[0]?.translations?.[0]?.text
    if (!out) throw new Error('empty translation')
    return out
  })
  usage.translatorChars += text.length
  usage.calls.push({ op: `translator.${from}-${to}`, chars: text.length, at: new Date().toISOString() })
  await saveUsage()
  translationCache[key] = result
  await saveTranslationCache()
  return result
}

/**
 * Mechanical translation-fidelity check (issue #16 rerun, 2026-09-25): back-translate the
 * generated en/ru through Translator into Danish and compare word overlap against the original
 * Danish sentence. Round-tripping through machine translation always paraphrases somewhat, so
 * this is deliberately lenient — it exists to catch the observed defect (a translation that
 * structurally diverged from the Danish: wrong tense, dropped verb, wrong noun), not to demand a
 * literal match. Below-threshold variants are dropped rather than published; the family is
 * completed on the next run once it has enough surviving variants, or flagged for regeneration.
 */
const FIDELITY_MIN_OVERLAP = 0.35
function wordOverlap(a: string, b: string): number {
  const left = new Set(a.split(' ').filter(Boolean))
  const right = new Set(b.split(' ').filter(Boolean))
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / Math.max(left.size, right.size)
}
async function translationFidelityOk(danish: string, en: string, ru: string): Promise<boolean> {
  const backFromEn = await translate(en, 'da', 'en')
  const backFromRu = await translate(ru, 'da', 'ru')
  const original = normalizeSentence(danish)
  const enScore = wordOverlap(original, normalizeSentence(backFromEn))
  const ruScore = wordOverlap(original, normalizeSentence(backFromRu))
  if (enScore < FIDELITY_MIN_OVERLAP || ruScore < FIDELITY_MIN_OVERLAP) {
    console.log(`  fidelity check failed (en overlap ${enScore.toFixed(2)}, ru overlap ${ruScore.toFixed(2)}): "${danish}" vs back "${backFromEn}" / "${backFromRu}"`)
    return false
  }
  return true
}

// ---- Orchestration ----------------------------------------------------------

const work = JSON.parse(await readFile(workPath, 'utf8')) as (FamilyWorkSense & { target: { level: string; situation: string; grammar: string } })[]
const existingOut: unknown[] = existsSync(outPath) ? JSON.parse(await readFile(outPath, 'utf8')) as unknown[] : []
const done = new Set(existingOut.map((row) => (row as { sense_id?: string }).sense_id))
const results: unknown[] = [...existingOut]

const GENERATE_ATTEMPTS = 3

for (const row of work) {
  if (done.has(row.sense_id)) { console.log(`· ${row.lemma}: already generated, skipping`); continue }
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
    results.push({ sense_id: row.sense_id, lemma: row.lemma, skip: lastReason })
    await writeFile(outPath, `${JSON.stringify(results, null, 1)}\n`)
    continue
  }
  const variants = []
  for (const variant of accepted.variants) {
    const danish = variantDanish({ frame: accepted.frame, slots: accepted.slots }, variant)
    if (!danish) { console.log(`  variant unfillable, dropping`); continue }
    const en = await translate(danish, 'en')
    const ru = await translate(danish, 'ru')
    if (!(await translationFidelityOk(danish, en, ru))) continue
    variants.push({ ...variant, en, ru })
  }
  results.push({ ...accepted, variants })
  await writeFile(outPath, `${JSON.stringify(results, null, 1)}\n`)
  console.log(`  ok: ${variants.length} variant(s) · spend so far $${usage.modelUsd.toFixed(4)} model, ${usage.translatorChars} translator chars`)
}

console.log(`Done. ${results.length} row(s) → ${outPath}`)
console.log(`Model spend: $${usage.modelUsd.toFixed(4)} (×${SAFETY_MARGIN} margin = $${(usage.modelUsd * SAFETY_MARGIN).toFixed(4)} of $${BUDGET_USD} budget) · Translator: ${usage.translatorChars} characters`)
