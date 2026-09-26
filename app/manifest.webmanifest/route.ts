import { NextResponse } from 'next/server'
import type { MetadataRoute } from 'next'
import { appIconUrl } from '@/lib/app-icon'
import { interfaceMessages } from '@/lib/i18n/server'

/**
 * The web app manifest, served by a plain route instead of Next's `app/manifest.ts` convention.
 * That convention injects its own `<link rel="manifest">` without `crossorigin`, and browsers fetch
 * such a manifest without cookies. Production sits behind Vercel Deployment Protection, which
 * redirects a cookie-less request to Vercel's login, so installs and app updates never saw the real
 * manifest or its icons. app/layout.tsx links this route with `crossOrigin="use-credentials"`.
 */
const manifest: MetadataRoute.Manifest = {
  // Pinned to the value browsers already derived from start_url, so existing installs keep their identity.
  id: '/',
  short_name: 'Ordly',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#f6f5f9',
  theme_color: '#7557db',
  icons: [
    { src: appIconUrl(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: appIconUrl(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: appIconUrl(512), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

/** Name and description follow the learner language (issue #24); it is fetched with cookies. */
export async function GET(): Promise<NextResponse> {
  const { meta } = await interfaceMessages()
  return NextResponse.json({ ...manifest, name: meta.title, description: meta.description }, {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' },
  })
}
