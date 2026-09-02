# Ordly

A personal Danish vocabulary trainer built for frictionless capture and serious spaced repetition.

## Features

- Manual-first Danish word and phrase capture
- Optional Groq AI enrichment for pronunciation, translation, example sentence, and sentence translation
- Russian, English, or Ukrainian translations
- FSRS scheduling with typed recall and `Again / Hard / Good / Easy` ratings
- Configurable daily new-word limit in Settings, default 10
- Bulk raw import with optional enrichment
- New / Learning / Mastered states
- One-owner Supabase authentication model
- Responsive mobile and desktop UI

## Stack

Next.js, TypeScript, Supabase, Groq, and `ts-fsrs`.

## Deployment

Production is deployed on Vercel from the `main` branch.

## Environment

Copy `.env.example` to `.env.local` and provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GROQ_API_KEY`
- optionally `GROQ_MODEL`

The Groq key must remain server-side.

## Database

Apply `supabase/migrations/0001_initial.sql` to a fresh Supabase project. All public tables use RLS and are scoped to the authenticated owner.
