# Ordly — Agent Handoff / Continuation Guide

This file is written for the next coding agent. Read it before changing Ordly. It captures the product decisions, current architecture, recent fixes, deployment workflow, and regression-sensitive behavior established through the long implementation session ending 2026-09-03.

## 1. Product intent

Ordly is a personal, mobile-first Danish learning PWA. The user wants extremely low-friction capture plus serious spaced repetition, not a gamified language app.

Core product constraints:

- Danish is always the source language.
- Learner language is one app-wide preference: English (default for new profiles), Russian, Ukrainian. It drives the whole interface (`lib/i18n`, §26) and the supplied content. Read it through `learnerLanguage()` in `lib/learner-language.ts`, never with an inline fallback.
- Danish level is configurable A1–C1; default A1.
- No runtime AI (§27). Words and phrases come from the catalog; anything it does not hold is entered entirely by hand and studied in Review only.
- Support single words, phrases, sentence fragments, and full sentences.
- No folders/tags/taxonomy.
- No XP/coins. Streaks and useful progress statistics are fine.
- FSRS is authoritative for scheduling.
- Mobile-first. The user frequently uses the installed iOS Home Screen PWA.
- Visual direction: calm/premium, Apple/Linear-like, soft purple palette, rounded cards, minimal clutter.
- User strongly prefers direct implementation over tutorials. When asked to change something, inspect the real code, implement, then verify build/deployment.

## 2. Repository / deployment

Repository:

- `Sevastian-Bahynskyi/ordly`
- production branch: `main`
- Vercel is Git-connected to `main`.
- stable production host used in metadata: `https://ordly-sevastian-bahynskyis-projects.vercel.app`

After every code change:

1. Verify the latest GitHub Actions `Build` workflow.
2. Verify the Vercel commit status for the exact SHA.
3. Do not claim production success until Vercel reports success. If GitHub Actions is still queued but Vercel built the exact commit successfully, state that precisely.

Build workflow uses pnpm and should remain that way. An older Vercel failure came from running `npm install` against the pnpm dependency graph. The repository now contains `pnpm-lock.yaml`.

Current package baseline:

- Next.js `16.3.4`
- React / React DOM `19.2.8`
- TypeScript `^5.9`
- Supabase JS `2.112.4`
- `@supabase/ssr` `0.12.5`
- `ts-fsrs` `5.4.2`
- lucide-react `1.39.0`
- `nspell` `2.1.5` + `dictionary-da` `6.0.0` (Danish spelling, §22)
- pnpm `10.15.0`
- Node `>=20`

`pnpm build` is the important verification command. `lint` is currently `tsc --noEmit`.

## 3. Supabase

Production project:

- project ref: `pxnudtcqlmyaelfrdyfp`
- region: `eu-central-1`
- URL: `https://pxnudtcqlmyaelfrdyfp.supabase.co`

The browser Supabase URL/publishable key are intentionally public configuration. `lib/supabase/config.ts` contains safe public fallbacks so the app does not crash if those public Vercel env vars are absent.

Never expose or commit service-role credentials, provider keys, or other private secrets.

Important tables/functions currently include:

- `profiles`
- `vocabulary_entries`
- `review_cards`
- `review_logs`
- `review_sentence_cache`
- `pronunciation_cache`
- `push_subscriptions`
- `notification_deliveries`
- `practice_state`, `practice_attempts`, `practice_packs` (guided practice)
- `entry_links` (synonym graph, see §20)
- `cor_form` (Det Centrale Ordregister, reference data, see §22)
- private first-account claim / review-card creation / timestamp helpers
- `private.sync_entry_senses` trigger and `public.record_sense_coverage` RPC (senses, see §20)

RLS is owner-scoped. Any number of accounts can register; each sees only its own data. A new account gets its profile from the `on_auth_user_created_ordly` trigger (`private.create_profile()`). Shared tables (the word catalog and COR register) are read-only to signed-in users.

Repo migrations currently start at:

- `0001_initial.sql`
- `0002_entry_kind.sql`
- `0003_review_rating_revision.sql`
- `0004_pronunciation_cache.sql`
- notification migration added after those (check `supabase/migrations/` before modifying schema)

Keep repo migrations synchronized with production. The meaning-model migrations (`20260916094500_entry_senses.sql`, `20260916143000_entry_links.sql`, `20260916190000_sense_coverage_and_dismissals.sql`) must be applied in order before that code deploys. Verify against production rather than assuming.

`20260918091609_cor_forms.sql` creates the word register's table; the data itself is loaded by
`scripts/import-cor.ts` and is **not** in any migration (317,102 rows). A fresh environment needs
the script run once, or noun gender and the "is this even Danish" check simply stay quiet (§22).

SQL tests live in `supabase/tests/`. `meaning_model.sql` covers the senses trigger, coverage writes and link tombstones. Run it against a disposable `ghcr.io/supabase/postgres` container with every migration applied, never against production.

## 4. Authentication

Email/password auth through Supabase.

Important historical bug: confirmation links once opened `localhost:3000`. Production auth redirects were corrected; do not reintroduce local callback assumptions.

Auth callback route: `app/auth/callback/route.ts`.

## 5. Main UI structure

Primary tabs:

- Home
- Review
- Material (`/words`; words, phrases and sentences in one list)
- Settings

`components/AppNav.tsx` owns bottom navigation. Review and Material intentionally use different icons: Review uses a repetition/rotate icon; Material keeps a book icon. `/sentences` only redirects to `/words?kind=sentences`.

Navigation was optimized because the user reported ~1 s perceived lag. There is route transition/loading feedback and navigation prefetching. Preserve the fast-feeling behavior.

Bottom nav is heavily used on iPhone and must remain responsive, animated, and safe-area friendly.

## 6. Add Danish / composer

Main implementation: `components/EntryEditor.tsx`, shared by `components/AddWordComposer.tsx` (create) and `/words/[id]` (edit). Meaning rows live in `components/SenseRow.tsx`.

Required fields/behaviors:

