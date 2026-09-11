import { guidedPracticeEnabled } from '@/lib/practice-config'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { actOnPractice, PracticeConflict, practiceView, startPractice, type PracticeAction } from '@/lib/practice-server'
import { isRecord } from '@/lib/practice-validation'

export const maxDuration = 60

export async function GET(): Promise<NextResponse> {
  if (!guidedPracticeEnabled) return NextResponse.json({ error: 'Guided practice is currently unavailable.' }, { status: 503 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  try {
    return NextResponse.json(await practiceView(supabase, user.id), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Practice could not be loaded. Your reviews are still available.' }, { status: 503 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!guidedPracticeEnabled) return NextResponse.json({ error: 'Guided practice is currently unavailable.' }, { status: 503 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const raw = await request.text()
  if (raw.length > 12000) return NextResponse.json({ error: 'Answer is too long.' }, { status: 413 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  try {
    if (body.action === 'start' && typeof body.aiEnabled === 'boolean') {
      await startPractice(supabase, user.id, body.aiEnabled)
    } else {
      if (!['answer', 'help', 'rate', 'pause', 'repair'].includes(String(body.action))
        || !Number.isInteger(body.revision) || Number(body.revision) < 0
        || typeof body.taskId !== 'string' || body.taskId.length > 2000
        || (body.answer !== undefined && (typeof body.answer !== 'string' || body.answer.length > 2000))
        || (body.rating !== undefined && body.rating !== null && (typeof body.rating !== 'number' || ![1, 2, 3, 4].includes(body.rating)))
        || (body.action === 'rate' && body.rating === undefined)
        || (body.help !== undefined && !['hint', 'transcript'].includes(String(body.help)))
        || (body.modality !== undefined && !['typed', 'spoken'].includes(String(body.modality)))
        || !['responseMs', 'replays', 'elapsedSeconds'].every((key) => typeof body[key] === 'number' && Number.isFinite(body[key]) && Number(body[key]) >= 0)
        || Number(body.responseMs) > 3600000 || !Number.isInteger(body.replays) || Number(body.replays) > 100 || Number(body.elapsedSeconds) > 86400) {
        return NextResponse.json({ error: 'Invalid practice action.' }, { status: 400 })
      }
      await actOnPractice(supabase, user.id, body as unknown as PracticeAction)
    }
    return NextResponse.json(await practiceView(supabase, user.id), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof PracticeConflict) return NextResponse.json({ error: 'This session changed on another screen. Reload the saved session to continue.' }, { status: 409 })
    return NextResponse.json({ error: 'Could not save this step. Please retry; your saved session is safe.' }, { status: 503 })
  }
}
