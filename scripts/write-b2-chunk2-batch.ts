/**
 * Phase 4, chunk 1 (issue #16): the B2 grammar cells that had ZERO families after the pilot —
 * noun-indefinite, verb-future, sentence-adverbs, prepositions-other, adverbs, noun-meaning —
 * paired with B2 situations still below the 3-family density threshold, verified against a live
 * coverage recompute (docs/content-coverage-report.md, 2026-09-25, 68/147 cells) before this file
 * was written. particle-verbs and fixed-expressions are NOT targeted here: the catalog has zero
 * phrase-kind headwords (word_catalog kind='phrase' count = 0), and no single-word catalog sense
 * cleanly demonstrates either grammar cell without conflating it with an unrelated sense — a real
 * gap, reported rather than forced.
 *
 *   pnpm exec tsx scripts/write-b2-chunk2-batch.ts --fullforms <ddo-fullforms.csv> --out <path>
 */
import { readFile, writeFile } from 'node:fs/promises'
import { minLevelForRank, type FamilyWorkSense } from '../lib/catalog-families'
import { senseId } from '../lib/catalog-import'
import { formsOf, parseFullForms } from '../lib/ddo-fullform'

const argv = process.argv.slice(2)
const option = (flag: string): string | null => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null)
const fullFormsPath = option('--fullforms')
const outPath = option('--out') || 'catalog/families/work/batch-0101.json'
if (!fullFormsPath) {
  console.error('Usage: write-b2-chunk2-batch.ts --fullforms <ddo-fullforms.csv> [--out path]')
  process.exit(1)
}

const index = parseFullForms(await readFile(fullFormsPath, 'utf8'))

interface Target {
  lemma: string
  pos: 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition'
  gender: 'en' | 'et' | null
  freq_rank: number
  ordinal: number
  ru: string
  en: string
  situation: string
  grammar: string
  note?: string
}