- Danish word / phrase / sentence
- simplified Cyrillic pronunciation
- translation
- optional separate example sentence + translated example
- all fields remain manually editable; per-meaning part of speech and gender are picked by hand
- the catalog offer under the Danish field (§23); a miss makes the entry manual (§27)
- `Clear` / `Revert changes` as the one quiet secondary action beside Save
- Cmd/Ctrl+Enter saves
- duplicate lookup while typing: minimal but noticeable `Already saved · <meaning>` hint
- duplicate save confirmation supports adding another meaning
- successful save notice fades/collapses after about 2.8 seconds

The `⌘ Enter` visual hint must appear **below** the Save button on desktop. The shortcut itself still works globally inside the composer. Mobile CSS may hide the hint.

### Word / phrase / sentence detection

`lib/entry-kind.ts` distinguishes UI input kind:

- `word`
- `phrase`
- `sentence`

Stored DB `entry_kind` remains `word | sentence`; phrases are vocabulary entries stored as `word` for existing review behavior. The kind is shown as a quiet label beside the Danish field. A single word is checked against the word register before it is saved (§22); phrases and sentences are not checked by anything.

### Sentences and examples

When the input itself is a sentence, a separate example sentence should default OFF. The user may still enable it manually. Translation remains required.

When separate example is OFF:

- the Danish text itself is reviewed directly
- translation remains required
- example fields are cleared/not stored

## 7. AI enrichment behavior (removed)

Removed by issue #25 (§27). There is no enrich route, no "Fill missing" / "Regenerate all", no per-field AI button and no per-word AI preview. Do not bring any of it back.

## 8. Pronunciation

The pronunciation field is simplified Cyrillic that a Russian speaker can read aloud close to real Danish. It is NOT transliteration of Danish spelling. Catalog words carry a pronunciation made offline from source IPA (§23); a manual entry carries whatever the learner types as a hint. The former runtime pipeline (DDO/Wiktionary lookup, model validation, `pronunciation_cache`) is gone; the table is left in place, unused.

Anchors from user feedback, still binding for the catalog pipeline:

- `synes` should be close to `сюнес`, not `сйенс` etc.
- `stadig` should be around `сдэ́эди` / a similarly Russian-readable rendering, NOT `штадик` or `стаади`.
- `selvfølgelig` reduced natural speech is closer to `сэфёли` than spelling-based output.

## 9. Material page

Implementation: `components/MaterialClient.tsx` + `app/words/page.tsx`.

Features:

- the page header carries one action, **Show graph**. Adding words happens on Home; `Enrich missing` and `Bulk add` were removed as clutter.
- one-tap kind filter: All / Words / Phrases / Sentences (`?kind=`). Phrases are `entry_kind = 'word'` rows whose text `inferDanishInputKind` calls a phrase. The Sentences view lists sentences you added first, then example sentences from words.
- search Danish + translation
- filters: All / New / Learning / Mastered
- while the list is showing **Words**, a part-of-speech filter appears, listing only the classes
  the vocabulary actually has and how many carry each. It resets when the tab changes, so it can
  never hide rows from behind a tab that does not show it.
- no per-word icons: the Iconify/AI icon feature was removed (the `icon_name` column remains, unused)
- delete
- memory/retrievability ring on each word

Untranslated entries are excluded from review until they have a meaning.

Row click opens `/words/[id]`, which is the entry editor plus a synonym ego-graph. Rows show synonym chips. Confirmed and suggested chips must stay visually distinct in more ways than colour.

A **Show graph** button opens the whole meaning graph near full screen (`components/VocabularyGraph.tsx`, laid out by `lib/graph-layout.ts`). It carries the same search the list does — Danish, meanings, and the concept an edge is about. A match is brightened and the camera frames it; everything else dims rather than disappearing, so the graph never changes shape under the learner's hands, and an edge matched by its concept lights up both of its ends and explains itself at any zoom. It reuses the entries and edges the page already fetched, so it costs no extra query. Only entries that link to something are drawn; the rest are counted in the caption. Colour is one hue per connected island (`--cluster-*`), the layout is deterministic and never animates, and the camera opens framing everything. Each edge shows its `concept` — past a zoom threshold on the edge itself, and always in the panel for a selected node. Synonym discovery (and **Find links**) was a model call and is removed (§27); existing edges stay as stored.

## 10. FSRS / memory rings

Scheduling uses `ts-fsrs` 5.4.2.

The rating endpoint previously failed because `scheduler.next()` expects `Grade`, while the broader `Rating` enum includes `Manual`. Runtime validates 1–4, then casts to `Grade`. Do not change it back to `Rating`.

`components/MemoryRing.tsx` is used in Review and Words.

The visual semantics are deliberately two-dimensional:

- **arc fullness** = current estimated retrievability / probability of recall now
- **color** = FSRS stability / durability tier

Current color tiers:

- gray = New / no real memory estimate yet
- red = fragile, stability < 1 day
- amber = building, stability 1–7 days
- green = growing, stability 7–30 days
- purple = strong, stability 30+ days

The custom Ordly tooltip should show:

- estimated recall now
- stability
- next review time/date

Do not use a native browser `title` tooltip; a custom tooltip was added specifically because the native one looked bad.

A card can be 100% recall now with only 2-day stability; that should look full but amber. A 56-day stability card may also be ~100% recall but purple because the memory is much more durable.

## 11. Review flow

Main implementation: `components/ReviewSession.tsx`.

Key behaviors that must remain:

- due cards first, then new cards subject to daily new limit
- untranslated/raw entries excluded
- typed answers
- deterministic answer checker first; recognition accepts every stored sense and every sense of a synonym-linked entry (loaded with the cards in one parallel query)
- `My answer was right` flips the verdict and stores the typed meaning as a `source: 'user'` sense (never for sentences, which keep exactly one sense)
- if the deterministic checker rejects a non-empty answer, it is wrong; `My answer was right` is the learner's override (there is no model fallback, §27)
- user always selects final FSRS rating: Again / Hard / Good / Easy

### Empty answer

If input is empty:

- button says `Show answer`
- reveal correct answer
- display `Didn't know`
- recommend `Again`

### Again requeue behavior

This is important and was repeatedly reported by the user.

When user selects `Again`, the card must remain in the **current in-memory review session** and be reinserted at a random later position among remaining cards. The user must NOT have to finish the session, leave Review, and re-enter to see the `<1m` card.

