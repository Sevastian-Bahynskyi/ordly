# Sentence families (issue #16)

A sentence family teaches **one catalog sense in one everyday context**. Practice uses its
sentences for gap, order and typed exercises on a word the learner has saved, so every sentence
must be correct, natural Danish that demonstrates exactly that meaning, with a faithful English and
Russian translation.

```
pnpm exec tsx scripts/write-family-work.ts --fullforms <ddo-fullforms.csv>          # work files
# generator writes catalog/families/out/batch-NNNN.json for each work file
pnpm exec tsx scripts/check-family-batches.ts --fullforms <csv> --only batch-NNNN.json
pnpm exec tsx scripts/check-family-batches.ts --fullforms <csv> --merge             # snapshot
```

## Input: one work row per sense

```json
{ "lemma": "gulv", "kind": "word", "sense_id": "…", "pos": "noun", "gender": "et",
  "freq_rank": 912, "min_level": "A2", "ru": "пол", "en": "floor",
  "forms": ["gulv", "gulve", "gulvene", "gulvenes", "gulves", "gulvet", "gulvets", "gulvs"] }
```

`ru` (and `en` when present) say **which meaning** this sense is. `forms` are the only forms of the
word you may put in a sentence: they are verified by DSL's DDO full-form list or COR.

## Output: a JSON array, one family per work row

```json
[
  {
    "lemma": "gulv", "kind": "word", "sense_id": "…",
    "level": "A2", "situation": "home", "grammar": "noun-definite",
    "frame": "{subject} ligger på {target}.",
    "slots": { "subject": [ { "da": "Bogen" }, { "da": "Tasken" }, { "da": "Min telefon" } ] },
    "variants": [
      { "slots": { "subject": 0 }, "target": "gulvet", "en": "The book is lying on the floor.", "ru": "Книга лежит на полу.", "orders": [] },
      { "slots": { "subject": 1 }, "target": "gulvet", "en": "The bag is lying on the floor.", "ru": "Сумка лежит на полу.", "orders": ["På gulvet ligger tasken."] },
      { "slots": { "subject": 2 }, "target": "gulvet", "en": "My phone is lying on the floor.", "ru": "Мой телефон лежит на полу.", "orders": [] }
    ]
  }
]
```

Save it as `catalog/families/out/batch-NNNN.json`, same number as the work file, rows in the same
order. If you cannot write a family you are sure of for a sense, write
`{ "sense_id": "…", "lemma": "…", "skip": "why" }` instead. A skip is better than a doubtful
sentence; do not skip merely because the word is hard.

### Fields

- **`lemma`, `kind`, `sense_id`**: copied from the work row.
- **`level`**: `A1`, `A2`, `B1` or `B2` — never below the row's `min_level`. It describes the
  sentence: an A1 sentence is short, present tense, everyday; B2 may use subordinate clauses,
  passive, abstract topics.
- **`situation`** and **`grammar`**: ids from `catalog/benchmark/cefr-matrix.json`, and the chosen
  level must be one listed for **both** ids. `grammar` names the grammatical feature the sentence
  actually exercises on the target word or around it (`noun-definite` when the target is
  `gulvet`, `verb-past` when it is `gik`, `word-order-v2` when a fronted adverbial forces
  inversion, `prepositions-place` for `på`…). Spread situations: do not put everything in `home`.
- **`frame`**: the Danish sentence with `{target}` exactly once and a `{slot}` for each part that
  varies. Lowercase slot names (`subject`, `object`, `time`, `place`…). Punctuation at the end.
  The first letter is capitalised automatically.
- **`slots`**: 1–6 options per slot, each `{ "da": "…" }`. An option that only fits some partners
  declares it: `{ "da": "i går", "requires": { "verb": [1] } }` means it may only appear when the
  `verb` slot is option 1. Frames with no varying part are allowed only as `"slots": {}` with
  variants that differ in `target` (e.g. present vs past).
- **`variants`**: 2–6 explicit combinations. Each gives the option index for **every** slot, the
  exact `target` form in that sentence (one of `forms`), and complete `en` and `ru` translations of
  that whole sentence. `orders` lists other complete Danish word orders that are equally correct
  and natural (same words, different order, e.g. a fronted time phrase with inversion); leave it
  empty when there is none or you are unsure.

## Rules that decide quality

1. **The sentence demonstrates this sense, not another one.** `gang` "раз" is *Jeg har været der
   én gang*, not *Han går ned ad gangen* (that is "corridor"). A reader who sees only the Danish
   and the translation should recover this meaning.
2. **Natural, idiomatic, correct Danish** a native would say. V2 word order in main clauses,
   subordinate-clause adverb placement (*fordi han ikke kom*), correct `sin/hans`, `der/som`,
   `en/et`, adjective `-t`/`-e` agreement, definite suffix vs. article + adjective (*det store
   hus*). No calques from English or Russian.
3. **Every variant is a whole sentence that is correct on its own.** Changing a slot may change
   agreement elsewhere (`en stor bil` / `et stort hus`) — then that difference must be inside the
   slot option (`{ "da": "et stort" }`), or the combination must be excluded with `requires`, or
   the variants must not include it. Never list a combination you have not read as a full
   sentence.
4. **The gap is unambiguous.** With the translation shown, only this word (in this form) should
   fit where `{target}` is. Avoid frames where a synonym or another common word would be equally
   right. For prepositions and other small words, choose contexts where the choice is fixed
   (*Bogen ligger på bordet*, *Jeg venter på bussen*).
5. **Translations are faithful and natural**: translate the Danish sentence, keep tense, person,
   number and meaning; no added or dropped content. English in English, Russian in Russian
   Cyrillic.
6. **Only `forms` in the target.** Do not inflect the word yourself. If the form you need is not
   listed, choose a different sentence.
7. **Vocabulary around the target stays at or below the family's level.** Prefer common words;
   no personal names, brands, places or numbers written as digits. Pronouns and common nouns
   (*min bror*, *naboen*, *læreren*) instead of names.
8. **No copying.** Do not use sentences from Tatoeba, dictionaries (DDO/ordnet.dk examples are
   copyright-protected) or textbooks. Write your own.
9. **Variety.** Across a batch, vary situations, grammar features and sentence shapes; do not
   reuse one frame for many words.

The checker enforces the mechanical half (forms, placeholders, constraints, spelling, scripts,
duplicates, alternative orders use the same words, article/gender agreement before a noun target,
matrix cells, level floor, benchmark overlap). The audit judges the rest: sense, naturalness,
ambiguity and translation. Both must pass before anything is published.
