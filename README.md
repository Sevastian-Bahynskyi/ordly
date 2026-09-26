# Ordly

A personal Danish vocabulary trainer built for frictionless capture and serious spaced repetition.

> Coding agents: read [`AGENTS.md`](./AGENTS.md) before making changes. It contains the current product decisions, architecture, Supabase/Vercel setup, regression-sensitive behavior, and continuation context from the implementation sessions.

## Features

- Danish word, phrase, and sentence capture from a prepared catalog: meanings, forms, pronunciation and audio
- Manual entry for anything the catalog does not hold, marked unverified and studied in Review only
- No runtime AI: the running app calls no model. Paid services (DeepSeek, Azure Translator, Azure Speech) are used only by the offline content pipeline in `scripts/`
- Word-register (COR) base-form and spelling checks before a single word is saved
- Russian, English, or Ukrainian interface and translations
- FSRS scheduling with typed recall and `Again / Hard / Good / Easy` ratings
- Reversible review ratings and in-session `Again` requeueing
- FSRS recall/stability rings in Review and Words
- Configurable daily new-word limit in Settings, default 10
- New / Learning / Mastered states
- Installable iOS/desktop PWA with Web Push notifications
- Due-review reminders, occasional word challenges, and per-weekday mandatory study reminders
- Supabase authentication with owner-scoped data per account
- Responsive mobile and desktop UI

## Stack

Next.js, TypeScript, Supabase, `ts-fsrs`, Vercel, and Web Push.

## Deployment

Production is Git-connected to Vercel from the `main` branch. GitHub Actions also runs a clean build for each push.

## Environment

Copy `.env.example` to `.env.local` and provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

GitHub learning-stat exports also require the server-only `GITHUB_APP_PRIVATE_KEY`, plus
`GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_EXPORT_REPOSITORY`, and
`GITHUB_EXPORT_BRANCH`. Never prefix these with `NEXT_PUBLIC_` or commit the private key.

All private server credentials must remain server-side. The app itself needs no model key; the content scripts read their DeepSeek and Azure keys from the shell environment.

## Database

Apply the migrations in `supabase/migrations/` in order for a fresh Supabase project. All user-facing public tables use RLS and are scoped to the authenticated owner.