`Again` does not count as session-completed until that card is later resolved with Hard/Good/Easy.

If it is the only card, it stays available in the current session rather than ending incorrectly.

### Revising previous answers/ratings

Users can navigate back to an already answered card and see the prior answer/rating.

They can change e.g. `Good → Again` or `Again → Good`.

The DB stores the card state immediately before the original rating so revision recomputes from the correct pre-review state rather than stacking another review.

Changing `Good → Again` should put the card back into the active queue. Changing `Again → Good` should remove a queued retry.

## 12. Notifications / Web Push

Notifications are implemented end-to-end, including iOS Home Screen PWA push.

UI: `components/SettingsForm.tsx`.

Service worker: `public/sw.js`.

Settings allow:

- enable/disable notifications on current device
- due-review reminders toggle
- occasional word challenge toggle
- mandatory study schedule with independent weekday selection + time for each selected day
- timezone auto-detected with `Intl.DateTimeFormat().resolvedOptions().timeZone`

Notification classes:

1. **Due review reminder**
   - only when FSRS reviews are genuinely due
   - cooldown/dedup prevents spam

2. **Occasional word challenge**
   - every few days, around afternoon local time
   - picks a weak/important learned word using stability, difficulty, and lapses
   - example: `🇩🇰 QUICK DANISH CHECK` / `What is the translation of “synes”?`

3. **Mandatory study reminder**
   - only selected weekdays/times
   - intentionally attention-grabbing, e.g. `🚨🇩🇰 DANISH TIME — OPEN ORDLY NOW!`
   - includes due count if available
   - OS still controls Focus/silent behavior; web push cannot override iOS notification policy

Server scheduler:

- implemented with Supabase scheduler + Edge Function rather than frequent Vercel cron
- function slug: `notification-dispatch`
- scheduler runs every 5 minutes
- end-to-end production test succeeded and sent to two registered subscriptions at the time of testing

The service worker handles:

- `push`
- notification display
- click → open/focus `/review`
- badge count where supported
- network-only fetches to avoid stale authenticated pages/JS

Security caveat: the currently deployed Supabase Edge Function was initially deployed with VAPID key material inside function source. Do **not** copy any private VAPID key into repo/docs/client code. Prefer moving private key material to Supabase function secrets/environment in a future hardening pass if connector/tooling permits.

## 13. PWA / installed icon

Ordly is installable on iOS and desktop.

The installed app icon is intentionally separate from the in-app logo.

- In-app Brand icon should remain as it is unless explicitly requested.
- Current visual: premium purple gradient, full-bleed square (iOS and Android apply their own rounded mask), with a filled white/lavender open book inside the maskable safe zone.
- The Danish flag was explicitly removed. Do not re-add it.
- Single source: `branding/ordly-icon.svg`. `node scripts/render-icons.mjs` renders every PNG in `public/` (180, 192, 512, 1024) at 4× and downsamples, so edges are anti-aliased. Never hand-export or aliased-rasterize an icon again. That is what made the Home Screen icon look pixelated.
- URLs come from `lib/app-icon.ts`. After re-rendering, bump `APP_ICON_VERSION` there and the matching `?v=` in `public/sw.js`.
- `/api/pwa-icon` only 308-redirects old installs to the static PNGs.
- The manifest is `app/manifest.webmanifest/route.ts`, linked by hand in `app/layout.tsx` with `crossOrigin="use-credentials"`. Production is behind Vercel Deployment Protection, and a manifest fetched without cookies is redirected to Vercel's login, which silently freezes installed-app icons and names. Do not switch back to `app/manifest.ts` or `metadata.manifest`: both emit a link without credentials.

On iOS, Home Screen icons are aggressively cached. To verify icon changes, deleting Ordly from Home Screen and re-adding it may be required.

## 14. PWA updates / stale client prevention

The user previously saw old review behavior after a successful deployment because an already-open installed PWA kept an old JS bundle.

`components/PwaRegistration.tsx` registers `/sw.js` with `updateViaCache: 'none'`, checks for updates regularly, and the service worker claims/reloads clients on activation.

Preserve the network-first/no-app-cache strategy unless intentionally redesigning offline behavior. Avoid caching authenticated HTML/API/old JS without a deliberate versioning plan.

## 15. Settings

Settings currently include:

- translation language
- Danish level
- new words per day (1–50)
- notification controls/schedule
- FSRS scheduling explanation

The Save settings button spacing was specifically fixed after repeated complaints; do not remove its outer padding/margin.

## 16. Performance expectations

The user is sensitive to perceived latency (~1 second page switches were considered too slow).

Principles already used:

- prefetch navigation
- show route-loading feedback rather than appearing frozen
- run independent data calls in parallel
- avoid serial server round-trips where possible
- service worker remains network-first so stale app bundles do not mask fixes

Maintain this performance-first approach.

## 17. Styling / responsive expectations

**Visual identity — `docs/visual-identity.md`.** Read it before writing CSS, adding or restyling a component, or choosing a colour, size, radius or motion value. It is the single source of truth for how Ordly should look; this section only records history.

Mobile screenshots drive a lot of changes. Check narrow iPhone layouts after UI work.

Known past issues:

- Add-word action row overflow on phone
- bottom nav responsiveness/lag
- Save settings button touching card edges
- low-quality PWA icon edges
- browser-native tooltip styling
- duplicate Review/Words nav icons

## 18. Current handoff state (2026-09-03)

Most recent functional change before this documentation:

- phrase/sentence-aware Danish form checking landed (`Base form` / `Normalize phrase` / `Check sentence`)
- Vercel reported success for that exact commit
- the `⌘ Enter` hint has now been visually moved below the Save button via `composer-shortcuts.css`

At the start of the next session, do this before assuming anything:

1. Read this `AGENTS.md`.
2. Inspect `git log` / latest `main` SHA.
3. Check the latest GitHub Actions build result.
4. Check Vercel status for the same SHA.
5. If modifying Supabase, list current migrations/tables/functions first because production has been actively evolved during this project.

## 19. Strong user preferences / do-not-regress list

