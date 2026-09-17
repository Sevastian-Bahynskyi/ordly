# Ordly

Ordly is a personal, mobile-first Danish learning PWA: Next.js App Router, Supabase, TypeScript,
pnpm. The user runs it as an installed iOS Home Screen app, so a phone is the real target.

Read these before changing anything:

- **`AGENTS.md`** — product decisions, architecture, Supabase schema, AI enrichment, FSRS, the
  do-not-regress list, and the deployment workflow.
- **`docs/visual-identity.md`** — how Ordly should look. Read it before writing CSS, adding or
  restyling a component, or choosing a colour, size, radius or motion value.

`pnpm lint` is `tsc --noEmit` and must stay clean. Verify UI work at 402px wide, not only in a
desktop window.
