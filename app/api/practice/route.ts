import { guidedPracticeEnabled } from '@/lib/practice-config'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { actOnPractice, PracticeConflict, practiceView, startPractice } from '@/lib/practice-server'
import { parsePracticeRequest } from '@/lib/practice-validation'
import { interfaceMessages } from '@/lib/i18n/server'

export const maxDuration = 60

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(): Promise<NextResponse> {
  const api = (await interfaceMessages()).api
  if (!guidedPracticeEnabled) return NextResponse.json({ error: api.practiceUnavailable }, { status: 503 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: api.unauthorized }, { status: 401 })
  try {
    return NextResponse.json({ ...await practiceView(supabase, user.id), shortfall: null }, { headers: noStore })
  } catch {
    return NextResponse.json({ error: api.practiceLoadFailed }, { status: 503 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const api = (await interfaceMessages()).api
  if (!guidedPracticeEnabled) return NextResponse.json({ error: api.practiceUnavailable }, { status: 503 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: api.unauthorized }, { status: 401 })
  const raw = await request.text()
  if (raw.length > 12000) return NextResponse.json({ error: api.answerTooLong }, { status: 413 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: api.invalidRequest }, { status: 400 }) }
  const parsed = parsePracticeRequest(body)
  if (!parsed) return NextResponse.json({ error: api.invalidPracticeAction }, { status: 400 })
  // An older client still sending Review ratings or AI options. 409 makes it reload the saved
  // session, which also fetches the current app.
  if (parsed.kind === 'retired') return NextResponse.json({ error: api.practiceUpdated }, { status: 409 })
  try {
    const { view, shortfall } = parsed.kind === 'start'
      ? await startPractice(supabase, user.id, parsed)
      : { view: await actOnPractice(supabase, user.id, parsed.action), shortfall: null }
    return NextResponse.json({ ...view, shortfall }, { headers: noStore })
  } catch (error) {
    if (error instanceof PracticeConflict) return NextResponse.json({ error: api.practiceConflict }, { status: 409 })
    return NextResponse.json({ error: api.practiceSaveFailed }, { status: 503 })
  }
}
