import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ordly · Learn Danish words',
  description: 'Fast Danish vocabulary capture and spaced repetition.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
