# Sentence families (issue #16)

A sentence family teaches **one catalog sense in one everyday context**. Practice uses its
sentences for gap, order and typed exercises on a word the learner has saved, so every sentence
must be correct, natural Danish that demonstrates exactly that meaning, with a faithful English and
Russian translation.

```
pnpm exec tsx scripts/write-family-work.ts --fullforms <ddo-fullforms.csv>          # work files
# generator writes catalog/families/out/batch-NNNN.json for each work file
# a reviewer applies catalog/families/REVIEW.md to the reply, in place
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
      { "slots": { "subject": 1 }, "target": "gulvet", "en": "The bag is lying on the floor.", "ru": "Сумка лежит на полу.", "orders": ["På gulvet ligger tasken."], "accepted": [] },
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
- **`variants`**: 3–4 explicit combinations (2 only when the frame genuinely allows no more; at
  most 6). Each gives the option index for **every** slot, the exact `target` form in that
  sentence (one of `forms`), and complete `en` and `ru` translations of that whole sentence.
  `orders` lists other complete Danish word orders that are equally correct and natural (same
  words, different order, e.g. a fronted time phrase with inversion); leave it empty when there is
  none or you are unsure. `accepted` lists other Danish words (at most 4) that a learner could
  correctly type into the gap given the translation shown — see rule 4.

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
4. **The gap is unambiguous, or its alternatives are listed.** After writing the translations,
   list every Danish word a learner could type into the gap from the English or the Russian. If
   one of them is also correct there (`for` "because" → *fordi*; *skal* "have to" → *må*;
   *hustruen* "the wife" → *konen*; *tilstrækkelig* "enough" → *nok*; *Indtag* "Take" → *Tag*),
   first try to change the sentence or the translation so only the target fits; if that is not
   possible, put the other correct words in `accepted`. Never leave a known alternative unlisted.
   For prepositions choose contexts where the choice is fixed (*Bogen ligger på bordet*, *Jeg
   venter på bussen*).
5. **Translations are faithful and natural**: translate the Danish sentence, keep tense, person,
   number and meaning; no added or dropped content. English in English, Russian in Russian
   Cyrillic.
6. **Only `forms` in the target.** Do not inflect the word yourself. If the form you need is not
   listed, choose a different sentence.
7. **Vocabulary around the target stays at or below the family's level.** Prefer common words;
   no personal names, brands, places or numbers written as digits. Pronouns and common nouns
   (*min bror*, *naboen*, *læreren*) instead of names.
8. **Register decides the level.** A formal or written-register word (*hustru*, *indtage*,
   *tilstrækkelig*, *forbrug*, *udtalelse*) gets a formal context — news, letters, official
   language — at B1 or B2, whatever its `min_level`. If no natural context exists, skip it.
9. **Translations add nothing and drop nothing.** No "campaign" that the Danish lacks, no
   "товара" that is not there. Russian must be natural: *Дом красят* (not *Дом красится*),
   *работает на семью*, *со станции*. Keep tense: *som firmaet havde planlagt* is "had planned".
10. **No copying.** Do not use sentences from Tatoeba, dictionaries (DDO/ordnet.dk examples are
   copyright-protected) or textbooks. Write your own.
11. **Variety.** Across a batch, vary situations, grammar features and sentence shapes; do not
   reuse one frame for many words.

12. **Natural word order and complete contexts.** Put the phrase that belongs to a noun next to it
   (*Jagten i skoven var hård*, not *Jagten var hård i skoven*); give verbs the complements they
   need (*spiller fodbold med min bror*, or *leger*). Avoid forced comparatives of rare
   adjectives (*særere*).
13. **Question the gloss.** If `ru`/`en` does not match what the Danish word means (e.g. a gloss
   that belongs to a different word, like *udtalelse* glossed as "pronunciation", which is
   *udtale*), do not write a family for it: skip with `"skip": "gloss wrong: …"` and say what the
   word actually means. These skips become catalog repairs.

14. **Back-translate every gap before you finish.** Cover the Danish, read only the English, then
   only the Russian, and write down every single Danish word you would put in the gap. The
   round-2 audit (seed 926) found most failures here: *bekendt* → **kendt**, *foruden* →
   **udover**, *bonden* → **landmanden**, *besejrer* → **slår**, *oplæg* "proposal" → **forslag**,
   *færd* → **rejse**, *afslutningen* → **slutningen**, *fremme* "arrived" → **ankommet**, *værk*
   → **ondt**, *salg* → **udsalg**, *flyder* "spills" → **løber**, *rask* "brisk" → **frisk**,
   *egentlige* "real" → **virkelige**, *skift* → **skifte**. Each correct one goes in `accepted`
   (inflected to fit the gap exactly) or the sentence changes until only the target fits.
15. **`når`, `da`, `hvis`.** *da* is one past occasion (*Da jeg kom hjem, …*); anything habitual,
   general or in the present or future is *når* (*Hun tænder lyset, når det bliver mørkt*).
16. **The Danish alone must select the sense.** For a word with several senses, the sentence
   without its translation must point to this one: *rytter* "cyclist" needs a bike in the
   sentence (*Han er den bedste rytter på cykelholdet*), not just *på holdet*.
17. **Particle verbs keep their particle** (*krydse af*, *skrue op for*, *tage imod*), and every
   subject must be able to do the action (*Retten idømmer ham …*, not *Systemet idømmer*).
18. **No tautology or padding** (*Hun rider som en dygtig rytter* says nothing; *Hun er en dygtig
   rytter* does). Figurative uses stay out unless the sense is the figurative one.

### Choosing `grammar` and `situation`

Label what the sentence actually exercises; the nearest familiar id is not good enough.

| the target is… | `grammar` |
|---|---|
| a preposition of place or direction (*i, på, under, ind i*) | `prepositions-place` |
| a preposition or adverbial of time (*om, i, siden, før*) | `prepositions-time` |
| any other preposition: purpose, cause, material, topic, fixed government (*til, for, af, med, om* "about") | `prepositions-other` |
| the infinitive marker *at*, or a verb in an infinitive construction | `infinitive` |
| an adverb of degree, frequency or manner (*meget, for* "too", *ofte, næsten*) | `adverbs` |
| a modal particle or sentence adverb (*jo, vel, nok, dog*) | `sentence-adverbs` |
| the placement of *ikke, aldrig, også, måske* in a simple A1–B1 sentence | `negation` (the matrix's "negation and sentence adverb placement") |
| a conjunction | `conjunctions` or `subordinate-clause` (when the clause order is the point) |
| a noun whose form is the point (indefinite, definite, plural) | `noun-indefinite` / `noun-definite` / `noun-plural` |
| a noun whose meaning in context is the point | `noun-meaning` |
| an adjective whose ending is the point | `adjective-agreement` (never for numerals or adverbs) |
| an adjective whose meaning is the point | `adjective-meaning` |
| a verb whose tense is the point | `verb-present` / `verb-past` / `verb-perfect` / `verb-future` |
| a verb whose meaning or object is the point | `verb-meaning` |
| a pronoun or possessive | `pronouns` or `reflexive` |

`situation` is the setting a reader recognises: a cemetery walk is `leisure`, repairing one's
own car is `home` or `transport`, a company's quarterly figures are `work` or `society`. Topics
that only exist at B1/B2 (`society`, `abstract`) put the family at B1/B2.

The checker enforces the mechanical half (forms, placeholders, constraints, spelling, scripts,
duplicates, alternative orders use the same words, article/gender agreement before a noun target,
matrix cells, level floor, benchmark overlap). The audit judges the rest: sense, naturalness,
ambiguity and translation. Both must pass before anything is published.
