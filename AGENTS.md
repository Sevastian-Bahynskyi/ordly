# Ordly — Agent Handoff / Continuation Guide

This file is written for the next coding agent. Read it before changing Ordly. It captures the product decisions, current architecture, recent fixes, deployment workflow, and regression-sensitive behavior established through the long implementation session ending 2026-09-03.

## 1. Product intent

Ordly is a personal, mobile-first Danish learning PWA. The user wants extremely low-friction capture plus serious spaced repetition, not a gamified language app.

Core product constraints:

- Danish is always the source language.
- Translation language is configurable: Russian (default), English, Ukrainian.
- Danish level is configurable A1–C1; default A1.
- Manual-first entry. AI assists only when explicitly requested.
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
- pnpm `10.15.0`
- Node `>=20`

`pnpm build` is the important verification command. `lint` is currently `tsc --noEmit`.

## 3. Supabase

Production project:

- project ref: `pxnudtcqlmyaelfrdyfp`
- region: `eu-central-1`
- URL: `https://pxnudtcqlmyaelfrdyfp.supabase.co`

The browser Supabase URL/publishable key are intentionally public configuration. `lib/supabase/config.ts` contains safe public fallbacks so the app does not crash if those public Vercel env vars are absent.

Never expose or commit service-role credentials, Groq API keys, or other private secrets.

Important tables/functions currently include:

- `profiles`
- `vocabulary_entries`
- `review_cards`
- `review_logs`
- `review_sentence_cache`
- `pronunciation_cache`
- `push_subscriptions`
- `notification_deliveries`
- private first-account claim / review-card creation / timestamp helpers

RLS is owner-scoped. The app is intentionally personal-only: the first registered account gets access; later accounts are DB-blocked.

Repo migrations currently start at:

- `0001_initial.sql`
- `0002_entry_kind.sql`
- `0003_review_rating_revision.sql`
- `0004_pronunciation_cache.sql`
- notification migration added after those (check `supabase/migrations/` before modifying schema)

Production migrations have already been applied. Keep repo migrations synchronized with production.

## 4. Authentication

Email/password auth through Supabase.

Important historical bug: confirmation links once opened `localhost:3000`. Production auth redirects were corrected; do not reintroduce local callback assumptions.

Auth callback route: `app/auth/callback/route.ts`.

## 5. Main UI structure

Primary tabs:

- Home
- Review
- Words
- Settings

`components/AppNav.tsx` owns bottom navigation. Review and Words intentionally use different icons now: Review uses a repetition/rotate icon; Words keeps a book icon.

Navigation was optimized because the user reported ~1 s perceived lag. There is route transition/loading feedback and navigation prefetching. Preserve the fast-feeling behavior.

Bottom nav is heavily used on iPhone and must remain responsive, animated, and safe-area friendly.

## 6. Add Danish / composer

Main implementation: `components/AddWordComposer.tsx`.

Required fields/behaviors:

- Danish word / phrase / sentence
- simplified Cyrillic pronunciation
- translation
- optional separate example sentence + translated example
- all fields remain manually editable
- mini AI buttons per field
- `Fill missing with AI`
- `Clear`
- Cmd/Ctrl+Enter saves
- duplicate lookup while typing: minimal but noticeable `Already saved · <meaning>` hint
- duplicate save confirmation supports adding another meaning
- successful save notice fades/collapses after about 2.8 seconds

The `⌘ Enter` visual hint must appear **below** the Save button on desktop. The shortcut itself still works globally inside the composer. Mobile CSS may hide the hint.

### Word / phrase / sentence detection

This recently changed and is regression-sensitive.

`lib/entry-kind.ts` now distinguishes UI input kind:

- `word`
- `phrase`
- `sentence`

Stored DB `entry_kind` remains `word | sentence`; phrases are vocabulary entries stored as `word` for existing review behavior.

The AI action beside the Danish input MUST depend on detected input kind:

- one word → `Base form`
- phrase → `Normalize phrase`
- sentence / sentence fragment → `Check sentence`

Endpoint: `app/api/ai/base-form/route.ts`.

Rules:

- Word mode normalizes to dictionary/base form.
- Phrase mode preserves the complete expression and intended meaning. It may normalize an inflected verb/adjective only where appropriate. It must never collapse `helt sikker` or another multi-word phrase to one word.
- There is a defensive server check that rejects a multi-word phrase result if Groq collapses it to a single word.
- Sentence mode DOES NOT base-form words. It checks overall Danish grammar/spelling/word order/agreement/punctuation/naturalness and applies only the smallest correction required.

Do not remove this distinction.

### Sentences and examples

