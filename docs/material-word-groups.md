# Material word groups and forms

## Decision and rollout

1. **Missing audio** (small, implemented): Material's toggle selects single words with neither an entry recording nor a catalog recording. It combines with search, status, and part of speech. Turning it on switches to Words; turning it off keeps that tab. The URL records the toggle. A stored path counts as present; checking whether an object exists or plays is a separate audit.
2. **Groups** (medium, implemented): `vocabulary_entries.canonical_entry_id` points to another saved word owned by the same user. A root has `null`; members point directly to the root. The database rejects self links, nested groups, and grouping sentences. Every entry keeps its own senses, translation, audio, FSRS card, and review history. The entry page lets the learner choose a canonical word, add an ungrouped word, or unlink it. Material shows group membership.
3. **Forms** (medium, implemented): `word_forms` has one row per entry and named slot. Adjectives have positive, comparative, superlative; verbs have infinitive, present, past, past participle, imperative; nouns have indefinite and definite singular and plural. Each row has text and an optional private audio object path. Forms are displayed in Material and edited on the entry page. A blank base slot means the entry's Danish text is the base. Forms never create review cards.
4. **Existing material** (manual first, about an hour for a small collection): All 194 existing entries remain standalone; no meanings, cards, or recordings are merged. Review likely duplicate entries in Material, open one as the canonical word, and link the others from its word page. Fill irregular slots while checking the forms against COR. Existing `entry_links.inflection_of` links remain untouched; none were confirmed when this migration was prepared. A future suggested-link audit can use COR, but should require confirmation before grouping.

## Data constraints

- `(user_id, canonical_entry_id)` references the canonical entry's `(user_id, id)`, so a group cannot cross owners.
- A trigger keeps groups flat: the chosen canonical entry must be an unlinked word, and an entry with members cannot become a member.
- Deleting a canonical entry clears members' `canonical_entry_id`; it does not delete their meanings or review histories.
- `word_forms` has a composite owner/entry foreign key, one row per form slot, and owner scoped RLS. An audio path must use the private word audio bucket format.

## Acceptance checks

- On Material, toggle Missing audio with search, status, and part of speech active; only single words lacking both audio paths remain. Turn it off and the ordinary Words view returns.
- Link a noun or verb entry to a canonical word, reload both pages, and verify the same group appears. Unlink it and verify its senses and FSRS card are unchanged.
- Save comparative/superlative, verb, and noun forms on entries with those parts of speech. Reload and edit a form. A form with audio plays through the existing private audio control; one without audio uses the device voice.
- Try linking a word to itself, creating a nested group, or writing another owner's form: database constraints or RLS must reject the write.
- At 402px width, the filter and form rows must stay within the viewport and controls remain tappable.
