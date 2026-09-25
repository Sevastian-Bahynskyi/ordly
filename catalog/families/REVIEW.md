# Reviewing a sentence-family reply (issue #16)

The second stage of every family batch. A writer produced `out/batch-NNNN.json` from
`work/batch-NNNN.json` under `README.md`; you are an independent reviewer with native-level
Danish, English and Russian. Your job is to make every family one a strict native auditor would
pass, **in place**, before the mechanical gate and the seeded audit see it. A single-pass writer
audited at 80.7% clean (seed 926); the gate is 95%.

Read `README.md` in full first: every rule there binds here. Then, for **each family**:

1. **Sense.** Does the Danish alone (translations covered) point to this work row's `ru`/`en`
   meaning and no other sense of the word? If the gloss itself is wrong for the word, replace
   the family with `{ "sense_id", "lemma", "skip": "gloss wrong: …" }`.
2. **Danish.** Read each variant as a whole sentence. Is it grammatical, idiomatic and what a
   native would actually say — V2, adverb placement, *når/da*, particles, prepositions,
   definiteness, agreement, a subject that can do the action, no calque, no tautology? Fix the
   frame, a slot option or the variant; drop a variant you cannot make natural (keep at least 2).
3. **Gap.** Cover the Danish. From the English alone, then from the Russian alone, list every
   single Danish word a learner could correctly type into the gap. Anything correct that is not
   the target goes into that variant's `accepted`, inflected exactly as it would stand in the gap
   (at most 4). If more than 4 fit, or a very common word fits better than the target, change the
   sentence so the context forces the target.
4. **Translations.** Same tense, person, number and content; nothing added (*founding*,
   *сорванцы*), nothing dropped; natural English and natural Russian.
5. **Orders.** Each entry uses exactly the same words and is equally natural; add the common
   fronted order where one exists and you are sure of it.
6. **Labels.** `level` fits the sentence and is not below `min_level`; `situation` is the
   setting a reader recognises; `grammar` names what the target exercises (README table); the
   level is listed for both ids in `catalog/benchmark/cefr-matrix.json`.

Edit `out/batch-NNNN.json` directly, keeping the same order and one entry per work row. Then
write `review/batch-NNNN.json`: an array with one object per family you changed,
`{ "sense_id": "…", "lemma": "…", "changes": ["accepted +kendt", "da → når", …] }`. An empty
array means you read every family and changed nothing.

Do not lower a family's quality to satisfy the gate, and do not skip a sense merely because it
is hard: skip only when no natural, unambiguous sentence exists for that meaning.
