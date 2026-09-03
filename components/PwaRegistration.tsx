'use client'

import { useEffect } from 'react'

export function PwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let interval: number | undefined

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        await registration.update().catch(() => {})
        interval = window.setInterval(() => {
          void registration.update().catch(() => {})
        }, 60_000)
      } catch {
        // PWA support is optional; never block the app if registration fails.
      }
    }

    if (document.readyState === 'complete') void register()
    else window.addEventListener('load', register, { once: true })

    return () => {
      window.removeEventListener('load', register)
      if (interval) window.clearInterval(interval)
    }
  }, [])

  return null
}
