'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function RouteTransitionFeedback() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setLoading(false)
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [pathname, searchParams])

  useEffect(() => {
    function beginLoading() {
      setLoading(true)
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setLoading(false), 12000)
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const next = new URL(anchor.href, window.location.href)
      const current = new URL(window.location.href)
      if (next.origin !== current.origin) return
      if (next.pathname === current.pathname && next.search === current.search) return
      beginLoading()
    }

    function handlePopState() {
      beginLoading()
    }

    document.addEventListener('click', handleClick, true)
    window.addEventListener('popstate', handlePopState)
    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('popstate', handlePopState)
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!loading) return null

  return (
    <div className="route-loading" role="status" aria-live="polite" aria-label="Loading page">
      <div className="route-loading-card">
        <span className="route-loading-spinner" aria-hidden="true" />
        <div>
          <strong>Loading</strong>
          <span>Getting the next screen ready…</span>
        </div>
      </div>
    </div>
  )
}
