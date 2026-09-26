import type { Metadata, Viewport } from 'next'
import { ComposerKeyboardNavigation } from '@/components/ComposerKeyboardNavigation'
import { I18nProvider } from '@/components/I18nProvider'
import { messagesFor } from '@/lib/i18n'
import { cookieLanguage } from '@/lib/i18n/server'
import { PwaRegistration } from '@/components/PwaRegistration'
import { APP_ICON_VERSION, appIconUrl } from '@/lib/app-icon'
import './globals.css'
import './nav.css'
import './pwa.css'
import './responsive.css'
import './memory.css'
import './words-enhancements.css'
import './word-structure.css'
import './form-tree.css'
import './sentences.css'
import './notifications.css'
import './composer-shortcuts.css'
import './senses.css'
import './entry-editor.css'
import './capture.css'
import './toast.css'
import './streak.css'
import './review-motion.css'
import './review-audio.css'
import './review-feedback.css'
import './review-zen.css'
import './mobile-form-controls.css'
import './practice.css'
import './home-review.css'

const metadata: Metadata = {
  metadataBase: new URL('https://ordly-sevastian-bahynskyis-projects.vercel.app'),
  applicationName: 'Ordly',
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

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = messagesFor(await cookieLanguage())
  return { ...metadata, title: meta.title, description: meta.description }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#7557db',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  // Screens without a profile (sign-in) speak the mirrored preference; AppShell overrides it with
  // the profile's own language on every signed-in page (issue #24).
  const language = await cookieLanguage()
  return (
    <html lang={language}>
      <head>
        {/* Written by hand instead of `metadata.manifest`, for `crossOrigin`. Browsers fetch a manifest
            without cookies by default, and the production host sits behind Vercel Deployment
            Protection, so a cookie-less fetch is redirected to Vercel's login and install/update
            never sees the real manifest or its icons — the installed app kept its old icon. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body><I18nProvider language={language}>{children}</I18nProvider><ComposerKeyboardNavigation /><PwaRegistration /></body>
    </html>
  )
}