// Senses and (situation, grammar) cells from a live query of word_catalog_sense / word_catalog /
// catalog_sentence_family, restricted to sense_id with 0 existing families (2026-09-25). Every
// ru/en wording and freq_rank is copied verbatim from that query, not invented.
const targets: Target[] = [
  { lemma: 'menneske', pos: 'noun', gender: 'et', freq_rank: 121, ordinal: 1, ru: 'человек', en: 'person, human being', situation: 'body-health', grammar: 'noun-indefinite',
    note: 'Two earlier attempts both failed. First: "et menneske" was used as the target — that is two words, not a verified form; the article goes in fixed frame text directly before {target} instead. Second: "menneske" (singular, generic) and "mennesker" (plural, generic) ended up meaning the same thing in a generic statement like "a human/humans need(s) sleep" — Translator collapsed them to identical English. Add a REAL varying slot (a different context/reason each variant) instead of relying on singular-vs-plural alone for variety, the same way "kommune" and "minut" succeeded elsewhere in this batch.' },
  { lemma: 'kommune', pos: 'noun', gender: 'en', freq_rank: 115, ordinal: 1, ru: 'коммуна, муниципалитет', en: 'municipality', situation: 'work', grammar: 'noun-indefinite' },
  // Swap 2026-09-25: 'folk' gave up 3/3 — likely because "folk" (people) doesn't distinguish
  // singular/plural in this sense, leaving no safe way to vary the target. 'minut' has a normal
  // singular/plural pair (minut/minutter).
  { lemma: 'minut', pos: 'noun', gender: 'et', freq_rank: 128, ordinal: 1, ru: 'минута', en: 'minute', situation: 'education', grammar: 'noun-indefinite' },

  { lemma: 'vise', pos: 'verb', gender: null, freq_rank: 102, ordinal: 2, ru: 'оказываться, проявляться', en: 'to turn out, to prove (to be)', situation: 'feelings-opinions', grammar: 'verb-future' },
  { lemma: 'bruge', pos: 'verb', gender: null, freq_rank: 100, ordinal: 1, ru: 'использовать', en: 'to use', situation: 'communication-media', grammar: 'verb-future',
    note: 'Three issues in previous attempts: (1) "vil bruge" / "skal bruge" was used as the target — that is two words, not a verified form; target must be exactly "bruge" (the bare infinitive), with "vil"/"skal" as fixed frame text immediately BEFORE {target}. (2) the accepted reply used "bruger" (present) and "brugte" (past) — neither is future tense, so the family did not actually belong in "verb-future". (3) the next attempt varied only "vil" vs "skal" as a slot — both translate to the same English "will", so the two variants ended up meaning the same thing. Use "vil" (or "skal") consistently as fixed frame text, and instead add a real varying slot for something else — a different purpose/object — the way "holde" (elsewhere in this batch) varied its object across variants.' },
  { lemma: 'holde', pos: 'verb', gender: null, freq_rank: 104, ordinal: 2, ru: 'проводить, устраивать', en: 'to hold, to throw (an event)', situation: 'abstract', grammar: 'verb-future',
    note: 'Previous attempt used "vil holde" as the target — that is two words, not a verified form. target must be exactly "holde" (the bare infinitive); "vil" is fixed frame text placed immediately BEFORE {target}, e.g. "Næste år vil kommunen {target} en konference..." with target "holde", never inside target itself.' },
  // Rubric audit repair 2026-09-25: the accepted reply used "sætte" (bare infinitive) as the
  // finite verb with no auxiliary at all in one variant — ungrammatical — and neither variant was
  // actually future tense (both present/past), so the family was filed under the wrong cell too.
  { lemma: 'sætte', pos: 'verb', gender: null, freq_rank: 103, ordinal: 3, ru: 'устанавливать, назначать', en: 'to set, to establish', situation: 'body-health', grammar: 'verb-future',
    note: 'Previous attempt used "sætter" (present) and bare "sætte" with no auxiliary — the second is ungrammatical (a bare infinitive cannot be a main-clause verb) and neither is future tense. Every variant must genuinely be future tense: "vil"/"skal" as fixed frame text immediately before {target}, with target the bare infinitive "sætte", e.g. "Lægen vil {target} en diagnose efter prøverne."' },

  // Rubric audit repair 2026-09-25: all 3 variants placed "dog" between the subject and the verb
  // ("Patienten dog nægtede...") — Danish sentence adverbs go after the finite verb (rule 17).
  { lemma: 'dog', pos: 'adverb', gender: null, freq_rank: 113, ordinal: 1, ru: 'однако, всё же', en: 'though, still (however)', situation: 'body-health', grammar: 'sentence-adverbs',
    note: 'Previous attempt placed "dog" between the subject and the finite verb ("Patienten dog nægtede...") — wrong. A Danish sentence adverb goes AFTER the finite verb: "Patienten nægtede dog at tage medicinen." (verb "nægtede", then "dog"). Every variant must follow this order.' },
  { lemma: 'derfor', pos: 'adverb', gender: null, freq_rank: 90, ordinal: 1, ru: 'поэтому', en: 'therefore, that is why', situation: 'work', grammar: 'sentence-adverbs' },
  // Rubric audit repair 2026-09-25: same word-order defect as "dog" above — "Eleverne nok
  // afleverer..." puts the adverb before the verb.
  { lemma: 'nok', pos: 'adverb', gender: null, freq_rank: 117, ordinal: 2, ru: 'наверное, пожалуй', en: 'probably', situation: 'education', grammar: 'sentence-adverbs',
    note: 'This adverb does not inflect, so it must keep the exact same spelling "nok" in every variant — add a real varying slot instead of varying the target. Also: previous attempt placed "nok" between the subject and the finite verb ("Eleverne nok afleverer...") — wrong. A Danish sentence adverb goes AFTER the finite verb: "Eleverne afleverer nok opgaven til tiden." (verb "afleverer", then "nok"). If a variant uses a COMPOUND verb (an auxiliary + participle, like "har læst"), do NOT put "nok" after the whole phrase ("har læst nok X") — that reads as "nok" = "enough" (a real ambiguity with this word), not "probably". Put "nok" BETWEEN the auxiliary and the participle instead: "har nok læst" — or simply avoid compound-tense verb options for this slot and use only simple-tense verbs (afleverer, forstår, består...).' },

  { lemma: 'uden', pos: 'preposition', gender: null, freq_rank: 140, ordinal: 1, ru: 'без', en: 'without', situation: 'feelings-opinions', grammar: 'prepositions-other' },
  { lemma: 'ifølge', pos: 'preposition', gender: null, freq_rank: 151, ordinal: 1, ru: 'согласно', en: 'according to', situation: 'communication-media', grammar: 'prepositions-other' },
  { lemma: 'omkring', pos: 'preposition', gender: null, freq_rank: 157, ordinal: 1, ru: 'вокруг', en: 'around', situation: 'abstract', grammar: 'prepositions-other' },

  // Rubric audit repair 2026-09-25: all 3 variants demonstrated the REFLEXIVE-intensifier sense
  // of "selv" ("the doctor himself" / "сам") instead of this sense, which is specifically the
  // concessive "even" (даже) — a wrong-sense finding, not a translation error.
  { lemma: 'selv', pos: 'adverb', gender: null, freq_rank: 86, ordinal: 2, ru: 'даже', en: 'even', situation: 'body-health', grammar: 'adverbs',
    note: 'Previous attempt demonstrated the WRONG sense of "selv": "Lægen kunne selv mærke..." means "the doctor himself could feel..." (reflexive intensifier, "-self"), not this sense. This sense is the concessive "even" — "selv" modifying a noun phrase to mean "even X", e.g. "Selv de mest erfarne læger kan tage fejl." (Even the most experienced doctors can be wrong.) or "Selv en mindre infektion kan være farlig for en svækket patient." (Even a minor infection can be dangerous for a weakened patient.) Every variant must use this concessive "even" reading, not the reflexive one.' },
  // Second swap 2026-09-25: 'sammen' failed twice for two different reasons (first no varying
  // slot, then repeated invented compound nouns like "kundetilfredshedsundersøgelsen" as the
  // collaboration object). 'både' is a simpler adverb less likely to invite jargon compounds.
  // Rubric audit repair: 2 of 3 accepted variants were missing the copula "er" entirely
  // ("Konsulenten både koordinator og sælger." has no verb) — ungrammatical.
  { lemma: 'både', pos: 'adverb', gender: null, freq_rank: 108, ordinal: 1, ru: 'как один, так и другой', en: 'both', situation: 'work', grammar: 'adverbs',
    note: 'Previous attempt dropped the verb: "Konsulenten både koordinator og sælger." has no verb at all and is ungrammatical. "både X og Y" coordinating two noun predicates needs a linking verb (usually "er") between the subject and "både": "Konsulenten er både koordinator og sælger." Every variant needs its verb.' },
  { lemma: 'lige', pos: 'adverb', gender: null, freq_rank: 93, ordinal: 3, ru: 'как раз, именно', en: 'exactly, just', situation: 'education', grammar: 'adverbs' },

  { lemma: 'tale', pos: 'noun', gender: null, freq_rank: 135, ordinal: 2, ru: 'речь, выступление', en: 'speech', situation: 'communication-media', grammar: 'noun-meaning' },
  { lemma: 'verden', pos: 'noun', gender: 'en', freq_rank: 129, ordinal: 1, ru: 'мир', en: 'world', situation: 'abstract', grammar: 'noun-meaning' },
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
console.log(`${rows.length} chunk-2 target rows → ${outPath}`)
