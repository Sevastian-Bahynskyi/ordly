import { NextResponse } from 'next/server'
import { appIconUrl } from '@/lib/app-icon'

/**
 * Kept only for clients that installed Ordly while their manifest or Home Screen pointed here. The
 * icon is now a pre-rendered, anti-aliased static PNG (see lib/app-icon.ts); this sends them to it.
 */
export function GET(request: Request): NextResponse {
  const requested = Number(new URL(request.url).searchParams.get('size'))
  const size = requested === 180 || requested === 192 ? requested : 512
  return NextResponse.redirect(new URL(appIconUrl(size), request.url), 308)
}
