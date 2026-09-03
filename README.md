# Ordly

A personal Danish vocabulary trainer built for frictionless capture and serious spaced repetition.

> Coding agents: read [`AGENTS.md`](./AGENTS.md) before making changes. It contains the current product decisions, architecture, Supabase/Vercel setup, regression-sensitive behavior, and continuation context from the implementation sessions.

## Features

- Manual-first Danish word, phrase, and sentence capture
- Phrase-aware base/normalization and sentence correctness checking
- Optional Groq AI enrichment for pronunciation, translation, example sentence, and sentence translation
- DDO + Wiktionary IPA pronunciation pipeline with deterministic Cyrillic conversion and Groq validation
- Russian, English, or Ukrainian translations
- FSRS scheduling with typed recall and `Again / Hard / Good / Easy` ratings
- AI semantic fallback for valid synonyms during review
- Reversible review ratings and in-session `Again` requeueing
- FSRS recall/stability rings in Review and Words
- Configurable daily new-word limit in Settings, default 10
- Bulk raw import with optional enrichment
- New / Learning / Mastered states
- Installable iOS/desktop PWA with Web Push notifications
- Due-review reminders, occasional word challenges, and per-weekday mandatory study reminders
- One-owner Supabase authentication model
- Responsive mobile and desktop UI

## Stack

Next.js, TypeScript, Supabase, Groq, `ts-fsrs`, Vercel, and Web Push.

## Deployment

Production is Git-connected to Vercel from the `main` branch. GitHub Actions also runs a clean build for each push.

## Environment

Copy `.env.example` to `.env.local` and provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GROQ_API_KEY`
- optionally `GROQ_MODEL`

The Groq key and all other private server credentials must remain server-side.

## Database

Apply the migrations in `supabase/migrations/` in order for a fresh Supabase project. All user-facing public tables use RLS and are scoped to the authenticated owner.
