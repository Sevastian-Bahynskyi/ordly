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
        src: '/api/pwa-icon?size=192&v=8',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/pwa-icon?size=512&v=8',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/pwa-icon?size=512&v=8',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
