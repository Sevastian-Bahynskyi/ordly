/**
 * Deterministic target batch for the B2 coverage gap (issue #16, spec #12 decision 15).
 *
 * Unlike write-family-work.ts, which hands the generator whichever sense comes next in file
 * order, this script assigns each work row a specific (situation, grammar, level) cell chosen
 * from catalog/benchmark/cefr-matrix.json because the production DB shows it below the 3-family
 * gate threshold, verified against catalog_sentence_family before this file was written
 * (2026-09-25: B2 at 1/289 families, 67/147 matrix cells covered overall). The generator does not
 * choose the cell; it writes a family for the cell it is given, or skips with a reason.
 *
 *   pnpm exec tsx scripts/write-b2-target-batch.ts --fullforms <ddo-fullforms.csv> --out <path>
 */
import { readFile, writeFile } from 'node:fs/promises'
import { minLevelForRank, type FamilyWorkSense } from '../lib/catalog-families'
import { senseId } from '../lib/catalog-import'
import { formsOf, parseFullForms } from '../lib/ddo-fullform'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const fullFormsPath = option('--fullforms')
const outPath = option('--out') || 'catalog/families/work/batch-0100.json'
if (!fullFormsPath) {
  console.error('Usage: write-b2-target-batch.ts --fullforms <ddo-fullforms.csv> [--out path]')
  process.exit(1)
}

const index = parseFullForms(await readFile(fullFormsPath, 'utf8'))

interface Target {
  lemma: string
  pos: 'noun' | 'verb' | 'adjective'
  gender: 'en' | 'et' | null
  freq_rank: number
  ordinal: number
  ru: string
  en: string
  situation: string
  grammar: string
  /** Seeded from attempt 1 (not just on retry) — a targeted correction from the Phase 3 rubric audit. */
  note?: string
}

