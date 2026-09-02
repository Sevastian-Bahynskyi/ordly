import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PRODUCTION_SITE_URL = 'https://ordly-sevastian-bahynskyis-projects.vercel.app'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  const destination = process.env.NODE_ENV === 'development' ? origin : PRODUCTION_SITE_URL
  return NextResponse.redirect(`${destination}/`)
}
