# Guided practice: first release

Implementation of stages 0–1 and basic listening/dialogue from `learning-research-plan.md`.

## User flow

Home → **Practice for 10 minutes**. The first session includes up to three cold production checks on previously reviewed vocabulary. Sessions then combine due retrieval, repair, a small bank of sentence transformations, short everyday exchanges, and retries. AI feedback is explicitly opt-in at the start; memory examples require a separate button. Ordinary Review remains available.

A ten-minute timer offers a stopping point. The active queue is saved on each answer/help/rating and every 15 seconds while practising. Pause, tab hiding, and reloading preserve the queue; unsent text is not saved. A rating updates the queue and its schedule in one transaction. Do not present unfinished steps as cleared reviews.

## Scheduling and evidence

- The existing card/history remains the legacy mixed-exercise schedule. Guided meaning reviews update it without cloning its stability into another direction. Existing ordinary-review rating revision remains unchanged.
- Production objectives start conservatively with their own FSRS state and are admitted only to a small active repertoire. The entire vocabulary backlog is not doubled.
- Again preserves the original objective and requeues in the same session, including the last remaining item. Assisted success is a practice event and schedules an unaided retry. Explicit Again can record a failure. A response that communicates successfully without retrieving the production target earns no production success.
- Exact answer checking precedes optional semantic feedback. Different short words are not accepted by edit distance. Uncertain/provider-failed checks remain ungraded and permit the learner's own rating.
- Events store direction, prompt version, source-content version, assistance, modality, response duration, replay count, and the initial answer timestamp. Delayed evidence excludes teaching, assistance, same-day exposure, and ungraded/spoken self-checks. Existing review timestamps are considered when checking whether an entry was recently exposed.
- New targets are capped at two per guided study day, including new frames. Recent weak recall or a large due queue reduces intake to zero. Ordinary review retains its configured intake limit; opening that separate mode can introduce additional material.
- The timer and task counts are provisional operating rules, not research-derived optimal values or a guarantee of ten minutes for every learner.

## Persistence and security

`practice_state` holds the current resumable session and the small active production repertoire. JSON shapes are versioned and validated. `practice_attempts` is an append-only, owner-scoped evidence stream. `practice_packs` caches separate generated memory aids by target, content revision, translation language, and prompt version.

`commit_practice` is a SECURITY INVOKER RPC with owner RLS, explicit authenticated grants, revision checks, duplicate-event detection, and transactional legacy-card/log updates. No anonymous RPC access. No service-role credential is needed. Generated aids never overwrite vocabulary fields. The migration is additive and keeps old review histories intact.

Set `NEXT_PUBLIC_GUIDED_PRACTICE_ENABLED=false` and rebuild to remove the guided entry points and disable its API. Ordinary reviews and all stored evidence remain intact.

## Verification

- `pnpm test`: answer/cloze safety, planner intake and ordering, assistance rules, delayed evidence, conservative FSRS initialization, persistence/AI shape validation, and existing OpenRouter contracts.
- `pnpm build`: production compilation and route generation. GitHub Build now also runs the test suite.
- `supabase/tests/guided_practice.sql`: run in an isolated disposable database with the repository migrations. Verifies atomic legacy review/log/queue writes, idempotent event submission, stale revision/card rejection, anonymous denial, and cross-owner RLS. It rolls back all test data. Do not run its fixture setup in production.
- `supabase/tests/practice-server.mjs`: exercises the real service against a local PostgREST fixture at `127.0.0.1:54398`. Run with `pnpm exec tsx supabase/tests/practice-server.mjs` after seeding the fixture below. Uses a test-only JWT signed within the script; it cannot point to production.

For the service fixture, use a disposable Supabase Postgres image and PostgREST v14.14. Apply `0001_initial.sql`, `0002_entry_kind.sql`, `0003_review_rating_revision.sql`, `0006_vocabulary_icons.sql`, and the guided-practice migration. The bare Postgres image's `auth.uid()` must support PostgREST's `request.jwt.claims` JSON as well as `request.jwt.claim.sub`. Configure PostgREST's local JWT secret to `ordly-local-validation-secret-32-characters` and its anonymous role to `anon`. Seed only the synthetic account `10000000-0000-4000-8000-000000000001` (`practice-fixture@example.invalid`), then two vocabulary entries (`svært` → `трудно, сложно`; `Jeg arbejder i dag.` → `Я сегодня работаю.`). Set their cards to reps=2, stability=2, difficulty=5, state=2, last_review two days ago, and due now. Start with no practice state or attempts. Reset this disposable fixture before repeating the service test.

Manual acceptance:

1. Start with AI off; answer, reveal, hint, and rate. Verify a helped Good returns for an unaided retry.
2. Pause/reload on a revealed answer and on an unresolved Again. Resume in the same direction.
3. Open the same session twice and submit in both. The stale screen must reload rather than double-advance a card.
4. Try a transformation with an alternative answer and AI off/unavailable. It should offer self-checking, not force failure.
5. Try listening with a Danish voice, then without one. The transcript path should always permit reading practice and exclude the result from unaided listening evidence.
6. Verify narrow iPhone layout, keyboard, audio, background/foreground transitions, and the ten-minute stopping prompt in the installed PWA.

## Remaining evaluation work

The initial frame bank contains four authored situations. Native Danish review, a larger graded curriculum, controlled weekly novel-transfer probes, provider benchmarks, automated speech recognition/pronunciation scoring, and an actual thirty-day outcome study remain later work. The device TTS fallback is not presented as native-validated pronunciation. No audio is recorded or uploaded. This release must not claim A2 attainment or measured fluency gains from its counters.
