# How to generate the catalog

60 files, 50 words each, 3000 words total. Frequency order, so stopping partway
still leaves the most useful words done.

## For each batch

1. Open a **new chat**. Not a new message in an old one — a long conversation drifts, and around
   the thirtieth batch a model starts shortening fields and dropping rows.
2. Paste the whole contents of `batch-NNNN.txt`.
3. Save the reply — the bare JSON array, nothing else — as `catalog/out/batch-NNNN.json`.

The reply must be a JSON array with exactly 50 objects in exactly the order it was asked for.
If it arrives wrapped in a code fence, strip the fence. If the model says anything before or after
the array, delete it.

## The phrase list

`phrases.txt` is a different job and a later one: it asks for the multi-word expressions a
frequency list cannot contain. Do the words first.

## Then check it

```
pnpm exec tsx scripts/validate-catalog.ts \
  --facts catalog/facts.jsonl \
  --input catalog/out/batch-0001.json \
  --sources scripts/catalog-validation-sources.ts \
  --start 0 --size 50
```

`--start` is in `index.json` next to this file, one entry per batch. Below 95% clean the script
exits non-zero: regenerate that batch rather than fixing rows by hand, so provenance stays honest.

## What the gate will reject

- a pronunciation containing any Latin letter, or one supplied for a word whose IPA is `null`
- a gender the facts did not supply, or one on a sense that is not a noun
- a part of speech different from the one the facts supplied
- a Russian meaning with a Latin homoglyph in it
- an example that does not contain the word, or that fails the Danish spell check
- a batch that came back a different length, or in a different order

None of these are style preferences. Each one is a way a row can look right and be wrong.
