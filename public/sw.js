self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim()
    const clients = await self.clients.matchAll({ type: 'window' })
    await Promise.all(clients.map((client) => client.navigate(client.url)))
  })())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() || {}
  } catch {
    payload = { title: 'Ordly', body: event.data?.text() || 'Your Danish review is ready.' }
  }

  const title = payload.title || 'Ordly'
  const options = {
    body: payload.body || 'Your Danish review is ready.',
    icon: '/api/pwa-icon?size=192&v=6',
    badge: '/api/pwa-icon?size=192&v=6',
    tag: payload.tag || 'ordly-review',
    renotify: Boolean(payload.urgent),
    requireInteraction: Boolean(payload.urgent),
    data: { url: payload.url || '/review', kind: payload.kind || 'due' },
  }

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options)
    if (typeof self.registration.setAppBadge === 'function') {
      const count = Number(payload.badge || 0)
      if (count > 0) await self.registration.setAppBadge(count)
      else await self.registration.clearAppBadge?.()
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/review', self.location.origin).href

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if ('focus' in client) {
        await client.navigate(target)
        return client.focus()
      }
    }
    return self.clients.openWindow(target)
  })())
})

// Keep navigation network-first. The service worker exists for installability
// and notifications without caching authenticated pages, API responses, or old JS bundles.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request))
})