// Senses and (situation, grammar) cells picked from a live query of word_catalog_sense /
// word_catalog / catalog_sentence_family (deficient-B2-cell candidates, 2026-09-25). Every ru/en
// wording and freq_rank below is copied verbatim from that query, not invented.
const targets: Target[] = [
  // Rerun 2026-09-25: replaces 'gøre' (work/verb-present), which was skipped twice after
  // repeatedly producing duplicate-meaning variants for this cell. 'arbejde' fits the "work"
  // situation more directly and gives the model a natural varying slot (who/what one works on).
  { lemma: 'arbejde', pos: 'verb', gender: null, freq_rank: 169, ordinal: 1, ru: 'работать', en: 'to work', situation: 'work', grammar: 'verb-present' },
  { lemma: 'eksempel', pos: 'noun', gender: 'et', freq_rank: 127, ordinal: 1, ru: 'пример', en: 'example', situation: 'education', grammar: 'noun-definite' },
  // Rerun 2026-09-25, rubric audit repair: variant 1 used "skal" (plain "must"), which teaches a
  // different modal nuance than this sense (reported past obligation) actually is.
  // Rerun 2026-09-25, second repair round: the earlier fix corrected the sense (skulle, not
  // skal) but the frame itself was ungrammatical — "Ifølge den nye lov {subject} {target}..."
  // put the subject before the verb after a fronted prepositional phrase, a V2 violation
  // (rule 10). A formal seeded audit caught this; the earlier manual re-read missed it.
  { lemma: 'skulle', pos: 'verb', gender: null, freq_rank: 24, ordinal: 1, ru: 'должен был, следовало', en: 'should, to be supposed to', situation: 'society', grammar: 'modal-verbs',
    note: 'This sense means specifically "should have / was supposed to" (reported past obligation), not plain "must". Use "skulle" as the target in every variant — never "skal". Since the target form must stay the same, add a real varying slot (a different subject or obligation) for the 2+ variants, per rule 11. Also: whatever precedes {subject} in the frame (e.g. "Ifølge den nye lov") is a fronted phrase, not the subject — the verb ({target}, or an auxiliary right before it) must come immediately after it, BEFORE {subject}, per rule 10. "Ifølge den nye lov {subject} {target} have..." is wrong (subject before verb); "Ifølge den nye lov {target} {subject} have..." is correct (verb before subject).' },
  // Rerun 2026-09-25, rubric audit repair: one variant used the figurative "stejlt" ("stejle
  // fronter"), which Azure Translator renders as a literal, non-idiomatic "steeply" in both EN
  // and RU — real Danish, unfaithful translation.
  { lemma: 'sag', pos: 'noun', gender: 'en', freq_rank: 132, ordinal: 1, ru: 'дело, вопрос', en: 'matter, issue', situation: 'abstract', grammar: 'subordinate-clause',
    note: 'Do not use the figurative "stejl/stejlt" (as in "stejle fronter" or "stå stejlt over for hinanden") anywhere in this family — Azure Translator mistranslates it literally ("steeply") into English and Russian, producing a faithful-sounding but wrong translation. Say the parties are entrenched or cannot agree using more literal, directly-translatable words (e.g. "er dybt uenige", "ikke kan nå til enighed", "har modstridende interesser"). Also: keep the target as "sagen" (singular) in every variant — the "subordinate" slot alone already gives 3 genuinely different variants. Do not also switch the target to "sagerne" (plural): the frame\'s fixed trailing text "stadig uafklaret" is the singular predicate-adjective form and does not become "uafklarede" for a plural subject, so a plural target here is a real Danish agreement error, not a safe extra variant.' },
  { lemma: 'blive', pos: 'verb', gender: null, freq_rank: 16, ordinal: 3, ru: 'вспомогательный глагол для образования пассивного залога', en: 'be (helper verb forming the passive)', situation: 'body-health', grammar: 'passive' },
  // Rerun 2026-09-25, third swap: both 'meddele' and 'melde' (communication-media/verb-past)
  // failed 3/3, every time reaching for the same -s passive despite explicit correction — a
  // model bias for this (situation, grammar) pairing, not a property of either sense. 'ringe' is
  // a concrete, everyday action verb with no natural passive/s-form reading to reach for.
  // Rerun 2026-09-25, rubric audit repair: "linjen var optaget" was mistranslated as "the line
  // was taken"/"была принята" instead of the idiomatic "busy"/"занята" — genuine mistranslation.
  { lemma: 'ringe', pos: 'verb', gender: null, freq_rank: 803, ordinal: 1, ru: 'звонить (по телефону, в колокол)', en: 'to call, to ring', situation: 'communication-media', grammar: 'verb-past',
    note: 'Do not use "linjen var optaget" (line was busy) anywhere in this family — Azure Translator mistranslates "optaget" here as "taken"/"принята" instead of "busy"/"занята", a genuine mistranslation. Say the call did not succeed a different, more literally-translatable way (e.g. "ingen svarede", "opkaldet blev ikke besvaret", "der var ingen, der tog telefonen").' },
  { lemma: 'klar', pos: 'adjective', gender: null, freq_rank: 161, ordinal: 2, ru: 'ясный, чёткий', en: 'clear (of sky, thought)', situation: 'feelings-opinions', grammar: 'adjective-meaning' },
  { lemma: 'del', pos: 'noun', gender: 'en', freq_rank: 101, ordinal: 1, ru: 'часть', en: 'part', situation: 'work', grammar: 'noun-plural' },
  { lemma: 'have', pos: 'verb', gender: null, freq_rank: 10, ordinal: 2, ru: 'вспомогательный глагол для образования перфекта', en: 'have (helper verb forming the perfect)', situation: 'education', grammar: 'verb-perfect' },
  { lemma: 'gøre', pos: 'verb', gender: null, freq_rank: 51, ordinal: 2, ru: 'поступать, действовать', en: 'to act, to behave', situation: 'abstract', grammar: 'relative-clause' },
  // Rerun 2026-09-25, rubric audit repair: one variant paired a preterite "da" clause with a
  // present-perfect main clause — a real Danish tense-sequencing error, not a register choice.
  { lemma: 'regering', pos: 'noun', gender: 'en', freq_rank: 130, ordinal: 1, ru: 'правительство', en: 'government', situation: 'society', grammar: 'conjunctions',
    note: 'A "da" clause describes a completed past event, so the main clause after it must be simple/past perfect, not present perfect — never write "Da X skete, har Y ikke gjort Z"; write "Da X skete, havde Y endnu ikke gjort Z" instead, or use a present-compatible conjunction like "mens" or "eftersom" if you want to keep "har".' },
  { lemma: 'få', pos: 'verb', gender: null, freq_rank: 30, ordinal: 1, ru: 'получать', en: 'to get, to receive', situation: 'body-health', grammar: 'verb-meaning' },
]

const rows: (FamilyWorkSense & { target: { level: 'B2'; situation: string; grammar: string }; note?: string })[] = targets.map((t) => ({
  lemma: t.lemma,
  kind: 'word',
  sense_id: senseId(t.lemma, 'word', t.ordinal),
  pos: t.pos,
  gender: t.gender,
  freq_rank: t.freq_rank,
  min_level: minLevelForRank(t.freq_rank),
  ru: t.ru,
  en: t.en,
  forms: [...new Set(formsOf(index, t.lemma, t.pos))].sort(),
  target: { level: 'B2', situation: t.situation, grammar: t.grammar },
  ...(t.note ? { note: t.note } : {}),
}))

for (const row of rows) if (!row.forms.length) console.error(`WARNING: no verified forms found for ${row.lemma} (${row.pos}) — check spelling/pos`)

await writeFile(outPath, `${JSON.stringify(rows, null, 1)}\n`)
console.log(`${rows.length} B2 target rows → ${outPath}`)
