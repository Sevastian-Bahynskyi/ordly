'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, Link2, Loader2, Sparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LINK_KIND_LABELS, type EntryLinkRow, type LinkNeighbour } from '@/lib/entry-links'

/**
 * Linked entries, rendered compactly (D12).
 *
 * The one thing this component exists to get right is D4's honesty requirement: a confirmed
 * edge is a fact, an unconfirmed one is a guess the AI made and nobody has accepted. They are
 * separated by five independent cues, so neither colour-blindness nor a greyscale screenshot
 * can collapse the difference:
 *
 *   1. grouping — suggestions are pushed behind every confirmed chip, under their own label
 *   2. border   — solid versus dashed
 *   3. fill     — filled purple versus a pale, unfilled amber
 *   4. icon     — a link versus a sparkle, plus a literal "?" on the suggestion
 *   5. controls — only a suggestion carries accept and dismiss buttons
 *
 * Confirming writes `source: 'user'`, which is also what makes the edge survive the D17
 * demotion when the entry's Danish is later edited: the learner's judgement outlives the text
 * it was made about.
 */

export type SynonymChipsVariant = 'row' | 'page'

/** How many suggestions a capped surface shows before the rest collapse into "+N". */
const SUGGESTION_CAP = 3

export function SynonymChips({
  neighbours,
  variant = 'row',
  limit,
  onResolved,
}: {
  neighbours: readonly LinkNeighbour[]
  variant?: SynonymChipsVariant
  /** Rows are dense; beyond this the confirmed chips collapse into a "+N" marker. */
  limit?: number
  onResolved: (link: EntryLinkRow, action: 'confirm' | 'dismiss') => void
}): React.JSX.Element | null {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  if (!neighbours.length) return null

  const confirmed = neighbours.filter((neighbour) => neighbour.confirmed)
  const suggested = neighbours.filter((neighbour) => !neighbour.confirmed)
  // The two have separate budgets on purpose. A shared cap would let a well-linked word push
  // its suggestions out of the row, and a suggestion that is never shown is a suggestion the
  // learner can never rule on — which is how an unconfirmed edge quietly becomes permanent.
  const shownConfirmed = confirmed.slice(0, limit ?? confirmed.length)
  const shownSuggested = suggested.slice(0, limit ? SUGGESTION_CAP : suggested.length)
  const hidden = neighbours.length - shownConfirmed.length - shownSuggested.length

  async function resolve(neighbour: LinkNeighbour, action: 'confirm' | 'dismiss'): Promise<void> {
    const key = chipKey(neighbour)
    if (pending) return
    setPending(key)
    setFailed(false)

    const link = neighbour.link
    const match = { a_id: link.a_id, b_id: link.b_id, kind: link.kind }
    const table = createClient().from('entry_links')
    const { error } = action === 'dismiss'
      ? await table.delete().match(match)
      // `source: 'user'` is the load-bearing half: it is what a later edit to the entry's
      // Danish leaves alone when it demotes the AI's own edges (D17).
      : await table.update({ confirmed: true, source: 'user' }).match(match)

    setPending(null)
    if (error) {
      // Never surface the database's own wording.
      setFailed(true)
      return
    }
    onResolved(link, action)
  }

  return (
    <div className={`synonym-chips ${variant}`}>
      {shownConfirmed.map((neighbour) => (
        <Link
          key={chipKey(neighbour)}
          className="synonym-chip confirmed"
          href={`/words/${neighbour.id}`}
          aria-label={`${describe(neighbour)}: ${neighbour.danish}`}
        >
          <Link2 size={11} aria-hidden="true" />
          <span className="synonym-chip-text">{neighbour.danish}</span>
          {variant === 'page' && <em>{describe(neighbour)}</em>}
        </Link>
      ))}

      {shownSuggested.length > 0 && (
        <span className="synonym-suggested-label">
          <Sparkles size={10} aria-hidden="true" /> Suggested
        </span>
      )}

      {shownSuggested.map((neighbour) => {
        const key = chipKey(neighbour)
        const busy = pending === key
        return (
          <span className="synonym-chip unconfirmed" key={key}>
            <Link
              className="synonym-chip-open"
              href={`/words/${neighbour.id}`}
              aria-label={`Open ${neighbour.danish} — suggested ${describe(neighbour).toLowerCase()}, not confirmed`}
            >
              <span className="synonym-chip-mark" aria-hidden="true">?</span>
              <span className="synonym-chip-text">{neighbour.danish}</span>
              {variant === 'page' && <em>{describe(neighbour)}</em>}
            </Link>
            <button
              type="button"
              className="synonym-chip-action confirm"
              disabled={Boolean(pending)}
              aria-label={`Confirm the ${describe(neighbour).toLowerCase()} link to ${neighbour.danish}`}
              onClick={() => void resolve(neighbour, 'confirm')}
            >
              {busy ? <Loader2 className="spin" size={12} /> : <Check size={12} />}
            </button>
            <button
              type="button"
              className="synonym-chip-action dismiss"
              disabled={Boolean(pending)}
              aria-label={`Dismiss the suggested link to ${neighbour.danish}`}
              onClick={() => void resolve(neighbour, 'dismiss')}
            >
              <X size={12} />
            </button>
          </span>
        )
      })}

      {hidden > 0 && <span className="synonym-more">+{hidden}</span>}
      {failed && <span className="synonym-chip-error">Could not update this link. Please try again.</span>}
    </div>
  )
}

function chipKey(neighbour: LinkNeighbour): string {
  return `${neighbour.id}:${neighbour.kind}`
}

/** What this neighbour is, in words — the only cue that survives being read aloud. */
export function describe(neighbour: LinkNeighbour): string {
  if (neighbour.role === 'base') return 'Base form'
  if (neighbour.role === 'inflected') return 'Inflected form'
  return LINK_KIND_LABELS[neighbour.kind]
}
