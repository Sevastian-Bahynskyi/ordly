# Meaning model: senses, synonyms, and interactive practice

Agreed design for moving Ordly from a word list to a meaning-and-sentence learning tool. Written for the agent implementing it. Every decision below was settled explicitly; do not re-open one without saying so.

Read `AGENTS.md` first. Nothing here overrides its regression-sensitive behavior (pronunciation pipeline, entry-kind detection, Again-requeue, revision, PWA staleness, performance expectations).

## 1. Intent

The unit of learning becomes the **meaning**, not the word. A word carries several senses; each sense has its own part of speech, its own example sentence, and its own coverage. Synonyms become real edges between entries, used both for display and for grading. Practice gains interactive exercise types that probe gaps rather than farm easy wins.

Non-goals: a gamified course, XP, a global graph page, a full curriculum.

## 2. Settled decisions

| # | Decision |
|---|---|
| D1 | Translations are stored as a `senses` jsonb array on `vocabulary_entries`. `translation` remains as a denormalized string kept in sync by a trigger, so every existing read path keeps working. |
| D2 | Part of speech is **per sense**, not per entry. Danish nouns additionally carry an `en`/`et` gender chip. |
| D3 | Two separate composer actions: `Fill missing with AI` (empties only) and `Regenerate all` (overwrites every AI-fillable field including the example sentence, regardless of origin). Safety is a single Undo, not origin heuristics. |
| D4 | Synonym edges live in `entry_links`, between saved entries only. Cheap candidate generation first, one AI scoring call over the top candidates. High confidence auto-links; lower confidence appears as dismissible chips. |
| D5 | Grading accepts any stored sense plus senses of synonym-linked entries, deterministically. Practice always permits a grading AI call even when AI coaching is off. A `My answer was right` control re-rates and appends the answer as a `source: 'user'` sense. |
| D6 | New practice content is generated from the learner's own vocabulary; distractors prefer same-POS and synonym-linked entries. Cached in `practice_packs`. |
| D7 | Inspect/edit lives at a dedicated route `/words/[id]`. `AddWordComposer` is refactored into a shared `EntryEditor` so add-new and edit-existing are the same component with the same AI actions. |
| D8 | Scheduling splits by objective: the **entry** remains the recognition card (existing `review_cards`, untouched history); **senses** are production targets in `practice_state.objectives`, keyed `entry:<id>:sense:<sid>`. No schema change needed — `target_key` is already text. |
| D9 | Review is not changed. Any sense is accepted. Meanings 2..n are driven by per-sense coverage feeding the practice planner, which disambiguates via context sentences. |
| D10 | Example sentences are lazy. The primary sense uses the existing `example_sentence` / `example_translation` columns and is generated at save. Other senses store their example inside their own sense object, generated on first admission as an objective or on explicit request. |
| D11 | Migration is two-phase: a deterministic, zero-AI SQL split now; AI refinement (POS, gender, sense boundaries) on demand, modelled on `components/VocabularyIconBackfill.tsx`. No one-shot mass backfill. |
| D12 | Synonyms render as chips in lists and a hand-rolled static SVG ego-graph (1 hop) on the entry page. No new dependency. No global graph page. |
| D13 | New exercise kinds: word-bank sentence build, cloze with choices, sense discrimination. Match-pairs and odd-one-out are explicitly cut. |
| D14 | Choice-based answers record attempts and may advance the sense objective, but never count as unaided production and never write `legacy_change` — so they cannot advance `review_cards` or mark an entry mastered. |
| D15 | Sense ids are app-generated and permanent. Regeneration matches returned senses to existing ones by normalized text and preserves id, coverage, and objective. Vanished senses are soft-deleted via `removed_at`. |
| D16 | POS and gender ride inside the **existing** `/api/ai/enrich` schema — no extra round-trip. Synonym discovery is the only new call and runs after save, never blocking the composer. |
| D17 | `entry_links` cascades on delete. A material edit to an entry's Danish text demotes its auto-linked edges to unconfirmed; user-confirmed edges survive. |
| D18 | A sense becomes eligible for promotion only once its entry's recognition card has `reps >= 3`. Among eligible senses, coldest coverage wins; the primary sense always leads. The existing two-new-targets-per-day cap governs the whole pool. |

## 3. Data model

### 3.1 Sense object

