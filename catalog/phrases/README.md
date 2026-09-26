# Catalog phrases (issue #16)

Multi-word catalog entries: particle verbs (`stå op`), reflexive and prepositional verbs
(`glæde sig til`, `stole på`), fixed expressions (`falde i søvn`), time and other adverbials
(`i aftes`, `heller ikke`) and multi-word prepositions (`på grund af`). They are `word_catalog`
rows with `kind = 'phrase'`, which the app already looks up whole (`lib/catalog.ts`), and their
sentence families use a multi-word `target` that Practice gaps as one span (`findInSentence`).

## Provenance: a phrase exists only if a rights-cleared source names it

| source | licence | used for |
|---|---|---|
| Danish FrameNet 1.0 (`framenetdata_1_0.csv`, github.com/dsldk/dansk-frame-net) | Danish FrameNet 1.0 License: use, copy, modify, distribute for any purpose with the notice kept (`NOTICE.md`) | DDO fixed expressions and valency patterns; its core-verb column declares verb phrases |
| Wikidata Lexemes (`sources/wikidata-da-multiword.tsv`, query in its header) | CC0 | Danish lexemes with a space; lexical category declares the class |
| DDO full-form list (`ddo-fullforms_*.csv`) | DSL Open | multi-word headwords (`uden for`, `alle sammen`) and their class; every word of every phrase must be a form DDO knows; head-verb forms |
| DSL `freq-30k-ex` | DSL Open | component frequency rank (tie-break only) |
| Tatoeba Danish (`dan_sentences.tsv`) | CC BY 2.0 FR | attestation **counts only**, frozen benchmark ids excluded; no sentence is copied |

Rejected for this pass: DDO/ordnet.dk website (© DSL, no licence to copy definitions, examples or
audio), COR.SEM.EXT (CC BY-NC-ND), KorpusDK (DSL restricted licence). A model never proposes a
phrase: DeepSeek only labels inventory items, and every stage refuses a phrase not in the inventory.

## Stages

```
# 1. inventory — deterministic, zero tokens
pnpm exec tsx scripts/build-phrase-inventory.ts --framenet framenetdata_1_0.csv \
  --wikidata catalog/phrases/sources/wikidata-da-multiword.tsv --fullforms ddo-fullforms_251126.csv \
  --ranking freq-30k-ex.txt --tatoeba dan_sentences.tsv
# 2. labels — DeepSeek: learnable unit or free combination, type, CEFR level
pnpm exec tsx --env-file=.env.corpus.local scripts/classify-phrases.ts --top 600
# 3. selection — by hand from the labels, into catalog/phrases/pilot.json / chunk-NNNN.json
# 4. senses — DeepSeek writes RU/EN meaning + a Danish example; Translator translates the example
pnpm exec tsx --env-file=.env.corpus.local scripts/generate-phrase-senses.ts --selection <file> --fullforms <csv> --batch N
# 5. gate — the existing catalog gate, facts derived from the inventory
pnpm exec tsx scripts/phrase-facts.ts --rows catalog/phrases/out/batch-0001.json,…
pnpm exec tsx scripts/validate-catalog.ts --facts catalog/phrases/facts.jsonl --input catalog/phrases/out/batch-NNNN.json \
  --sources scripts/phrase-validation-sources.ts --needs-review catalog/phrases/needs_review.jsonl --start <offset> --size <n>
# 6. review — DeepSeek against the rubric; Danish/sense findings regenerate, translation-only findings are repaired if they survive the round trip
pnpm exec tsx --env-file=.env.corpus.local scripts/review-deepseek.ts --phrases catalog/phrases/out/batch-NNNN.json --selection <file> --apply
# 7. audit — an independent read against the full rubric: audit/verdicts-NNNN.json, repairs in audit/repairs-NNNN.json
```

Families for phrase senses go through the ordinary family pipeline:
`scripts/write-target-family-work.ts --plan catalog/phrases/family-plan-NNNN.json --out catalog/families/work/batch-NNNN.json`,
then `generate-family-batch.ts`, `review-deepseek.ts --families`, `check-family-batches.ts`,
`audit-families.ts`.

## Facts derived, never guessed

- Part of speech: the class a source declares (DDO, then Wikidata, then FrameNet's core verb);
  only an unclassified phrase falls back to "a DDO verb lemma first is a verb phrase". The fallback
  alone read `hele tiden` as the verb *hele* "heal" and inflected it into `helede tiden`.
- Forms: the head verb's DDO forms (minus present participles, -s passives of non -s verbs,
  clipped spellings) with the other words fixed; `sig` expanded over `mig dig sig os jer`.
- A phrase has no IPA source, so it has no pronunciation and no audio (docs/catalog-build.md).
- Out of scope: phrases carrying an open-argument placeholder (`nogen`, `noget`, `sin`, a closing
  `en`), and a gap is one contiguous span, so a phrase whose ordinary use splits around its object
  (`holde det ud`) is passed over rather than taught in an unnatural order.

## Expansion (issue #28)

About 600 more phrases, through the corpus expansion pipeline (`scripts/content-batch.ts`, see
`docs/content-population.md`, "Phrases (issue #28)"). What changed from the stages above:

- **Labels for the whole inventory.** `classify-phrases.ts --top 2032` labelled every inventory item
  (the first 600 were labelled for #16); selection still follows attestation and never reads the
  frozen benchmark.
- **Selection and facts**: `scripts/plan-phrase-batches.ts` writes `expansion.jsonl` (every planned
  phrase with its facts) and one pipeline batch per 60 phrases (`catalog/pipeline/phrases-NNNN/`).
- **Forms from COR**, not from the DDO full-form list: the head verb's register paradigm (infinitive,
  present, past, past participle, imperative) with the other words fixed and `sig` expanded, plus a
  **split form** after each finite head (`står … op`, `glæder … mig til`), because a main clause puts
  its subject or an adverb between them. They are loaded into `word_catalog_form` with
  `kind = 'phrase'`, so the composer finds the phrase from any of them and saves the headword, and a
  saved phrase carries them into `word_forms` for Practice. The phrases of the first pass got theirs
  from `forms-existing.jsonl` (`scripts/phrase-forms-sql.ts`).
- **Pronunciation hints.** A phrase has no IPA of its own in any source, so its IPA is Wiktionary's
  for the whole phrase when it has one, and otherwise each word's recorded IPA joined in order
  (`ipa_source = 'components'`: DDO, the word catalog's facts, then Wiktionary when its readings agree).
  A phrase with a word no source transcribes is passed over. DeepSeek writes the Cyrillic sounds;
  the **stress is a rule** (`phraseStressIndex`: a particle verb stresses its particle, a
  prepositional or reflexive verb its verb, anything else its last content word) placed by
  `placePhraseStress` on the syllable that word's IPA stresses, and the gate checks it.
- No audio: Azure Speech is outside the budget.
