import type { Metadata, Viewport } from 'next'
import { PwaRegistration } from '@/components/PwaRegistration'
import './globals.css'
import './nav.css'
import './pwa.css'
import './responsive.css'

const pwaIcon = '/api/pwa-icon'

export const metadata: Metadata = {
  metadataBase: new URL('https://ordly-sevastian-bahynskyis-projects.vercel.app'),
  title: 'Ordly · Learn Danish',
  description: 'Fast Danish vocabulary and sentence capture with spaced repetition.',
  applicationName: 'Ordly',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: `${pwaIcon}?size=192&v=8`, type: 'image/png', sizes: '192x192' }],
    shortcut: [{ url: `${pwaIcon}?size=192&v=8`, type: 'image/png', sizes: '192x192' }],
    apple: [{ url: `${pwaIcon}?size=180&v=8`, type: 'image/png', sizes: '180x180' }],
    other: [{ rel: 'apple-touch-icon-precomposed', url: `${pwaIcon}?size=180&v=8` }],
  },
  appleWebApp: {
    capable: true,
    title: 'Ordly',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#7557db',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<PwaRegistration /></body>
    </html>
  )
}