```ts
export type PartOfSpeech =
  | 'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun'
  | 'preposition' | 'conjunction' | 'numeral' | 'interjection' | 'phrase'

export type NounGender = 'en' | 'et'

export interface EntrySense {
  id: string                       // app-generated, permanent (D15)
  text: string                     // the translation itself
  pos: PartOfSpeech | null
  gender: NounGender | null        // only meaningful when pos === 'noun'
  note: string | null
  example: string | null           // null for the primary sense: it uses the columns
  example_translation: string | null
  source: 'split' | 'ai' | 'user'
  coverage: { recognized: number; produced: number; last_seen: string | null }
  created_at: string
  removed_at: string | null        // soft delete (D15)
}
```

The **primary sense** is the first non-removed element of the array. It reads its example from `example_sentence` / `example_translation` rather than from its own fields (D10).

### 3.2 `vocabulary_entries.senses`

Additive migration:

- `senses jsonb not null default '[]'::jsonb`
- `check (jsonb_typeof(senses) = 'array')`
- `check (octet_length(senses::text) < 40000)`

Two `private` helpers plus one trigger keep `senses` and `translation` coherent in both directions:

- `private.senses_from_translation(translation text, entry_kind text) returns jsonb` — for `entry_kind = 'word'`, split on `[;,/]`, trim, drop empties, emit `source: 'split'` senses with null `pos`. For `entry_kind = 'sentence'`, emit exactly **one** sense holding the whole string. Splitting a sentence translation on commas is destructive; this is the guard.
- `private.translation_from_senses(senses jsonb) returns text` — join non-removed sense texts with `", "`.

Trigger `vocabulary_sync_senses` (BEFORE INSERT OR UPDATE):

- INSERT: if `senses` is empty and `translation` is not null, derive senses from translation. Then recompute `translation` from senses.
- UPDATE: if `senses` changed, recompute `translation`. Otherwise, if `translation` changed, re-derive `senses` from it.

This keeps legacy writers correct without touching them — notably raw bulk add and the apply-preview path in `components/WordsClient.tsx`, both of which write `translation` directly.

Phase 1 backfill is a single `update` over existing rows using the same helper.

### 3.3 `entry_links`

```sql
create table public.entry_links (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  a_id uuid not null references public.vocabulary_entries(id) on delete cascade,
  b_id uuid not null references public.vocabulary_entries(id) on delete cascade,
  kind text not null check (kind in ('synonym','antonym','related','inflection_of')),
  source text not null check (source in ('ai','user')),
  confidence real check (confidence between 0 and 1),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (a_id, b_id, kind),
  check (a_id <> b_id),
  -- symmetric kinds are stored once, in canonical order;
  -- inflection_of is directional: a_id is the inflected form, b_id the base
  check (kind = 'inflection_of' or a_id < b_id)
);
```

RLS is owner-scoped like every other table, and the insert policy must additionally verify that **both** entries belong to `auth.uid()`. Grants to `authenticated` only; revoke from `anon`. Index on `(user_id, a_id)` and `(user_id, b_id)`.

Edge lifecycle (D17): delete is handled by the FK cascade. On a material change to `vocabulary_entries.danish`, set `confirmed = false` for that entry's edges where `source = 'ai'`; leave `source = 'user'` edges alone.

## 4. Grading

`lib/answer.ts` gains an expanded candidate set, still deterministic and offline:

1. every non-removed sense text of the entry
2. every non-removed sense text of entries joined by a `synonym` edge
3. the existing relaxed/æøå fallbacks, unchanged

AI semantic checking stays as the fallback in review (`/api/ai/check-answer`). In practice, separate **grading** from **coaching**: `session.aiEnabled` continues to gate feedback prose, but a grading call is permitted regardless, still inside the call budget (`lib/practice-server.ts`).

`My answer was right` (D5) appears on the reveal screen in both review and practice. It re-rates the card and appends the typed answer as a sense with `source: 'user'`. User senses are excluded from synonym-discovery evidence — otherwise the graph learns from itself.

## 5. Practice

Extend `PracticeKind` with `assemble` (word bank), `choose` (cloze with choices), and `sense` (sense discrimination). Extend `PracticeAssistance` with `'choices'`.

Distractor selection draws from the learner's own entries, preferring same POS and synonym-linked neighbours (D6). Generated task content caches in `practice_packs` keyed by entry, content revision, translation language, and prompt version, exactly as memory packs do today.

