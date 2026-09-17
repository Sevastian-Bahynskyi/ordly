import type { MetadataRoute } from 'next'
import { appIconUrl } from '@/lib/app-icon'

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
        src: appIconUrl(192),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: appIconUrl(512),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: appIconUrl(512),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
