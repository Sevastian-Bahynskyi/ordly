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
| C2 | English wording for every catalog sense (`catalog/locale-en.json`, 3,872 + 57 pilot) | done; DB: statements 1–5 of 20 loaded, 6–20 loading |
| C3 | sentence-family contract, gate, tables (migrations `20260924213748`, `20260924215731`, applied) | done |
| C4 | family pilot round 1 audited **67.9% — STOP** (`catalog/families/audit/tally-925.md`); contract rewritten; round 2 (batches 0020, 0060, 0085) writing, then full audit | in progress |
| C5 | database load: repairs done; locale partly; families and expansion pending | in progress |
| C6 | Practice uses catalog contexts, with accepted gap answers | done |
| C7 | expansion wave 1 (1,322 headwords, ranks ≤ 4,300) and wave 2 (781, ranks 4,301–5,100): Russian rows being written; then English pass (`write-locale-work.ts --out … --skip …/needs_review.jsonl`), gate quarantine, import | in progress |
| C8 | final audit, published report, docs, review | pending |

**Interrupted 2026-09-24 by the weekly usage limit** and resumed after it reset. To resume
again: check which `catalog/*/out/batch-*.json` files exist against each `prompts/index.json`
(or `families/work/`), and regenerate the locale SQL with
`import-catalog-locale.ts catalog/locale-en.json --sql-dir <dir> --chunk 200`; the statements
are idempotent, so re-running a loaded one is harmless.

### Loading data

The database write path for this pass is the Supabase MCP `execute_sql` tool with statements
written by the import scripts' `--sql-dir` mode (the linked `supabase` CLI that
`scripts/catalog-db.ts` uses is not available in the cloud session). A temporary token-gated edge
function `catalog-import` was deployed and immediately retired (it now answers 410 to everything
and requires a JWT); it never ran a query.

### Repairs to the existing catalog

Found by the English pass (flags) and applied to `catalog/out`, the English files and the database:

- `rute` sense 2 "оконная рама" removed: its example (`revne i ruten`) is the word `rude`.
- `hjørne` sense 2 "перекресток" removed: a mislabelled duplicate of sense 1 "угол".
- `udvalg` split: sense 1 "комитет", new sense 2 "выбор, ассортимент".
- `udtalelse` sense 2 "произношение" removed (that is `udtale`); `sær` sense 2 "своеобразный" removed (inverts the meaning). Found by the family pilot audit.
- Kept after review: `svenske` "зеленушка" (the second audit of issue #6 restored it deliberately).

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
