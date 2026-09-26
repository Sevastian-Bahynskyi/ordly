# Populating reusable Danish content through B2 (issue #16)

Runbook and progress log. The spec is issue #12 (decisions 10, 14, 15, 16); the ticket is #16.
The catalog build it extends is `docs/catalog-build.md`.

## Resume here

Work is committed in chunks on the working branch. To continue after an interruption:

1. Read the **Progress** table below; the first row not marked done is next.
2. Source files that are not committed (licence terms or size) are re-downloaded with the
   commands under **Sources**. Nothing else lives outside the repository.
3. Every generation pass is resumable: its checker reports `pending` for batches with no reply
   yet, and writing a missing reply is the only step needed.

## Progress

| chunk | what | state |
|---|---|---|
| C0 | this plan and log | done |
| C1 | coverage benchmark: frozen unseen set, A1–B2 matrix, `scripts/coverage-report.ts` | done; report regenerated at the end |
| C2 | English wording for every catalog sense (`catalog/locale-en.json`, 3,872 + 57 pilot) | done; loaded (5,990 en = 5,990 ru senses after C7) |
| C3 | sentence-family contract, gate, tables (migrations `20260924213748`, `20260924215731`, applied) | done |
| C4 | families: round 1 audited 67.9% (seed 925), round 2 80.7% (seed 926) — both STOP. Round 3 adds an independent reviewer (`catalog/families/REVIEW.md`) after the writer: 249/250 clean (seed 927), 8 batches approved, 289 families / 867 sentences loaded | done; scale-up in C9 |
| C5 | database load: repairs, English wording, expansion entries/senses/forms, approved families (snapshot `e5c2ac5e`) | done; re-run per family wave |
| C6 | Practice uses catalog contexts, with accepted gap answers | done |
| C7 | expansion wave 1 (1,322 headwords, ranks ≤ 4,300) and wave 2 (781, ranks 4,301–5,100): 1,995 accepted (108 quarantined), 2,061 senses in Russian and English, 8,792 COR forms for 1,943 words (52 have no COR paradigm) | done; loaded |
| C9 | families for every remaining catalog batch (0004–0098) and the expansion (`catalog/expansion/families`, 52 batches) | superseded by C10: coverage-driven batches replaced sequential catalog batches |
| C10 | coverage-driven families (0100–0109) from plans naming each sense and matrix cell (`catalog/families/plans`, `scripts/write-target-family-work.ts`): DeepSeek writer → gate → DeepSeek review → full read → seeded audit → `--approve` | done; 461 families / 1,362 sentences; 147/147 matrix cells |
| C11 | phrases (`catalog/phrases/README.md`): rights-cleared inventory, 129 phrases / 141 senses in both languages, 32 phrase families | done |
| C8 | final audit, published report, docs, load | done 2026-09-25 (see **Acceptance evidence**) |
| C12 | audio: DDO website recordings moved to `legacy/ddo/`, Azure Speech recordings for every word and phrase | done 2026-09-25 |
| C13 | Ukrainian (issue #24): wording for every sense, example and family sentence translations, seeded audit, load | done 2026-09-26 (see **Ukrainian**) |

## Acceptance evidence (2026-09-25)

Production (`pxnudtcqlmyaelfrdyfp`) after the load, read back with `supabase db query --linked`:
5,063 catalog entries (129 phrases), 6,131 Russian = 6,131 English senses, 461 families /
1,362 sentences (32 phrase families) in one snapshot (`ca4f6225b2bfa6a4`), 0 orphan families,
0 variants missing a language, 0 duplicate ids. The load is additive: phrase entries, English
wording and family chunks upsert; the family cleanup removed 0 rows, because every family of the
previous snapshot (`e5c2ac5e`, commit `53ac2c0`) is in the new one. The same SQL was run twice on a
disposable local stack with every migration applied first: identical counts, no duplicates.

| criterion | evidence |
|---|---|
| EN/RU support for headwords, senses, phrases, forms, families; in Material and Practice | counts above; `docs/content-coverage-report.md`; local app journey below |
| deterministic, rights-cleared source stage with provenance | COR (CC0), DSL Open lists, Danish FrameNet (notice in `catalog/phrases/NOTICE.md`), Wikidata (CC0); every phrase carries its source records; forms and genders only from COR/DDO |
| audio / DDO website material rights check | DDO website recordings retired: moved to `word-audio/legacy/ddo/` (2,986 objects, bytes verified) and replaced by Azure Speech recordings for every word and phrase (`scripts/synthesize-audio.ts`, `catalog/speech/manifest.json`); see **Audio** below |
| constrained families, unsupported combinations excluded | explicit variants only (`lib/catalog-families.ts`); gate checks forms, contiguous phrase spans, V2 after fronting, the infinitive after `at` and modals, preposition case, adverb order; quarantine in `needs_review.jsonl` |
| offline, versioned, resumable; automated gates + seeded audits; quarantine; idempotent import | per-batch replies, reviews, repairs and verdicts in `catalog/families/audit` and `catalog/phrases/audit`; seeds 300–314 at 100% after repair; import run twice locally without duplicates |
| published report with denominators and limitations | `docs/content-coverage-report.md`: lexical 91.3% (89.2% direct + 2.1% via COR headwords), unseen set 93.0% tokens / 51.9% phrase occurrences, matrix 147/147 |
| quality gate incl. severe-error repair and strata ≥95% | every batch stopped below 95% or on a severe finding and was repaired before approval (full reads, not only samples) |
| save and practise a new item per level band and language | local stack, app at `localhost`: saved `stå op` (English, A1 learner) and `gå ind for` (Russian, B2 learner) from the catalog and practised them, including a typed multi-word gap from a phrase family; `supabase/tests/catalog-contexts.mjs` shows Practice's own context path gives ≥2 catalog sentences for a new phrase and a new word in every band × both languages (16/16) |

**Audio (2026-09-25).** The catalog's recordings had been fetched from the ordnet.dk website
(issue #6), and no rights check for them was ever recorded. They are now retired: copied to
`word-audio/legacy/ddo/` (`catalog/legacy/ddo-audio-keys.json`), verified by count and total
bytes, and no longer referenced by any row. Every catalog word and phrase and every saved word or
phrase has an Azure Speech recording instead (Danish neural voice, checked by Danish speech
recognition; see AGENTS.md §23). Remaining DDO-website-derived data: the IPA transcriptions in
`catalog/ddo-ipa.json` from which the Cyrillic pronunciation hints were derived (issue #6). They
are short phonetic facts rather than recordings, but they came from the same website and have the
same missing rights check.

**Known limits.** The round-trip translation check rejects some correct modal constructions
(`være nødt til`, `kommer til at`, `have lyst til`), so they are skipped rather than published;
phrase coverage counts contiguous occurrences only, and its denominator is the inventory's recall;
the DeepSeek reviewer is noisy (it contradicts earlier fixes), so every published sentence was
also read in full.

**Interrupted 2026-09-24 by the weekly usage limit** and resumed after it reset. To resume
again: check which `catalog/*/out/batch-*.json` files exist against each `prompts/index.json`
(or `families/work/`), and regenerate the locale SQL with
`import-catalog-locale.ts catalog/locale-en.json --sql-dir <dir> --chunk 200`; the statements
are idempotent, so re-running a loaded one is harmless.

### Loading data

The database write path for this pass is the Supabase MCP `execute_sql` tool with statements
written by the import scripts' `--sql-dir` mode. Large loads do not travel through the tool call:
the statement files are committed under `catalog/load/`, pushed, fetched by the database with
`net.http_get` (pg_net, already installed) from `raw.githubusercontent.com` **at that commit's
SHA**, matched to the local `md5sum` of each file, and executed in path order inside one `do`
block per step (entries and senses → English wording → forms). The files are deleted in the next
commit; the history keeps them. First used at `633d47d` (56 statements) (the linked `supabase` CLI that
`scripts/catalog-db.ts` uses is not available in the cloud session). A temporary token-gated edge
function `catalog-import` was deployed and immediately retired (it now answers 410 to everything
and requires a JWT); it never ran a query.

The 2026-09-25 load ran from a local machine where the CLI is linked: each `--sql-dir` statement
file through `supabase db query --linked`, after the same files had run twice on a disposable
local stack (a scratch `supabase start` with every migration applied).

### Repairs to the existing catalog

Found by the English pass (flags) and applied to `catalog/out`, the English files and the database:

- `rute` sense 2 "оконная рама" removed: its example (`revne i ruten`) is the word `rude`.
- `hjørne` sense 2 "перекресток" removed: a mislabelled duplicate of sense 1 "угол".
- `udvalg` split: sense 1 "комитет", new sense 2 "выбор, ассортимент".
- `udtalelse` sense 2 "произношение" removed (that is `udtale`); `sær` sense 2 "своеобразный" removed (inverts the meaning). Found by the family pilot audit.
- Kept after review: `svenske` "зеленушка" (the second audit of issue #6 restored it deliberately).

### Family pipeline (from round 3)

1. `write-family-work.ts` → `work/batch-NNNN.json` (expansion: `--target catalog/expansion/families/work`).
2. A writer produces `out/batch-NNNN.json` under `README.md` and runs the gate with `--only`.
3. An independent reviewer applies `REVIEW.md` in place and logs every change in `review/batch-NNNN.json`.
4. The gate again; then `check-family-batches.ts --only a,b,… --candidates <pool>` and
   `audit-families.ts --sample --seed N --published <pool>`; an auditor fills `verdicts-N.json`.
5. `--tally N`; every finding repaired in the reply; `--approve N` pins each sampled reply's sha1
   in `audit/passed.json`. `--merge` publishes approved replies only; an edited reply drops out
   until an audit covers it again.

## Ukrainian (issue #24, 2026-09-26)

Ukrainian is a full learner language (AGENTS.md §26). Pipeline and evidence:

```
pnpm exec tsx scripts/write-locale-work.ts --lang uk --from-db --target catalog/locale-uk/work   # 6,131 senses, 123 batches
pnpm exec tsx --env-file=.env.corpus.local scripts/generate-locale-batch.ts --lang uk --workers 8
pnpm exec tsx --env-file=.env.corpus.local scripts/generate-locale-batch.ts --lang uk --repair
pnpm exec tsx scripts/check-locale-batches.ts --lang uk --root catalog/locale-uk --merge   # → catalog/locale-uk.json
pnpm exec tsx --env-file=.env.corpus.local scripts/translate-families.ts                   # → catalog/families/translations-uk.json
pnpm exec tsx scripts/audit-locale.ts --draw --seed 2401 --size 240 && … --tally 2401
pnpm exec tsx scripts/import-catalog-locale.ts catalog/locale-uk.json --sql-dir <dir> --chunk 200
pnpm exec tsx scripts/import-catalog-families.ts --sql-dir <dir>   # merges the overlay
```

- **Gate.** 123/123 batches clean; 21 had flagged rows after the first run (the reviewer skipped a
  sentence, or a dictionary gap), 18 fixed by `--repair`, 3 by hand; one family sentence accepted
  by hand (`catalog/locale-uk/REPAIRS.md`).
- **Language check** (`scripts/measure-ukrainian-check.ts`): every Ukrainian wording (5,868 unique),
  example (6,013) and family sentence (1,358) accepted; filed as Ukrainian, 88.4% of the Russian
  wordings, 99.8% of Russian examples and 99.5% of Russian family sentences are rejected. The rest
  are spelled identically in both languages (`завтра`, `адвокат`, `альбом`).
- **Audit** (seed 2401, 240 items, every stratum read, `catalog/locale-uk/audit/report-2401.md`):
  98.3% clean overall (±1.6), no unresolved severe finding; 4 findings, all repaired before loading.
- **Load** (production, `supabase db query --linked`, after the same SQL ran twice on a local stack
  holding a copy of the production catalog): 6,131 uk = 6,131 en = 6,131 ru senses, 6,094 uk example
  translations (= en), 1,362/1,362 family sentences with `translations.uk`, one snapshot
  (`ca4f6225b2bfa6a4`, cleanup removed 0), 0 duplicate rows.
  `supabase/tests/catalog-contexts.mjs` passes 24/24 (every band × en/ru/uk × word/phrase) locally.
- **Spend** (then a local log, `catalog/families/azure-usage.json`; now the committed opening balance in
  `catalog/ledger/opening.json`, list price): DeepSeek $3.70 for this issue ($9.14 cumulative); Azure
  Translator 477,064 characters for this issue (≈$4.77; 641,968 cumulative, ≈$6.42); Azure Speech not
  used.

## Baseline (2026-09-24)

- Catalog: 2,939 entries, 3,932 senses, all Russian; 57 English pilot senses (issue #14).
- Weighted lemma coverage of DSL `freq-30k-ex` (eligible classes NC V A D T P C L I, lemma
  string match): **86.96%**; with the word-class check the report uses: **86.0%**. The full top 3,000 would be 89.46%; top 4,000 91.57%; top 5,000
  93.02%. The shortfall below the top 3,000 is the 61 source rows pruned by the gate.

## Sources

Downloaded into the session scratchpad, not committed (the COR/DSL precedent in
`docs/catalog-build.md`: the dataset stays at its source, the repository keeps what was derived):

```
curl -LO https://korpus.dsl.dk/download/freq-lemma.zip     # DSL Open; freq-30k-ex.txt
curl -LO https://korpus.dsl.dk/download/ddo-fullform.zip   # DSL Open; ddo-fullforms_251126.csv
curl -LO https://ordregister.dk/files/cor1.5.1.0.tsv          # COR, CC0; export CATALOG_COR_TSV=<path>
curl -LO https://downloads.tatoeba.org/exports/per_language/dan/dan_sentences.tsv.bz2   # CC BY 2.0 FR
```

Terms checked 2026-09-24: DSL Open permits use and derived works with attribution, excluding a
competing dictionary product; Tatoeba sentences are CC BY 2.0 FR with per-sentence attribution by
id. DDO website examples and audio are **not** covered by DSL Open and are not copied into any new
asset in this pass.

## Corpus expansion pipeline (issue #27)

The pipeline for #28 (phrases), #29 (words) and #30 (sentences and their audio). It runs the stages
above for one batch with one command and accounts for every dollar. Nothing here runs in the app
(AGENTS.md §27).

### Spend ledger

Committed, in `catalog/ledger/`, with no keys and no learner data:

| file | holds |
|---|---|
| `budget.json` | the program: $170 for #27, #28, #29, #30 and #17 together (revised 2026-09-26 from $120), the services it pays for (DeepSeek and Translator; Speech is refused), the planned split per issue, and every transfer between issues with its reason |
| `opening.json` | what #16 and #24 spent before the program ($14.87 and $8.47 at list price), rebuilt once from the old local per-call log with `content-ledger.ts --opening` |
| `runs/*.json` | one record per process that made a paid call: issue, batch, command, the estimate it started from, and per op, model and unit scope the calls, tokens, characters, audio seconds and list price |
| `profile.json` | what one unit (an entry, a family) costs per op, measured on a calibration batch; the estimates scale it |

Every paid call goes through `scripts/spend-ledger.ts` (`azure-corpus.ts` for DeepSeek and
Translator, `speech-clip.ts` for Speech). It is priced at the list prices in `lib/content-ledger.ts`
(DeepSeek-V4-Pro on Azure AI Foundry $1.74 / $3.48 per million input / output tokens, Translator
$10 per million characters, neural speech $15 per million characters, recognition and
pronunciation assessment $1 per audio hour; free-tier allowances ignored). **A paid call needs an
issue**: `CONTENT_ISSUE=<n>` in the environment (the batch command sets it from `batch.json`), or
the call is refused before it is made. Every stage script (`generate-family-batch.ts`,
`generate-locale-batch.ts`, `synthesize-audio.ts`, …) records the same way, so a hand-run stage
is accounted for too:

```
CONTENT_ISSUE=30 pnpm exec tsx --env-file=.env.corpus.local scripts/synthesize-audio.ts --synthesize
```

Report and transfers (no paid call):

```
pnpm exec tsx scripts/content-ledger.ts             # per service, per issue, against $170
pnpm exec tsx scripts/content-ledger.ts --batches   # each batch's estimate against its actual spend
pnpm exec tsx scripts/content-ledger.ts --transfer --from 30 --to 28 --usd 2 --note "why"
```

### Budget rule

- **$170, DeepSeek and Translator only.** Split: #27 $3, #28 $10, #29 $12, #30 $110, #17 and
  reserve $35. Azure Speech is not paid for: a batch with `"audio": true` refuses to start, and any
  Speech call stops the run. The calibration's $0.02 of Speech predates this rule.
- **The ledger errs high.** It records list price. The Azure bill for September 2026 showed about
  DKK 39 (≈ $5.7) for DeepSeek, against $9.49 in the ledger, and Translator below the charts (its
  free tier). Compare the bill with the ledger once after each issue's first large batch; if the
  bill ever runs above the ledger, stop and re-estimate.
- Before a run: its estimate (`--estimate`) must fit what is left of **its issue's allocation**
  (plan plus transfers) **and of the program**; otherwise the run refuses to start. Move money
  between issues only with a recorded transfer.
- During a run: before every paid call, the process stops when that call could take its issue's
  allocation or the program past its limit (it keeps $0.05 of room, more than any single call
  costs), or when the run reaches its cap (twice its estimate, at least $0.25 over it; child
  processes such as the family generator get what is left of it). Other runs' spend is re-read
  every minute. A stage script run by hand has no estimate of its own: estimate its batch with
  `content-batch.ts --estimate` first, or give it a cap with `CONTENT_RUN_CAP_USD`.
- After a run: nothing to do by hand; the run record is the actual spend. Commit it with the batch.
- Stop and ask before a run would take cumulative program spend past $170.

### One batch

A batch is a directory `catalog/pipeline/<name>/` with `batch.json`: the issue, the units, whether
to record audio, and the audit's seed and size. Units are **entries** (a headword or phrase with
verified forms; DeepSeek writes one to three meanings in Russian, English and Ukrainian and one
Danish example each) and **families** (a sense and a matrix cell, written by
`generate-family-batch.ts`). Items are every meaning, every example and every family sentence.

```
pnpm exec tsx scripts/content-batch.ts --batch catalog/pipeline/<name> --estimate           # dry run: cost against what is left
pnpm exec tsx --env-file=.env.corpus.local scripts/content-batch.ts --batch catalog/pipeline/<name>
pnpm exec tsx --env-file=.env.corpus.local scripts/content-batch.ts --batch catalog/pipeline/<name> --load
```

Stages, each writing its result into the batch directory and skipping what is already there, so
the same command resumes after any stop without paying twice:

1. **Estimate** against the ledger; refuse if it does not fit.
2. **Generate**: entries (`entries.json`), families (`families/out/`, via the family generator).
3. **Translate and back-translate**: every Danish sentence into English, Russian and Ukrainian
   (Azure Translator); the English back into Danish. Translations are cached, so a retry is free.
4. **Reviews** (`reviews.json`): every item by two DeepSeek reviewers with different instructions
   and no shared context (A: a linguist's rubric; B: reads the Danish alone first, then compares its
   reading with the item). Where they disagree, an adjudicator sees both verdicts and decides. Every
   sentence also gets the **back-translation check**: a reviewer compares the original Danish with
   the round trip through English; drift rejects the item. A reply that is not the promised JSON or
   leaves items out is asked again for the missing items; an item still without a verdict is
   quarantined as unresolved. (`lib/content-review.ts`, tested offline on recorded replies.)
5. **Gate**: only what the reviews passed. Entries: `lib/content-gate.ts` (script and language of
   each wording, Ukrainian check, one verified form in the example, spelling, translations present,
   no two senses worded alike). Families: `validateFamily` (the family gate) plus the Ukrainian
   check. Everything rejected, at any stage, goes to `needs_review.jsonl` with its reasons.
6. **Audio** (only when `audio` is set, which the current budget refuses): the headword of every entry and every family sentence, with
   the speech-recognition check of `synthesize-audio.ts` — a clip not heard as written is made
   again with the second voice, and one still not matching is judged by DeepSeek (`audio.json`).
   A clip judged a `problem` is counted in the report and must not be uploaded; uploading sentence
   audio is #30's, which reads `audio.json`.
7. **Report** (`report.json`): items generated and passed per kind, disagreement rate,
   adjudications, back-translation drift, audio checks, and cost against the estimate, per item.
8. **Audit**: a seeded sample of passed items (`audit-sample.md`, verdicts in `audit.json`). The
   run stops until every verdict is set; the batch passes at ≥95% clean with no severe finding.
9. **Load** (`--load`, after the audit passed): families into `publish/families.jsonl` and
   `publish/translations-uk.json` — `import-catalog-families.ts` loads every pipeline snapshot
   together with `catalog/families/published.jsonl`, so its cleanup never drops another batch —
   and the SQL into `load/` (run each file with `supabase db query --linked`, see **Loading
   data**). Entries into `publish/rows.json` and `publish/locale-{en,uk}.json`, the contracts
   `import-catalog.ts` and `import-catalog-locale.ts` take; a new headword also needs its facts
   (forms, pronunciation), which #28 and #29 derive for their sources. Because the family snapshot
   is every published file together, removing a pipeline batch directory removes its families
   from the database at the next load: never delete a loaded batch.

### Calibration (2026-09-26)

Two batches, run end to end with both reviews, adjudication, back-translation, audio and an audit
(`catalog/pipeline/calibration-000{1,2}/`, `report.json` in each). Entries were phrases from the
#28 inventory pool; families were senses with no family yet (#30 pool). Neither was loaded: both
audits failed, which is the pipeline doing its job.

| | calibration-0001 | calibration-0002 |
|---|---|---|
| units | 8 entries, 12 families | 5 entries, 5 families |
| items reviewed (meaning / example / sentence) | 14 / 14 / 14 | 8 / 8 / 7 |
| passed reviews, back-translation and gate | 6 / 6 / 3 | 2 / 2 / 3 |
| reviewer disagreement | 7 / 42 (16.7%) | 3 / 23 (13.0%) |
| adjudicated → accepted | 7 → 0 | 3 → 2 |
| back-translation drift | 4 / 28 | 0 / 15 |
| audio clips heard as written | 7 / 7 | 5 / 5 (1 on the second voice) |
| audit | 11 / 15 clean, 0 severe — fail | 6 / 7 clean, 1 severe — fail |
| estimate → actual | $0.4384 → $0.3285 (−25.1%, prior profile) | $0.1523 → $0.1485 (**−2.5%**, calibrated profile) |
| cost per item reviewed | $0.0078 | $0.0065 |

- **Estimates.** The first batch was estimated from a prior built from the #16/#24 ledger; the
  profile measured on it (`content-ledger.ts --profile`) then estimated the second, independent
  batch within 2.5%. `catalog/ledger/profile.json` now holds both batches (13 entries, 17
  families), the profile for #28–#30. The first batch's $0.33 includes the back-translation pass
  run twice (its prompt was corrected mid-calibration), so the profile errs slightly high. A batch of 600 families for #27 was refused
  before any call ($12.81 estimated, $2.52 left).
- **Cost per unit** (both batches): an entry ≈ $0.0087 (DeepSeek 67%, Translator 28%, Speech 5%);
  a family ≈ $0.0214 (DeepSeek 77%: the family generator's retries dominate). 600 phrases (#28)
  ≈ $5.2 and 1,000 words (#29) ≈ $8.7 before re-runs, inside their $12 each.
- **Yield, and what it means for #30.** 17 families produced 21 sentences, of which 6 passed:
  about $0.061 per passing sentence, so 20,000 sentences at this yield would cost about $1,200,
  far beyond #30's $78. The losses are real defects the reviews and the gate caught (`en kriser`,
  a past-tense target filed as `verb-present`, "CEO" for *direktør*, families left with one
  variant), plus the family generator's own skips (5 of 12). #30 has to raise the yield (fewer
  generator retries, cheaper sentence sources) or cut the target; stop and ask before planning
  its runs on these numbers.
- **What the audits found that both reviewers let through**: Translator's present simple for a
  plan ("We go to the beach tomorrow"), *ferien* as "праздники/свята", a Russian-style
  instrumental in Ukrainian, and one severe: *Jeg tænker mig at tage tidligt hjem* (intention needs
  *har tænkt mig at*). The adjudicator sided with the rejecting reviewer in 8 of 10 disputes.
- **Back-translation.** Its first prompt asked for the same meaning of every content word and
  flagged plain paraphrase (11/28); it now flags only a changed situation (4/28, all real).

## Phrases (issue #28, 2026-09-26)

**576 new catalog phrases are loaded** (the catalog now holds 705), each with its meanings in
English, Russian and Ukrainian (same sense ids), an example with three translations, a Cyrillic
pronunciation hint, and — for a verb phrase — its recorded forms, split forms included. No audio:
Speech is outside the budget. Audit: `catalog/phrases/audit/expansion-report.md`.

### How the batches ran

```
# labels for the whole inventory (the first 600 were labelled for #16): $0.27
CONTENT_ISSUE=28 CONTENT_RUN_CAP_USD=1 pnpm exec tsx --env-file=.env.corpus.local scripts/classify-phrases.ts --top 2032
# selection, facts (COR forms, IPA) and one batch per 60 phrases
pnpm exec tsx scripts/plan-phrase-batches.ts --kaikki <kaikki.org-dictionary-Danish.jsonl> --count 780 --size 60 --first 2 [--existing]
# each batch: run → full read (corrections.json) → audit → load
pnpm exec tsx --env-file=.env.corpus.local scripts/content-batch.ts --batch catalog/pipeline/phrases-NNNN [--read] [--load]
# forms of the phrases that were already in the catalog
pnpm exec tsx scripts/phrase-forms-sql.ts --sql-dir catalog/phrases/load
```

Each batch's `load/` SQL was run in name order with `supabase db query --linked -f`. The coverage
report was regenerated with COR from `https://ordregister.dk/files/cor1.5.1.0.tsv` (`--cor`).

### What changed in the pipeline, and why

- **Phrase pronunciation.** No source transcribes a phrase, so its IPA is Wiktionary's for the whole
  phrase (9 phrases) or each word's recorded IPA joined (`ipa_source = 'components'`). 255 inventory
  units were passed over because a word has no recorded IPA. DeepSeek writes the sounds; the stress
  is a rule (`phraseStressIndex`, `placePhraseStress`), because in calibration the model copied every
  word's citation stress (`gå med` → «го́ мэ»).
- **Hints are not model-reviewed.** In calibration both reviewers rejected 22 of 25 hints, mostly for
  disputing the given stress or asking for sounds Cyrillic cannot write (æ, stød); the rejection then
  took the phrase's good meanings with it. A hint is checked by the gate (Cyrillic only, one word per
  word, one stress on the right word) and read in full; the audit samples it as its own stratum.
- **One repair round** (`repairPass`, `lib/content-review.ts`). Rejected items go back with the named
  defects and return with new wording, new translations of the same Danish, or a new hint — or are
  dropped; a repaired item is reviewed again by both reviewers. With the hint rejections no longer
  cascading, it took the calibration batch from 2 to 24 of 36 meanings passing. The Danish of an example is never rewritten by a repair.
- **Full read before the audit** (`corrections.json`, `read.json`). The first audit (77% clean, all
  findings the reviewers had let through) showed a sample could not pass on reviews alone, so every
  item that passes is read and corrected or dropped with a note before the seeded sample is drawn.
  An item that passes after the read (a retried entry) stops the run until it is read (`--read`).
- The translation cache is written atomically (`scripts/azure-corpus.ts`): three batches in
  parallel once read it half-written and crashed a run.

### Spend

| | estimate | actual |
|---|---|---|
| labels (1,432 phrases) | — | $0.27 |
| calibration phrases-0001 (30 phrases, incl. two restarted runs) | $0.25 | $0.55 |
| phrases-0002 … 0014 (780 phrases) | $5.99 | $6.59 |
| **#28 total** | | **$7.40 of $10.00** (DeepSeek ≈ $6.00, Translator ≈ $1.42) |

≈ $0.013 per loaded phrase. The profile was re-measured on phrases-0002 (`profile.json`); later batches
ran 0–28% above it, the repair round and generation retries being the variance. The Azure bill was
not compared with the ledger in this session (no billing access); do that before #29's first large batch.

### Coverage

Phrase coverage on the frozen unseen set (reported, not targeted): on the denominator used before
(units among the first 600 labels), **82.2% of 185 occurrences (90 of 115 phrases)**, up from 51.9%
(51). With every inventory item labelled, the report's denominator grows to 135 phrases: 78.4% of 208
occurrences (`docs/content-coverage-report.md`). A split verb phrase in running text (`står han op`)
is still not counted.
