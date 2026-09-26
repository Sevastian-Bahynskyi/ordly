import { NextResponse, type NextRequest } from 'next/server'
import { devSignInTarget, safeNextPath } from '@/lib/dev-sign-in'
import { createClient } from '@/lib/supabase/server'

/**
 * `GET /dev/sign-in?next=/words` on a local dev server: signs in to the test account named in
 * `.env.local` and continues to `next`. Anywhere else it does not exist (404). See lib/dev-sign-in.ts.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const target = devSignInTarget(process.env, request.headers.get('host'))
  if (!target) return new NextResponse(null, { status: 404 })
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(target)
  if (error) return NextResponse.json({ error: 'The dev test account could not sign in; check DEV_SIGN_IN_EMAIL and DEV_SIGN_IN_PASSWORD in .env.local.' }, { status: 401 })
  return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.nextUrl.origin))
}
