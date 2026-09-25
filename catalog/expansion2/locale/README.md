# Learner-language wording pass (issue #16)

Adds an English (or other learner-language) wording to every catalog sense that exists in Russian.
The sense itself — its id, ordinal, part of speech, gender and Danish example — is fixed by the
work file. Only the wording is new.

```
pnpm exec tsx scripts/write-locale-work.ts --lang en        # catalog/locale/work/batch-NNNN.json
# generator writes catalog/locale/en/batch-NNNN.json for each work file
pnpm exec tsx scripts/check-locale-batches.ts --lang en     # every reply against its work file
pnpm exec tsx scripts/check-locale-batches.ts --lang en --merge   # → catalog/locale-en.json
pnpm exec tsx scripts/import-catalog-locale.ts catalog/locale-en.json
```

Senses already worded by the issue #14 pilot (`catalog/locale-pilot.en.json`) are not in the work
files.

## The reply

One JSON object per work file, saved as `catalog/locale/en/batch-NNNN.json` (same name):

```json
{
  "lang": "en",
  "generator": "locale-en-2026-09-25",
  "senses": [
    { "lemma": "gang", "kind": "word", "sense_id": "…", "ordinal": 2, "pos": "noun", "gender": "en",
      "text": "corridor, hallway", "example": "Han står på gangen.", "example_translation": "He is standing in the hallway." }
  ]
}
```

Every work row appears once. `lemma`, `kind`, `sense_id`, `ordinal`, `pos`, `gender` and `example`
are copied exactly; `ru` and `example_ru` are dropped. `example_translation` is null exactly when
`example` is null.

## How to word a sense

The Russian wording (`ru`) says **which** meaning this is. The Danish example, where there is one,
shows it in use. The English wording must name that same meaning — no broader, no narrower.

- **Match the scope of the Russian.** `bare` is "only", not "just now"; `lige` sense "только что" is
  "just (a moment ago)". English words that span several Danish meanings are the main trap: add
  a short parenthetical whenever the bare English word could be read as another sense of the same
  Danish word (`gang` → "time (occurrence)" / "corridor, hallway" / "gait, walk").
- **Two senses of one word may never read the same.** The checker refuses identical wordings.
- **Short gloss, not a definition.** One to three comma-separated wordings of the same meaning.
  Keep a Russian clarifier as an English one: "неопределённый артикль (при существительных общего
  рода)" → "a, an (indefinite article, common gender)".
- **Form conventions.** Verbs as "to …" (`være` → "to be"); nouns without an article; adjectives
  and adverbs bare; lowercase unless English capitalises the word. No Danish letters (æ, ø, å) —
  a Danish word in the wording means it was not translated.
- **Example translation.** Translate the Danish sentence itself into natural English, not the
  Russian translation of it. Keep tense, person and number.
- **When the Russian looks wrong** for the Danish word and its example, still word the meaning the
  Russian names (the sense identity must not change) and record it in
  `catalog/locale/en/batch-NNNN.flags.json` as `[{ "sense_id": "…", "lemma": "…", "note": "…" }]`
  so it is audited. Never silently word a different meaning.
