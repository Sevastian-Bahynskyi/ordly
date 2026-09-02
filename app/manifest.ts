import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ordly · Learn Danish words',
    short_name: 'Ordly',
    description: 'Fast Danish vocabulary capture and spaced repetition.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f5f9',
    theme_color: '#7557db',
    icons: [
      {
        src: '/ordly-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
