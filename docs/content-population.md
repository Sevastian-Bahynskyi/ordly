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
| C1 | coverage benchmark: DSL weighted report, frozen unseen sentence set, A1–B2 matrix | in progress |
| C2 | English wording for every catalog sense (3,875 senses, 60 batches) | in progress |
| C3 | sentence-family contract, validator, tests, migration | pending |
| C4 | family pilot + audit, then full generation | pending |
| C5 | database load for locale, families and new lemmas | pending |
| C6 | Practice uses catalog contexts for saved catalog-backed senses | pending |
| C7 | lexical expansion past rank 3,000 toward ~90% weighted coverage | pending |
| C8 | final audit, published report, docs, review | pending |

## Baseline (2026-09-24)

- Catalog: 2,939 entries, 3,932 senses, all Russian; 57 English pilot senses (issue #14).
- Weighted lemma coverage of DSL `freq-30k-ex` (eligible classes NC V A D T P C L I, lemma
  string match): **86.96%**. The full top 3,000 would be 89.46%; top 4,000 91.57%; top 5,000
  93.02%. The shortfall below the top 3,000 is the 61 source rows pruned by the gate.

## Sources

Downloaded into the session scratchpad, not committed (the COR/DSL precedent in
`docs/catalog-build.md`: the dataset stays at its source, the repository keeps what was derived):

```
curl -LO https://korpus.dsl.dk/download/freq-lemma.zip     # DSL Open; freq-30k-ex.txt
curl -LO https://korpus.dsl.dk/download/ddo-fullform.zip   # DSL Open; ddo-fullforms_251126.csv
curl -LO https://downloads.tatoeba.org/exports/per_language/dan/dan_sentences.tsv.bz2   # CC BY 2.0 FR
```

Terms checked 2026-09-24: DSL Open permits use and derived works with attribution, excluding a
competing dictionary product; Tatoeba sentences are CC BY 2.0 FR with per-sentence attribution by
id. DDO website examples and audio are **not** covered by DSL Open and are not copied into any new
asset in this pass.
