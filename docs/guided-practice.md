# Practice: safe standalone session

Issue #13, from the [adaptive practice specification](adaptive-practice-spec.md). Replaces the earlier guided-practice release, which could write Review and call a model. The behaviour summary lives in `AGENTS.md` §21; this file is the runbook for verifying it.

## User flow

Review stays the default. Home and Review each carry a quiet **Practice →** link. Practice asks for a length every time (5, 10, 20 or custom 1–30 minutes, default 10) and starts only when the learner presses **Start practice**. Exercises come from saved Material only. Pause, leaving the app, or reloading keeps the same exercise and whatever was typed. Near the chosen time no new exercise starts; the current one always finishes. If saved Material cannot fill the time, the learner is offered the shorter session, or Review when nothing can be built.

## What Practice writes

Only `practice_state.session` (the version-2 session) and one `practice_attempts` row per finished exercise. An attempt stores the target, entry and sense, exercise kind, result, assistance, response time, content version and learner language. It has no Review rating.

It never writes `review_cards`, `review_logs`, `vocabulary_entries` (status, senses, coverage or examples) or the streak on `profiles`, and it calls no model. `commit_practice` and `record_sense_coverage` enforce this in the database (`20260924170000_isolate_practice_from_review.sql`), so an old client or an old server still sending the retired `legacy_change` payload or a version-1 session is refused.

The migration rewrites no data. Existing Review cards, Review logs with their `previous_card` snapshots, senses, attempts, `practice_state.objectives` and `practice_packs` stay exactly as they are. A stored version-1 session stays a valid row; the app reports it as retired and starts fresh.

Set `NEXT_PUBLIC_GUIDED_PRACTICE_ENABLED=false` and rebuild to remove the entry points and disable the API.

## Verification

- `pnpm test`: session boundary with a recording client (`lib/practice-session.test.mjs`), including legacy payloads; grading, planning, validation.
- `pnpm build`.
- `supabase/tests/guided_practice.sql`: database boundary. Refused `legacy_change`, refused version-1 session, attempt recorded, Review card/logs/entry/streak unchanged, coverage refused without a Review rating, owner scoping, no anonymous access. Rolls back.
- `supabase/tests/meaning_model.sql`: senses and coverage, now rated through Review first.
- `supabase/tests/practice-server.mjs`: the real service through PostgREST. Runs a whole session, pause/resume with a draft, the shortfall offer and the legacy refusals, then checks Review cards, logs, entries and the streak are byte-identical.

All SQL runs against a disposable database only, never production.

### Local fixture

1. Start a throwaway Postgres (a bare PostgreSQL 16 works). Create the roles `anon`, `authenticated` and `service_role`, the schemas `auth`, `extensions`, `storage` and `cron`, a minimal `auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz)`, and `auth.uid()` reading `request.jwt.claim.sub` or the `sub` in `request.jwt.claims`. Stub `cron.schedule`/`cron.unschedule` and `storage.objects(bucket_id, name)`.
2. Apply every file in `supabase/migrations/` in order, skipping the `pg_cron`/`pg_net` `create extension` lines.
3. Run the two `.sql` tests with `psql -v ON_ERROR_STOP=1 -f …`.
4. For the service test, reset the database, apply the migrations, run `supabase/tests/practice-server-seed.sql`, create a login role `authenticator` granted `anon` and `authenticated`, and start PostgREST on `127.0.0.1:54398` with `jwt-secret = "ordly-local-validation-secret-32-characters"` and `db-anon-role = "anon"`. Then `pnpm exec tsx supabase/tests/practice-server.mjs`.

## Manual acceptance (installed iPhone PWA and a 402px browser)

1. Open Practice from Home. Nothing starts until a length is chosen; custom rejects 0 and 31.
2. Type half an answer, leave the app, come back: **Resume practice** shows the same exercise with the text.
3. Answer past the target: the answer is graded, then the session offers **Finish session**.
4. With only one or two saved words, pick 20 minutes: the shorter session is offered.
5. After a session, check Review: due count, rings, new-word count and streak are unchanged.
