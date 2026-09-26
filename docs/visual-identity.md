# Ordly visual identity

Ordly is **quiet**. It is a calm, premium, Apple/Linear-like surface where the one thing the
learner came to do is the loudest thing on the screen, and everything else waits until it is
needed. Every rule here serves that.

The values live in the code, not in this file: design tokens in `:root` at the top of
`app/globals.css`, the newest surface treatment in `app/capture.css`, and the pill system in
`app/senses.css`. Read those for numbers. Read this for the decisions the CSS cannot state.

## Colour

- Take colour from a `:root` token. A screen that needs a colour the tokens lack needs a new
  token, not a hex literal in a component stylesheet.
- Purple marks what the learner can act on. Green confirms, amber cautions, red is failure.
- Tint one element per group. Pills carry their colour in the text and a small dot rather than a
  filled background. When everything is tinted, the tint stops meaning anything.

## Type and touch

- Anything the learner types into renders at 16px. Safari zooms the page on focus below that. A
  `<select>` that must look smaller keeps `font-size: 16px` and sits invisibly over a styled pill
  — `.pill-pos` in `app/senses.css` is the working example.
- Reuse the uppercase, letterspaced 11px treatment (`.eyebrow`, `.capture-section-head`) for every
  section label, so one style means "this is a label" everywhere.
- Give every tappable thing a 44px hit area, even when the ink inside it is 28px tall. `.sense-more`
  and `.pill-grammar` show both halves of this.

## Surfaces

Three depths, and a screen should use as few as it can:

1. **Card** (`.composer-card`, `.section-card`) — the page's one container.
2. **Section** (`.capture-section`, `.capture-hero`) — a group inside the card, one hairline border.
3. **Row** — separated from its neighbours by a hairline, never by its own box.

Nesting a box inside a box inside a box is what made the old editor feel crowded. Prefer a
hairline over a border, and a border over a shadow.

## Motion

- Entrances travel a few pixels and use `cubic-bezier(.22, .8, .2, 1)` over 220–260ms. State
  changes (hover, background) use `ease` over 140–160ms.
- Pair every animation with a `@media (prefers-reduced-motion: reduce)` rule that switches it off.

## Patterns

**Progressive disclosure.** An empty form shows only the field the learner must fill. Everything
else appears once there is something to describe. Secondary controls live behind a `⋯`
(`components/OverflowMenu.tsx`) or a sheet, one tap away.

**One prominent button.** A view gets exactly one filled button — the thing the learner came to do.
Every other action is quiet: soft tint, plain text, or a menu item.

**Toasts** (`components/Toast.tsx`). A toast reports something that already happened, then leaves on
its own. It anchors to the top, because the primary action is pinned to the bottom on a phone and a
transient message must never cover it. An action inside a toast is a shortcut, so whatever it offers
stays reachable somewhere permanent too — the toast is gone in seconds. Anything the learner must
act on belongs in the form, not in a toast.

**Native controls stay native.** Style the wrapper, keep the platform's own picker, keyboard and
wheel underneath.

## Working in this codebase

Add a focused stylesheet for a surface and import it in `app/layout.tsx`, rather than growing
`app/globals.css`. When a redesign strands rules, delete them in the same change — grep the class
name across `components/` and `app/` first, remembering that classes like `pos-${sense.pos}` are
built at runtime and will not appear as literals.

## Before calling a screen done

Check each one:

- Every colour resolves to a `:root` token.
- The view has one filled button.
- Every tappable target measures 44px.
- Each animation has a reduced-motion rule.
- An empty state shows only what must be filled in.
- You have looked at it at 402px wide, not only in a desktop window.