Evidence (D14): a task answered with assistance `'choices'` commits a `practice_attempts` row and may advance the sense objective's own FSRS state, but **always** commits `legacy_change = null`. That single rule keeps it out of `review_cards`, out of `review_logs`, and out of the mastery calculation in `commit_practice`, with no SQL change.

Promotion (D18): eligible senses are those whose entry's `review_cards.reps >= 3`; sort by coldest `coverage.last_seen`, primary sense first. The existing two-new-targets-per-day cap is unchanged and governs senses and frames together.

## 6. Ship order

Five sequenced, independently deployable steps. Verify `pnpm lint`, `pnpm test`, and `pnpm build` on each, then GitHub Actions and the Vercel status for the exact SHA, per `AGENTS.md` §2.

**Step 1 — regenerate fix.** No schema. `components/AddWordComposer.tsx`. Split the single action into `Fill missing with AI` and `Regenerate all`; the latter requests every field in `activeFields` unconditionally, including `example_sentence` and `example_translation`. Drop the `aiSources` staleness heuristic from the regenerate path — a hand-typed field has no `aiSources` entry and is therefore never seen as stale, which is the present bug. Add draft-snapshot Undo.

**Step 2 — senses model.** Migration (column, helpers, trigger, phase-1 backfill). `lib/types.ts` gains `EntrySense`, `PartOfSpeech`, `NounGender`. `/api/ai/enrich` schema returns senses with `pos` and `gender` in the same call (D16). Composer renders sense rows with colored POS chips and the `en`/`et` chip. `lib/answer.ts` accepts all senses. No new pages.

**Step 3 — entry editor.** Extract `EntryEditor` from `AddWordComposer`; add `/words/[id]`; row click navigates; `SentencesClient` links to the same editor. Per-sense AI actions and per-sense lazy example generation. `My answer was right` in review.

**Step 4 — synonyms.** `entry_links` migration, post-save discovery, chips in lists, SVG ego-graph on the entry page, grading accepts linked senses, edge demotion on material edit.

**Step 5 — practice.** The three new kinds, `'choices'` assistance, coverage-driven promotion, distractor selection, pack caching.

Steps 2 and 4 are the only ones touching production data; land them alone so a bad backfill is attributable.

## 7. Risks to watch

- **Sense identity.** The normalized-text match in D15 is the only thing standing between a regenerate and silently orphaned FSRS state. Cover it with a test before wiring the UI.
- **Trigger recursion.** The sync trigger writes `translation` and `senses` in the same BEFORE row; make sure it is `before` and mutates `new`, never issuing a nested `update`.
- **Bulk add.** Raw bulk import writes `danish` only. The trigger must tolerate a null translation and leave `senses` empty; those rows stay excluded from review as today.
- **Sentence entries.** Never comma-split their translation. Assert this in the migration test.
- **Cost.** Synonym discovery is one call per save. Keep candidate pre-filtering deterministic so the AI never sees the whole vocabulary.
- **Graph honesty.** Auto-linked, unconfirmed edges must be visually distinct from confirmed ones, and must not be used to generate distractors until confirmed.
- **Performance.** Every added read path is on the phone's critical path. `senses` is on the entry row precisely to avoid a join; do not introduce one.

## 8. Implementation notes (decisions refined during review)

Recorded here because §2 says no decision is re-opened silently.

- **D6 distractors.** Direct confirmed synonyms are *excluded* from distractors, because in a gap they may genuinely be right. Their own confirmed neighbours (second hop) are preferred instead.
- **D18 pace.** On top of the shared two-new-targets-per-day cap, at most one sense is promoted per session, so a vocabulary of multi-sense words cannot crowd out new words. Every eligible primary sense sorts ahead of every secondary one, with coldest coverage inside each group.
- **D15 versions.** A sense objective is versioned on the Danish, its own id and its own normalized text, not on the whole entry. `source: 'user'` senses are excluded from the entry version, so `My answer was right` resets nothing.
- **D4 dismissals.** Dismissing a suggested edge keeps the row as a tombstone (`dismissed_at`, `source: 'user'`) so discovery does not propose it again. High-confidence AI edges (≥ 0.85) are still stored confirmed, as D4 and D17 describe.
- **D11 refinement.** Refinement only fills part of speech and gender on `'split'` senses and re-joins adjacent comma fragments. It leaves the `translation` string byte-for-byte unchanged, so it can run without a preview.
- **§5 caching.** Interactive boards are rebuilt deterministically from stored senses and examples. Only generated sense examples are cached in `practice_packs`.
