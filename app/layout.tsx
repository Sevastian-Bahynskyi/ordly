import type { Metadata, Viewport } from 'next'
import { ComposerKeyboardNavigation } from '@/components/ComposerKeyboardNavigation'
import { PwaRegistration } from '@/components/PwaRegistration'
import { APP_ICON_VERSION, appIconUrl } from '@/lib/app-icon'
import './globals.css'
import './nav.css'
import './pwa.css'
import './responsive.css'
import './memory.css'
import './words-enhancements.css'
import './sentences.css'
import './notifications.css'
import './composer-shortcuts.css'
import './composer-actions.css'
import './composer-toggle.css'
import './senses.css'
import './entry-editor.css'
import './synonyms.css'
import './streak.css'
import './review-motion.css'
import './mobile-form-controls.css'
import './practice.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ordly-sevastian-bahynskyis-projects.vercel.app'),
  title: 'Ordly · Learn Danish',
  description: 'Fast Danish vocabulary and sentence capture with spaced repetition.',
  applicationName: 'Ordly',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: appIconUrl(192), type: 'image/png', sizes: '192x192' },
      { url: appIconUrl(512), type: 'image/png', sizes: '512x512' },
      { url: `/ordly-icon.svg?v=${APP_ICON_VERSION}`, type: 'image/svg+xml' },
    ],
    shortcut: [{ url: appIconUrl(192), type: 'image/png', sizes: '192x192' }],
    apple: [{ url: appIconUrl(180), type: 'image/png', sizes: '180x180' }],
    other: [{ rel: 'apple-touch-icon-precomposed', url: appIconUrl(180) }],
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
  maximumScale: 1,
  userScalable: false,
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
