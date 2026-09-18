# Building the word catalog

The plan, the measurements behind it and the non-goals are issue #6. This is the runbook: what to
run, in what order, and what each step refuses to do.

The build has three layers and **only the middle one is a model** (issue #6 §3). Layer 1 looks
facts up, layer 2 writes the judgements no source can answer, layer 3 rejects anything that
contradicts layer 1. That is why the generator is swappable and why the quality does not depend on
which model wrote a row.

## What you need first

- **A frequency ranking.** The DSL lemma list (<https://korpus.dsl.dk/resources/details/freq-lemmas.html>)
  is licence-gated: accept the terms and download it yourself. It is never downloaded
  automatically and never committed. Format: `pos<TAB>lemma<TAB>frequency`.
- **The Wiktionary phonetics extract**, once, ~95 MB, not committed:
  `curl -O https://kaikki.org/dictionary/Danish/kaikki.org-dictionary-Danish.jsonl`
- **COR loaded** in the linked project (`scripts/import-cor.ts`). Without it every word fails the
  gate's lemma check, which is the correct behaviour and a useless run.
- **`download_ddo_audio.py` in the repo root**, for step 6.

## Step 0 — measure before spending anything

```
pnpm exec tsx scripts/rank-coverage.ts --ranking ~/Downloads/lemmas.tsv
```

Prints the hit rate of the ranking against the words actually in the vocabulary, at 3k / 5k / 10k
/ 20k. **Choose N from that curve.** Below 60% at the deepest depth the script stops: the value
proposition has changed and the build is not worth paying for.

Multi-word entries are reported separately, never counted as misses. A lemma list contains no
phrases by construction, so scoring `godt lide` against it would measure nothing.

## Step 1 — the facts

```
pnpm exec tsx scripts/build-catalog-facts.ts \
  --ranking ~/Downloads/lemmas.tsv \
  --ipa kaikki.org-dictionary-Danish.jsonl \
  --limit 10000 \
  --phrases catalog/phrases.txt \
  --out catalog/facts.jsonl
```

Zero model tokens. Per lemma: frequency rank, part of speech, gender, definite singular and
indefinite plural (COR), and IPA (Wiktionary, part-of-speech matched).

**Whatever a source cannot settle stays null, and null travels.** `ved` reaches the generator with
no part of speech because the register reads it two ways; a word with no IPA must be generated
with a null pronunciation. The generator may not fill a null (§8 rule 7) and the gate rejects a
row that tried (§9).

## Step 2 — pilot on 100 words

Run steps 3–6 on the first 100 lemmas and read all 100 by hand. A bad prompt found at word 40
costs nothing; found at word 6,000 it costs the run.

## Step 3 — generate

`buildCatalogGeneratorPrompt` in `lib/catalog-contract.ts` is the whole contract: 40 facts in,
a bare JSON array of 40 rows out, same order. Any generator may write it — Claude subagents,
ChatGPT in the browser (a **new chat per batch**; format drifts in a long conversation), or a
cheap API model. Output goes to `catalog/out/batch-NNNN.json`.

## Step 4 — the gate

```
pnpm exec tsx scripts/validate-catalog.ts \
  --facts catalog/facts.jsonl \
  --input catalog/out/batch-0001.json \
  --sources scripts/catalog-validation-sources.ts \
  --start 0 --size 40
```

Every row, zero tokens. Failures go to `catalog/needs_review.jsonl`, never to the catalog. A batch
below 95% clean exits non-zero: **stop and diagnose, do not fix it later.**

Both source checks fail closed. `findMisspellings` returns `null`, not `[]`, when the dictionary
could not be built, and no caller may read "the check did not run" as "every word is correct".

## Step 5 — audit

Read ~200 random accepted rows. This is the step that is not automatable and not skippable.

## Step 6 — audio

```
node scripts/audio-batches.mjs --facts catalog/facts.jsonl --output catalog/audio
```

Drives `download_ddo_audio.py` 500 words at a time, recording each batch in
`catalog/audio-manifest.json`; re-running continues from the first batch that is not done. Words
only, base forms only, `|pos` hints so a homograph resolves to the right article.

**Phrases get no audio, and that is not a gap.** DDO attaches audio to headwords only: `godt lide`
exists there as a fixed expression under `lide`, with a definition and no recording of its own.
Stitching word recordings together is rejected — the citation forms are wrong (`tage`, not
`tager`) and Danish reshapes phrase boundaries, so the result would teach a wrong pronunciation,
which is AGENTS.md §8's ban in audio form.

A missing recording never blocks a row. The word enters the catalog silent and the tap-to-hear
button does not render.

## Step 7 — upload (a separate, short session)

Issue #6 §11: read the CSVs, upsert `word_catalog` / `word_catalog_sense`, upload `catalog/audio/`
to the private bucket, write back `audio_path`, verify counts and a few signed URLs, and confirm
the miss path still works for a word deliberately absent from the catalog.

## The one departure from the issue as written

Issue #6 §3 says IPA comes from "DDO/Wiktionary through the existing `lib/pronunciation.ts` path".
There is no such path. AGENTS.md §8 describes it as the *intended* pipeline, but the shipped code
asks a model for Cyrillic directly from the Danish word and stores `ipa: ''`,
`ddo_ipa: []`, `wiktionary_ipa: []`. Ten thousand DDO fetches to build one would be thirty
thousand requests against a dictionary with no API; kaikki.org publishes the same Wiktionary
phonetics as one file, joined offline and part-of-speech tagged. DDO remains the audio source.