- Do not make the user re-explain existing product behavior if the repo/docs answer it.
- Do not ask unnecessary clarifying questions; inspect code and proceed when intent is clear.
- Do not claim deployment success without evidence.
- Do not bring back folders/tags or heavy gamification.
- Do not call a model from the app or its API routes (§27).
- Do not base-form complete sentences.
- Do not use spelling-based Danish→Cyrillic transliteration as pronunciation.
- Do not write or serve a pronunciation that mixes Latin letters into Cyrillic (§22).
- Do not make `Again` require leaving/re-entering Review.
- Do not make Review and Material use the same nav icon.
- Do not bring back per-word icons or a timed practice autosave (it disabled the answer field mid-typing). Listening practice is allowed again (decided 2026-09-26), but only from prerecorded Azure Speech audio made offline and checked by speech recognition. Never synthesize speech at runtime or use the device voice.
- Do not re-add a Danish flag to the installed app icon.
- Do not let Practice write Review cards, logs, status, streaks, coverage or Material, or call a model (§21).
- Do not expose private keys/secrets.

If the next agent follows this file plus the current code, it should be able to continue without needing the user to reconstruct the previous session.

## 20. Meaning model (senses, synonyms, interactive practice)

The design is `docs/meaning-model-plan.md` (decisions D1–D18). Read it before touching senses, links or practice planning. The load-bearing rules:

- `vocabulary_entries.senses` is the source of meaning. `translation` is a denormalized join maintained by the BEFORE trigger `vocabulary_sync_senses`. Legacy writers may still write `translation` alone, and the trigger re-derives senses from it. Sentence translations are never comma-split.
- Sense ids are permanent. Regeneration goes through `mergeSenses` (`lib/sense-merge.ts`), and vanished senses are soft-deleted with `removed_at`. Practice objectives are keyed `entry:<id>:sense:<sid>`, so a new id silently strands FSRS state.
- A sense objective's version (`senseContentVersion`) covers only the Danish, the sense id and that sense's text. `entryContentVersion` ignores `source: 'user'` senses. Do not widen either, or unrelated edits will reset schedules.
- Coverage (`recognized`, `produced`, `last_seen`) is Review evidence, written only through `record_sense_coverage(review_log_id, …)` right after a Review rating. The routine takes the entry from that log and refuses unless the log is the caller's own, from the last ten minutes, and a success. Practice never creates a Review log, so it cannot reach it (§21). The trigger carries coverage forward monotonically, so a stale editor save cannot roll it back.
- `entry_links`: symmetric kinds are stored once with `a_id < b_id`. Discovery (a model call) is removed (§27); the rules below describe how the stored edges were made and still bind every reader. Dismissing a suggestion writes a tombstone (`dismissed_at`, `source: 'user'`). Every reader that shows, grades or teaches must filter `dismissed_at is null`. Distractors use confirmed edges only.
- Discovery answers in the learner's own translation language, read server-side from `profiles.default_translation_language`. This is load-bearing, not cosmetic: left to itself the model glosses into English, and English merges meanings the learner's language keeps apart — `bare` ("только") was linked to `lige` ("только что") under the English concept "just now", because English "just" spans both. `conceptMatchesSenseScript` drops any edge whose concept is written in a different script from the senses.
- Whether two meanings are the same is decided **deterministically, before any AI call** — the model is the last filter, never the only one. Three rules in `lib/synonyms.ts`, each written from a real bad edge:
  - a sense is split on commas into alternatives first (`трудно, сложно` is two wordings, not a phrase), and wordings are compared one to one;
  - a **narrowed** meaning is not a shared one: when one wording's tokens properly contain the other's, the pair is dropped and never costs an AI call (`только` vs `только что`, `ещё` vs `всё ещё`);
  - an overlap resting only on tokens shorter than `MIN_MEANINGFUL_TOKEN` is noise (`получать в качестве` vs `иметь в виду` share only `в`).
- The concept the model names must be a meaning **both** entries carry (`conceptSharedBySenses`). Requiring it to come from the pair was not enough: the model picked whichever side read better and answered `только что` for a word that only means `только`.
- An edge is about **one meaning**, and `entry_links.concept` names it. Discovery ranks sense *pairs* and asks the model to rule on the single pair that matched, not on two entries' full meaning lists; an edge whose concept the model will not name is dropped. Keep both halves — judging entries as bags of meanings made `kun` ("только") a synonym of `lige`, whose third sense is "только что". `STOP_WORDS` in `lib/synonyms.ts` is a search-selectivity tool only: stripping it when *comparing* meanings is what made those two identical, so comparison keeps every word.
- Phase-1 migrated senses are `source: 'split'` with no part of speech. The model refinement that classified them is removed (§27); the learner sets part of speech and gender by hand, and the composer still fills a noun's gender from COR on save (§22).

## 21. Practice (issue #13)

Review is the default and the only measure of retention (`docs/adr/0002-review-owns-retention.md`). Practice at `/review/practice` is optional, has no runtime AI (`docs/adr/0001-practice-without-runtime-ai.md`), and writes nothing but its own session and internal attempts.

