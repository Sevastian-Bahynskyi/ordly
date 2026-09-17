'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * On-demand AI refinement of phase-1 split senses (D11), run in the background:
 * the page passes the few entries it is already showing that still need it, they are refined one
 * at a time after render, and the route refreshes once if anything changed. Never blocks the page,
 * and never a mass backfill — an entry is only refined when the learner is looking at it.
 */
export function SenseRefinementBackfill({ entryIds }: { entryIds: string[] }): null {
  const router = useRouter()
  const key = entryIds.join(',')

  useEffect(() => {
    if (!entryIds.length) return
    let cancelled = false

    void (async () => {
      let changed = false
      for (const entryId of entryIds) {
        if (cancelled) return
        try {
          const response = await fetch('/api/ai/refine-senses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entryId }),
          })
          if (!response.ok) continue
          const body: unknown = await response.json()
          if (body && typeof body === 'object' && (body as { refined?: unknown }).refined === true) changed = true
        } catch {
          // Refinement is best-effort metadata and must never block the page.
        }
      }
      if (!cancelled && changed) router.refresh()
    })()

    return () => { cancelled = true }
  }, [key])

  return null
}