When the input itself is a sentence, a separate example sentence should default OFF. The user may still enable it manually. Translation remains required.

When separate example is OFF:

- the Danish text itself is reviewed directly
- translation remains required
- example fields are cleared/not stored

## 7. AI enrichment behavior

Groq runs server-side only.

Default model fallback: `openai/gpt-oss-20b`.

`GROQ_API_KEY` must remain private/server-side.

AI enrichment should be resilient: pronunciation and other enrichment work were separated so a pronunciation failure does not wipe out translation/example generation. Transient 429/5xx calls retry once where implemented.

When the Danish source text changes after AI filled fields, pressing the full AI action should regenerate stale AI-generated fields for the new source rather than saying everything is already filled.

In the Words list, AI enrichment is preview-first:

1. request enrichment
2. show current vs proposed values
3. allow selecting fields
4. only mutate DB after explicit `Apply selected`

Never silently overwrite row values before confirmation.

## 8. Pronunciation architecture

This area had several failed iterations. Do not regress to "ask the LLM to transliterate Danish spelling".

Goal: simplified Cyrillic text that a Russian speaker can read aloud and get as close as practical to real Danish pronunciation. It is NOT linguistic transliteration.

Current intended pipeline:

1. Check `pronunciation_cache` first.
2. For normal words, query DDO and Wiktionary pronunciation sources in parallel with short timeouts / long revalidation.
3. Choose/compare reliable IPA. Groq acts as a tie-breaker if source confidence is low or sources disagree materially.
4. Convert selected IPA deterministically to a Cyrillic draft.
5. Groq validates/corrects the final Cyrillic **against the authoritative IPA**, not against Danish spelling.
6. Cache final result.

Translation/example generation should run concurrently with pronunciation where possible so `Fill missing` does not serialize unnecessary calls.

Important anchors from user feedback:

- `synes` should be close to `сюнес`, not `сйенс` etc.
- `stadig` should be around `сдэ́эди` / a similarly Russian-readable rendering, NOT `штадик` or `стаади`.
- `selvfølgelig` reduced natural speech is closer to `сэфёли` than spelling-based output.

The source IPA is authoritative. Groq may substantially rewrite the deterministic Cyrillic draft if a Russian reader would otherwise pronounce it incorrectly.

## 9. Words page

Implementation: `components/WordsClient.tsx` + `app/words/page.tsx`.

Features:

- search Danish + translation
- filters: All / New / Learning / Mastered
- raw bulk add
- sequential/bulk enrichment
- per-word AI preview/confirm
- delete
- memory/retrievability ring on each word

Bulk raw/untranslated entries are excluded from review until sufficiently enriched/translated.

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
- deterministic answer checker first
- if deterministic checker rejects a non-empty answer, AI semantic checking can decide whether it is a valid synonym/close meaning
  - example: Russian `тяжело` should be accepted for Danish `svært` when stored answer is `трудно, сложно`
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
- PWA/Home Screen icon is generated at high resolution through the PWA icon route for crisp edges.
- Current visual: premium purple gradient rounded-square + white/lavender open book.
- The Danish flag was explicitly removed. Do not re-add it.

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
- run independent AI/data calls in parallel
- cache pronunciation results
- DDO/Wiktionary lookup in parallel
- avoid Groq unless it adds value
- avoid serial server round-trips where possible
- service worker remains network-first so stale app bundles do not mask fixes

Maintain this performance-first approach.

## 17. Styling / responsive expectations

Mobile screenshots drive a lot of changes. Check narrow iPhone layouts after UI work.

Known past issues:

- Add-word action row overflow on phone
- bottom nav responsiveness/lag
- Save settings button touching card edges
- low-quality PWA icon edges
- browser-native tooltip styling
- duplicate Review/Words nav icons

Prefer dedicated CSS files for focused enhancements rather than destabilizing large global styles when possible.

Current focused styles include files such as:

- `nav.css`
- `pwa.css`
- `responsive.css`
- `memory.css`
- `words-enhancements.css`
- `notifications.css`
- `composer-shortcuts.css`

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
- Do not let AI silently overwrite data where preview/confirmation is expected.
- Do not let phrase normalization collapse expressions to one word.
- Do not base-form complete sentences.
- Do not use spelling-based Danish→Cyrillic transliteration as pronunciation.
- Do not make `Again` require leaving/re-entering Review.
- Do not make Review and Words use the same nav icon.
- Do not re-add a Danish flag to the installed app icon.
- Do not expose private keys/secrets.

If the next agent follows this file plus the current code, it should be able to continue without needing the user to reconstruct the previous session.