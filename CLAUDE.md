# Ordly

Ordly is a mobile-first Danish learning PWA built with Next.js, TypeScript, Supabase and pnpm. Work autonomously: inspect the real code and docs, implement end to end, run verification, fix failures, and stop only for destructive or genuinely ambiguous decisions.

## Read first

Before meaningful changes, read:

- `AGENTS.md` for architecture, product decisions, Supabase rules and regression-sensitive behavior.
- `CONTEXT.md` for current product terminology and boundaries.
- `docs/visual-identity.md` before any UI or styling work.
- Any issue/spec explicitly referenced by the task.

Do not duplicate these documents here; they are authoritative.

## Working rules

- Use **pnpm**, never npm. Node 20+; repo package manager is pnpm 10.15.0.
- Prefer existing patterns and components over parallel abstractions.
- Preserve deterministic/proven-data paths where they exist; use AI only where the product/spec actually calls for it.
- For Supabase, use migrations and the connected development project. Never expose, commit or print private credentials. Do not perform destructive production operations without explicit approval.
- Keep changes focused. Remove obsolete code when replacing a path rather than leaving dead alternatives.
- For current Next.js behavior, consult the installed Next.js docs as instructed by `AGENTS.md` instead of relying on memory.

## Design

Ordly should feel quiet, premium and mobile-native, closer to Apple/Linear than a gamified language app.

Follow `docs/visual-identity.md` exactly:
- use existing `:root` design tokens, not ad-hoc colors;
- one visually prominent action per view;
- progressive disclosure and minimal nesting;
- 44px touch targets and 16px editable text on mobile;
- restrained motion with reduced-motion support;
- verify UI at **402px width**.

Do not introduce a new design system. Extend the existing Ordly system only when necessary.

## Skills

When project skills are available, use them selectively rather than mechanically:

- `taste` for UI/visual-quality review;
- `domain-modeling` for important data/domain structures;
- `grill-with-docs`, `grilling`, `to-spec`, `to-tickets` only when the task explicitly calls for that planning workflow;
- `implement` for scoped implementation tickets;
- `code-review` before completing substantial changes.

If a named skill is unavailable in the cloud environment, continue using the repository instructions rather than blocking.

## Verification

Before declaring implementation complete, run the checks relevant to the change, normally:

```bash
pnpm test
pnpm lint
pnpm build
```

Fix failures caused by the change. For UI work, also inspect the actual rendered mobile experience. For database work, use disposable/dev validation where possible and follow the Supabase testing rules in `AGENTS.md`.

Do not claim deployment or production success unless the corresponding GitHub/Vercel status for the exact commit confirms it.
