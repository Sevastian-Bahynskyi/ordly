import type { Metadata, Viewport } from 'next'
import { ComposerKeyboardNavigation } from '@/components/ComposerKeyboardNavigation'
import { PwaRegistration } from '@/components/PwaRegistration'
import './globals.css'
import './nav.css'
import './pwa.css'
import './responsive.css'
import './memory.css'
import './words-enhancements.css'
import './notifications.css'
import './composer-shortcuts.css'
import './streak.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ordly-sevastian-bahynskyis-projects.vercel.app'),
  title: 'Ordly · Learn Danish',
  description: 'Fast Danish vocabulary and sentence capture with spaced repetition.',
  applicationName: 'Ordly',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/api/pwa-icon?size=192&v=6', type: 'image/png', sizes: '192x192' },
      { url: '/ordly-icon.svg?v=5', type: 'image/svg+xml' },
    ],
    shortcut: [{ url: '/api/pwa-icon?size=192&v=6', type: 'image/png', sizes: '192x192' }],
    apple: [{ url: '/api/pwa-icon?size=180&v=6', type: 'image/png', sizes: '180x180' }],
    other: [{ rel: 'apple-touch-icon-precomposed', url: '/api/pwa-icon?size=180&v=6' }],
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
      <body>{children}<ComposerKeyboardNavigation /><PwaRegistration /></body>
    </html>
  )
}
