import type { Metadata, Viewport } from 'next'
import { PwaRegistration } from '@/components/PwaRegistration'
import './globals.css'
import './nav.css'
import './pwa.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://ordly-sevastian-bahynskyis-projects.vercel.app'),
  title: 'Ordly · Learn Danish words',
  description: 'Fast Danish vocabulary capture and spaced repetition.',
  applicationName: 'Ordly',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/ordly-icon.svg', type: 'image/svg+xml' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Ordly',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#f6f5f9',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<PwaRegistration /></body>
    </html>
  )
}
