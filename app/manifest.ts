import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ordly · Learn Danish',
    short_name: 'Ordly',
    description: 'Fast Danish vocabulary and sentence capture with spaced repetition.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f5f9',
    theme_color: '#7557db',
    icons: [
      {
        src: '/icon-192.png?v=5',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png?v=5',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png?v=5',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
