'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function VocabularyIconBackfill({ entryIds }: { entryIds: string[] }) {
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
          const response = await fetch('/api/ai/icon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entryId }),
          })
          if (response.ok) changed = true
        } catch {
          // Visual enrichment is best-effort and must never block the page.
        }
      }
      if (!cancelled && changed) router.refresh()
    })()

    return () => { cancelled = true }
  }, [key])

  return null
}
