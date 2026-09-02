import type { Metadata, Viewport } from 'next'
import { PwaRegistration } from '@/components/PwaRegistration'
import './globals.css'
import './nav.css'
import './pwa.css'
import './responsive.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ordly-sevastian-bahynskyis-projects.vercel.app'),
  title: 'Ordly · Learn Danish words',
  description: 'Fast Danish vocabulary capture and spaced repetition.',
  applicationName: 'Ordly',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/ordly-icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon-v2.png?v=3', type: 'image/png', sizes: '180x180' }],
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
  themeColor: '#f6f5f9',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<PwaRegistration /></body>
    </html>
  )
}
