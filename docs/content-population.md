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
- **Spend** (local ledger `catalog/families/azure-usage.json`, not committed; list price): DeepSeek $3.70 for this issue
  ($9.14 cumulative); Azure Translator 477,064 characters for this issue (≈$4.77; 641,968 cumulative,
  ≈$6.42); Azure Speech not used. All well under the $70-per-service budget.

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