- **Start.** The learner picks 5, 10, 20 or a custom 1–30 minutes every time (default 10, never auto-starts). `planPractice` (`lib/practice-planner.ts`) adds targets until the queue's estimated seconds reach the target. If saved Material cannot fill it, nothing is saved and the API returns a `shortfall`: the learner takes the shorter session, or goes to Review when nothing can be built.
- **Targets** are senses of the learner's own saved entries, keyed `entry:<id>:sense:<sid>`. `lib/practice-targets.ts` reads the Review card and past practice attempts to pick targets and a ladder rung; it never writes either. Each target gets two bounded exercises: `pick`, `choose`, `assemble`, `sense` (tapped) and `cloze`, `produce` (typed).
- **Grading** is `lib/practice-grading.ts`, deterministic and offline. Empty answer is `dont_know`. A typed sentence that differs from the saved one is `unverified`, never wrong on a guess. An unverified or wrong typed answer can be reported (**My answer is also correct**): the attempt then carries `reported: true` and the wording, for later content review, and nothing else changes. No other attempt stores the typed answer. The saved base form in an inflected gap is wrong, checked before typo tolerance.
- **Session contract** is version 2 (`lib/practice.ts`): seed, queue, target minutes, content revision, locale, cursor (`completed`), active time and the unsent `draft`. Pause (also on `visibilitychange`) saves the draft; resume shows the same exercise and text. Time counts only while running, one stretch at most ten minutes. The target is checked only on `next`, so the current answer is never cut off; past it the queue empties and the learner finishes.
- **Isolation is enforced in the database too** (`20260924170000_isolate_practice_from_review.sql`). `commit_practice` refuses a non-null `legacy_change` (42501) and any session that is not version 2 (22023), ignores `next_objectives`, and no longer touches the streak. The session check is `NOT VALID` on version 2, so a stored version-1 row stays but none can be written again; the app shows it as retired. The old `record_sense_coverage(uuid, …)` is dropped. Historical Review rows are left as they are.
- Practice no longer appends `source: 'user'` senses, fills saved examples, generates memory aids, or records coverage. `practice_state.objectives` and `practice_packs` are kept as stored but never read, returned or written.
- **Ten formats (issue #15).** choice `pick`, drag-gap `choose`, order `assemble`, type `cloze`/`produce`, binary, odd-one-out `odd`, category-sort `sort`, match, dialogue, flash-reveal `flash`. The table and builders are in `lib/practice.ts` and `lib/practice-formats.ts`. Each builder returns null without safe content, so an ambiguous board is never offered:
  - binary's false claim is never a meaning of the word;
  - match skips meanings that contain one another;
  - sort and odd-one-out use only nouns with a recorded gender (a noun without one is never placed);
  - dialogue needs the headword in Material and a situation in the learner language;
  - boards (match, sort, odd, dialogue) are built only from targets already met, at most 40% of the queue, spaced apart.
- Drag-gap, order, sort and match are **tap-based**: tap a tile, then its place. There is no drag gesture to fail on a phone or with a keyboard.
- **Grading contract** (`lib/practice-grading.ts`):
  - `accepted` lists the prepared alternatives, so a second reply or word order counts. Word order ignores the case and punctuation a tile carries.
  - `alternativeOrders` (`lib/practice-exercises.ts`) adds the one rule-made order: a simple main clause opened by a subject-only pronoun and ending in a known time phrase also accepts the fronted order (`Jeg arbejder i dag.` → `I dag arbejder jeg.`). Anything with a comma, a question, a conjunction or a noun subject gets no alternative.
  - A typed gap or produced word marks any other verified form of the word (`forms`, COR/DDO rows of `word_forms`) as `wrong_form` before typo tolerance, and so does a misspelling at least as close to another form as to the expected one.
  - Sort and match grade each word and store `targets` on the attempt; `attemptOutcomes` spreads them for selection.
  - Flash-reveal records `self_known`/`self_unknown` with `assistance: 'self'`, weighted lowest (0.25), never checked. **I don't know** on any other format, including a whole board, is `dont_know` for every word on it.
  - Retired dialogue attempts that carry a `rating` keep their typed weight.
  - Feedback is a code (`PracticeFeedbackCode`) worded by `lib/practice-i18n.ts` in English, Russian or Ukrainian, following the current learner language. Stored English sentences from older sessions still show.
- The dialogue pilot is `lib/practice-pilot.ts`: ten exchanges, English, Russian and Ukrainian situations, provenance `dialogue-pilot-2026-09-25`. The session seed derives from the user and the saved revision, so a shortfall offer and its acceptance plan the same session.
- Tests: `lib/practice-session.test.mjs` (session boundary, legacy payloads, a journey through all ten formats), `lib/practice-formats.test.mjs` (builder safety, per-format grading), `supabase/tests/guided_practice.sql` (database boundary), `supabase/tests/practice-server.mjs` (real SQL through PostgREST; see `docs/guided-practice.md`).

## 22. Free data instead of a model (COR, spelling, write-time checks)

Issue #5. The research, with every measurement and its source, is `docs/free-data-sources.md`.
Read it before "optimising" anything here — several obvious-looking ideas were measured and
rejected, and the reasons are in the doc.

**The point is correctness.** Gender is a recorded fact, not a guess, and bad data stops entering
the database. Everything here is deterministic and stays after the runtime AI removal (§27).

### COR — `public.cor_form`, read only through `lib/cor.ts`

Det Centrale Ordregister v1.5.1.0, CC0-1.0, normering `N` only: 317,102 rows over 247,527
inflected forms, so `gulvet` resolves to `gulv` and `dovne` to `doven` without lemmatising
anything. Loaded by `scripts/import-cor.ts`, never bundled — 19 MB parsed per cold start is
exactly the critical-path cost §16 warns about.

The load-bearing rules:

- **Filter candidates by the sense's part of speech before reading a gender.** A bare form lookup
  silently writes wrong data: 35% of forms are ambiguous, `ved` ("knows", "near") is also the noun
  *wood*, `tage` ("take") is also *roofs*. Only 12 of the vocabulary's 32 nouns are safe without
  the filter; with it, 30 are, and a spot-check was 14/14 correct.
- **Silence beats a guess.** No part of speech to filter with, or filtered candidates that
  disagree (`plan`, `alt` are genuinely both genders), means no gender is written at all.
- `lib/cor.ts` is the only module that knows COR's tag format. Nothing else may parse a tag.

Where it is used:

- **Every single word is checked against the register before it can be saved.** A word COR does
  not know, and a word that is not its dictionary form, both stop the save with a proposal in the
  Danish field's correction box and an amber toast saying why (`verifyDanishBeforeSave`). The
  base-form half needs a part of speech to be sure: an entry whose meanings are still
  unclassified is only corrected when the form is nowhere a lemma, because `dovne` cannot be
  told from `dovne` without knowing which one the card is about. Pressing Save
  again keeps the text exactly as typed — the register is missing a few real forms and knows no
  proper nouns, so the check warns and proposes, and never traps. Phrases and sentences are not
  judged by anything.
- `corBaseForm` is the rule behind it, and **the part of speech filters before the question is
  asked**. `dovne` is the plural adjective of `doven` *and* a verb in its own right; `alt` is a
  lemma as an adverb but an inflection of `al` as the pronoun. Only the card's own word class
  says which reading is being judged. It proposes nothing when the form is already a lemma in
  that reading, when the readings disagree (`ved` is really two words), or when the lemma is
  multi-word (`nogensinde` → `nogen sinde`).
- The vocabulary was brought to base form in one pass on 2026-09-18 (19 entries, directly in the
  table). Meanings that described the old form moved with it — `mennesker`/"люди" became
  `menneske`/"человек" — and a stale pronunciation was cleared rather than left describing a word
  that is no longer there. Four entries were deliberately left: `nogle` (its lemma `nogen` is
  already a separate card), `nogensinde`, `ved` (two words in one card — worth splitting), and
  `yndlings` (not in the register at all).
- The composer fills a missing noun gender on save, so `Grammar` is not something the learner has
  to press for a fact. A noun's gender is **shown as the word**: `gulv` is displayed as `gulvet`
  with the article tinted (`components/DefiniteNoun.tsx`, `--article`), on the Material list and
  in the entry header. The definite form is read from COR, never built by appending an article —
  `menneske` becomes `mennesket`, and `skulder` becomes `skulderen`. That is also the only thing that revisits an **already classified** sense:
  the refinement queue is `'split'`-only, so a noun sense left with a null gender by an earlier
  model pass is filled the next time the entry is saved, not by a page view. Nothing is in that
  state today — all 23 noun senses carry a gender, and all 22 COR can rule on agree with it.

### Write-time checks

- A pronunciation that mixes Latin letters into Cyrillic is rejected on write and treated as a
  miss on read (`isReadableCyrillic`). 13% of cached values carried an invisible homoglyph;
  `20260918092106_repair_mixed_script_pronunciations.sql` cleaned up what was already stored.

### Spelling — `lib/spelling.ts`

`nspell` over `dictionary-da` (used under its **MPL-1.1** arm), built lazily once per server
instance because construction costs ~571 ms and ~126 MB. The dictionary's Hunspell morphological
fields are stripped first — without that it flags 12.2% of the real vocabulary, `blive` and
`hvem` included. `dictionary-da` stays in `serverExternalPackages`, or it cannot find its own data
files. It is a **fast path and never a gate**: it catches orthography, while the wrong form of a
real word and correct-but-unnatural Danish are not caught by it. The composer calls
`/api/danish/spell` while the learner types. `findMisspellings` returns `null`, not `[]`, when the dictionary could not be
built — an empty list means "every word is spelled correctly", and no caller may claim that on
behalf of a check that never ran.

## 23. The word catalog (issue #6)

The plan is issue #6; the runbook is `docs/catalog-build.md`. Read one of them before touching
anything here. The shape:

- **Three layers, and only the middle one is a model.** Layer 1 looks facts up (frequency rank
  from the DSL lemma list, part of speech/gender/inflections from COR, IPA from the kaikki.org
  Wiktionary extract). Layer 2 writes what no source can answer: Russian meanings, examples, and
  the Cyrillic reading **of the supplied IPA**. Layer 3 rejects, deterministically, anything that
  contradicts layer 1. The generator is therefore swappable — Claude, ChatGPT, a cheap API model —
  and the quality does not depend on who wrote a row.
- **A field a source cannot settle stays null, and null travels.** `ved` reaches the generator
  with no part of speech because the register reads it two ways. A lemma with no IPA must be
  generated with a null pronunciation; `word_catalog_pronunciation_needs_ipa` enforces it in the
  table. This is §22's "silence beats a guess", applied to ten thousand rows at once.
- **IPA does not come from DDO.** §8 describes a DDO/Wiktionary lookup that the code has never
  had: `resolvePronunciation` asks a model directly and stores `ipa: ''`. Ten thousand DDO fetches
  would be thirty thousand requests against a dictionary with no API, so the catalog uses the
  kaikki.org extract — the same Wiktionary phonetics as one file, joined offline, part-of-speech
  tagged.
- **Audio is Azure Speech, words and phrases alike** (issue #16). `scripts/synthesize-audio.ts`
  speaks every catalog headword and phrase and every saved word or phrase with the Danish neural
  voice `da-DK-ChristelNeural` (`AZURE_SPEECH_RATE`), checks each clip with Danish speech
  recognition (a clip not heard as written is redone with `da-DK-JeppeNeural`, and a remaining
  mismatch is judged by DeepSeek as homophone or problem), and stores it as
  `word-audio/words/<slug>-<digest>-azure.mp3`. Sentences get no recording. A phrase is spoken
  whole, never stitched from word recordings (citation forms are wrong and Danish reshapes phrase
  boundaries). The former DDO website recordings, for which no rights check exists, live only in
  `word-audio/legacy/ddo/` (`catalog/legacy/ddo-audio-keys.json`) and are not used by the app.
  A missing recording never blocks a row; the button simply does not render.
- **Phrase pronunciation (issue #28).** No source transcribes a phrase, so its IPA is Wiktionary's for the whole phrase or each word's recorded IPA joined (`ipa_source = 'components'`); a phrase with a word nobody transcribes gets no hint. The stress is a rule, not the model's: `phraseStressIndex` (particle verb → particle, prepositional or reflexive verb → verb, otherwise the last content word) and `placePhraseStress`; `pronunciationProblems` gates it. The reviewers do not judge hints (they disputed the given stress and asked for sounds Cyrillic cannot write); the auditor reads every one.
- **`word_catalog` / `word_catalog_sense` are reference data**, like `cor_form`: no `user_id`,
  read-only to the app, and **loaded by a script, never by a migration**. An environment with no
  catalog misses every lookup, and every entry is then manual (§27).
- **Unlocking copies; it never references.** The catalog's `sense_id` is carried into the entry
  verbatim, because practice objectives are keyed `entry:<id>:sense:<sid>` and a fresh id strands
  FSRS state (§20). `vocabulary_entries.catalog_lemma` is provenance only — nothing reads the
  catalog to render or grade an entry.
- **A tap fills the composer; it does not save.** §7's preview-before-apply rule still holds, and
  every field stays editable.
- **`locked` senses.** A word arrives with every meaning it has and teaches only the one the
  learner met. `activeSenses` filters locked meanings in TypeScript and
  `private.translation_from_senses` filters them in SQL, so one cannot leak into grading from
  either side. A sense with no `locked` key is not locked, so every pre-catalog row is unaffected.
- **A miss is manual entry** (§27). It is told to the learner rather than hidden, and a phrase
  miss says something different from a rare-word miss.
- **The audit samples by stratum, not uniformly** (`scripts/audit-catalog.ts`). It exists for the
  residue the gate cannot see — a translation that is plausible and wrong passes every validator.
  It reports rates per failure class with a margin, never a per-row certificate, and it is seeded
  so a sample can be redrawn. Pronunciation is the class to trust least when a model audits a
  model.
- **Audio.** Words and phrases carry one play button when a recording exists. Listening practice
  was removed earlier, when the only voice was the device's. On 2026-09-26 it was allowed again, now
  that every clip is Azure Speech, made offline and checked by Danish speech recognition. A
  listening exercise may only use a stored, verified recording; a missing recording means the
  exercise is not offered, never a runtime voice.

## 24. Catalog headwords and learner languages (issue #14)

- **One sense, one id, several wordings.** `word_catalog_sense` is keyed `(lemma, kind, sense_id, lang)`. An English row reuses the Russian row's `sense_id`, and the trigger `word_catalog_sense_locale_consistent` refuses a language row whose ordinal, part of speech or gender differs from its siblings. Never mint a new id for a translation: saved entries and practice history hang off it.
- **Wordings are loaded by script.** `scripts/import-catalog-locale.ts <file> [--sql]` validates a locale file (`lib/catalog-locale.ts`: script matches the language, provenance present, example with translation) and upserts only onto senses that already exist in another language. The first file is `catalog/locale-pilot.en.json` (57 senses, 37 words), provenance `locale-pilot-en-2026-09-25`.
- **Missing wording is named, never substituted.** `parseCatalogEntry(row, lang)` returns the senses supplied in the learner language plus a `missing` list. The composer counts missing meanings and can still unlock the headword, pronunciation, audio and forms for the learner's own meaning. The entry-level `word_catalog.example_translation` is Russian-only data and is used only for a Russian learner.
- **Encountered forms.** The composer saves the headword (`gulvet` → `gulv`); the verified forms are copied by `private.copy_catalog_forms`. `encounteredFormOf` claims the typed form as one of the word's forms only when the verified paradigm contains it.
- **A catalog word already in Material is never saved twice.** On Save, a catalog draft calls `findSavedCatalogWord` (same `catalog_lemma` first, then the headword, then any verified form such as a manual `gulvet`; a failed read stops the save rather than reading as "not saved"). `catalogMerge`/`addCatalogMeaning` then report the meaning as already saved, or add it to the saved entry, recomputed from the current draft and conditional on `updated_at`. A locked or removed copy is restored with the learner-language wording under its own id. A manual headword also gains `catalog_lemma`, which copies its verified forms. No second entry, card or history. The manual "Add another meaning" path is unchanged for non-catalog text.
- `catalogLookupText` keeps a phrase whole; `corLookupForm` deliberately refuses anything with a space.
- **Phrase forms (issue #28).** A verb phrase records its forms in `word_catalog_form` with `kind = 'phrase'`: the head verb's COR paradigm with the other words fixed and `sig` expanded, plus a split form after each finite head, written with one spaced ellipsis (`står … op`). `lookupCatalog` asks the headword and the form table at once, so `stod op`, `står … op` and `står ... op` all find `stå op`, and the headword is saved. A compound tense (`er stået op`) is found through its participle form; the auxiliary is not recorded, so it is never claimed as a verified form. `private.copy_catalog_forms` copies a phrase's forms into the entry (a lemma with a space reads the phrase rows), so Practice gaps a phrase in a verified contiguous form (`findInSentence` with the forms) and grades its other forms as the wrong form. A split form is never one gap. `inferDanishInputKind` calls text with an inner gap a phrase.
- A learner-language switch updates `profiles` only. Saved meanings, Review and practice are untouched; only the wording offered from the catalog changes.

## 25. Content through B2: English wording, sentence families, coverage (issue #16)

The runbook and progress log are `docs/content-population.md`; the published numbers are
`docs/content-coverage-report.md`. The rules that bind future changes:

- **Every catalog sense has an English wording** (`catalog/locale-en.json`, loaded by
  `scripts/import-catalog-locale.ts`). A wording pass may only add wording: `lib/catalog-locale-pass.ts`
  refuses a reply that changes a sense's id, ordinal, part of speech, gender or Danish example.
- **Sentence families** (`lib/catalog-families.ts`, tables `catalog_sentence_family` /
  `catalog_sentence_variant`) teach one catalog sense in one context. The frame and slots record
  what varies; **every allowed combination is an explicit variant** with its own verified target
  form and its own English and Russian translation. Nothing is recombined at runtime, and the
  distinct-sentence count is the number of variants, never a Cartesian product.
- **The family gate** (`scripts/check-family-batches.ts`) checks the target against verified
  forms (DSL's DDO full-form list, COR), slot constraints, spelling, article/gender agreement,
  alternative orders (same words only), the A1–B2 matrix cell, the word's level floor, and overlap
  with the frozen benchmark. A failure is quarantined in `needs_review.jsonl`; a batch below 95%
  publishes nothing. Only `published.jsonl` is imported (`scripts/import-catalog-families.ts`),
  and its cleanup refuses to run unless the whole snapshot is loaded.
- **The benchmark is frozen.** `catalog/benchmark/unseen-tatoeba.tsv` was committed before any
  family existed. Do not tune content against it and do not add its sentences to the catalog.
- **Practice reads families only for the learner's own saved senses** (`lib/practice-contexts.ts`).
  A catalog sentence is offered only with a translation in the learner language and at most one
  level above theirs. A task built from one records `source: { variantId, version }` and is
  dropped, not graded, if that variant has changed. A failed catalog read leaves Practice on the
  learner's own examples. §19 and §21 still hold: no model call, no Review or Material write.
- **Scripts can run without a linked database**: `CATALOG_COR_TSV` points `scripts/catalog-db.ts`
  at a local copy of COR. In the cloud session, data was loaded through the Supabase MCP tool from
  each importer's `--sql-dir` output.
- **Coverage is three separate measures** (`lib/content-coverage.ts`): weighted lemma coverage
  within DSL `freq-30k-ex` (by band and open/closed class, with credit through a COR headword shown
  separately), coverage of the frozen unseen set, and A1–B2 matrix cells. None of them is a claim
  about a learner's level.

## 26. Interface and content in English, Russian and Ukrainian (issue #24)

- **The learner language is the interface language.** Every string lives in `lib/i18n/{en,ru,uk}.ts`;
  English is the reference and the other two are typed against it (`Messages`), so a missing key
  is a type error. Client components read `useI18n()` (`components/I18nProvider.tsx`); server
  components call `messagesFor(language)`. Practice keeps its own copy in `lib/practice-i18n.ts`.
  `lib/i18n/messages.test.mjs` checks that every key exists in all three, that nothing is left in
  English, and that every Ukrainian string passes the Ukrainian check.
- **Where the language comes from.** Every signed-in page reads the profile in its existing
  parallel batch and passes it to `<AppShell language>`, so there is no extra round trip. That
  provider (`fromProfile`) mirrors it into the `ordly-lang` cookie and `<html lang>`; the root
  layout's provider only reads the cookie, for sign-in and loading frames. API routes word their
  user-facing `error` lines through `interfaceMessages()` (the cookie). Never show a raw database
  or provider error to the learner.
- **Switching** in Settings calls `setLanguage` on the provider (client text changes at once) and
  refreshes the route (server text follows). It writes `profiles` only: Review cards, saved
  meanings and Material are untouched (§24).
- **Ukrainian is a full learner language.** Every catalog sense has a Ukrainian wording
  (`catalog/locale-uk.json`, same sense ids, parts of speech and genders), every sense example
  that English has is translated, and every family variant carries `translations.uk` from the
  overlay `catalog/families/translations-uk.json` (keyed by variant id and pinned to its Danish,
  merged by `scripts/import-catalog-families.ts`; the snapshot itself stays en/ru).
- **Ukrainian vs Russian is checked, not assumed.** Both are Cyrillic, so `lib/ukrainian.ts` rejects
  Russian-only letters (ы э ъ ё), words the Russian Hunspell dictionary knows and the Ukrainian
  one does not, verb meanings not worded as a Ukrainian infinitive, and multi-word text Ukrainian
  cannot read. The dictionaries (`dictionary-uk` GPL-3.0, `dictionary-ru` BSD) are dev
  dependencies for the offline pipeline and tests only (`lib/ukrainian-dictionaries.ts`); the app
  never imports them. `scripts/measure-ukrainian-check.ts` measures it on real catalog text.
- **Pipeline**: `write-locale-work.ts --from-db` → `generate-locale-batch.ts` (DeepSeek words,
  Translator translates, DeepSeek reviews every sentence, `scripts/ukrainian-sentences.ts`) →
  `check-locale-batches.ts --lang uk --merge` → `audit-locale.ts` (seeded, stratified; ≥95% clean
  and no severe finding before loading) → `import-catalog-locale.ts` / `import-catalog-families.ts`.
  Translator pivots through English, so a round trip alone does not catch a mistranslation; the
  reviewer pass exists because of that. Runbook and spend: `docs/content-population.md`.

## 27. No runtime AI; manual entry outside the catalog (issue #25)

- **The running app calls no model.** There is no `app/api/ai/*`, no provider client and no provider
  key in code or environments. `lib/no-runtime-ai.test.mjs` walks every import reachable from
  `app/`, `components/`, `proxy.ts` and the service worker and fails if any of it names a provider,
  its key or an AI route. Deterministic helpers stay: COR (§22), spelling, the answer checker.
- **Paid services are offline only**: DeepSeek (wording, generation, checks), Azure Translator
  (translation) and Azure Speech (audio), from `scripts/` and never from the app. Budget (issue
  #27, revised 2026-09-26): **$170 in total for DeepSeek and Translator** for #27, #28, #29, #30
  and #17, split per issue in `catalog/ledger/budget.json`; money moves between issues only as a
  recorded transfer. **Azure Speech is not used for new content**: `budget.json` lists the paid
  services, and a Speech call is refused (existing recordings stay; new words, phrases and
  sentences get none, so they have no listening task). Every paid call is priced at list price into the committed ledger
  (`catalog/ledger/runs/`, via `scripts/spend-ledger.ts`) against the issue in `CONTENT_ISSUE`; a
  call without an issue is refused. Estimate before every run (`scripts/content-batch.ts
  --estimate`); a run whose estimate does not fit what is left is refused, and a run that reaches
  its issue's allocation or the program total stops. Stop and ask before cumulative program spend
  would pass $170. No other paid provider (Groq, OpenRouter, …) is used. Runbook:
  `docs/content-population.md`, "Corpus expansion pipeline".
- **A catalog miss is manual entry.** The learner fills in everything: headword, part of speech and
  gender (per meaning), every form of the paradigm (a new single word; its forms are saved as
  `word_forms` rows with `source: 'user'`, and edited later in `WordStructure`), meanings, example
  and translation, pronunciation hint. When no forms are typed, COR still records the forms it
  knows.
- **The warning** ("not checked; not used in Practice exercises; Review only") is shown before
  saving and on the word's page, in the interface language. `lib/manual-entry.ts` decides when; it
  mirrors the database rule, and a new entry cannot be saved while the catalog is still being
  asked (`pending`), so the warning cannot be skipped.
- **`vocabulary_entries.unverified`** is owned by the trigger `private.mark_unverified_entry`
  (`20260926090913_unverified_manual_entries.sql`, hardened by
  `20260926091417_unverified_backed_by_text.sql`), never by the client: a new entry is unverified
  unless its `catalog_lemma` names a real catalog row **and** its Danish is that word (the
  headword or one of its catalog forms); an entry whose Danish changes to text no catalog row
  backs becomes unverified, even if a stale lemma is left behind; nothing clears it. SQL test:
  `supabase/tests/unverified_entries.sql`. Rows that existed before are
  `false`, so existing Material — including entries a model filled earlier — keeps its data,
  Review history and place in Practice.
- **Practice excludes unverified entries** entirely (`isReviewOnly` in `lib/practice-planner.ts`):
  never a target, board item or distractor. A shortfall carries `reviewOnly`, and the start screen
  says those entries are left to Review rather than inventing content for them. Review treats them
  like any other entry.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
