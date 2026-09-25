import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findMisspellings } from '@/lib/spelling'
import { interfaceMessages } from '@/lib/i18n/server'

/**
 * Danish spelling, checked against the local dictionary (issue #5 §3).
 *
 * No model, no key, no network — the answer is a dictionary lookup, so the composer can ask while
 * the learner is still typing. It is a hint and never a verdict: `/api/ai/check-example` remains
 * the thing that judges whether a sentence is natural Danish, which is the common failure and the
 * one a spell checker cannot see.
 */

const MAX_LENGTH = 700

export async function POST(request: Request): Promise<NextResponse> {
  const api = (await interfaceMessages()).api
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: api.unauthorized }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const text = typeof record.text === 'string' ? record.text.trim().slice(0, MAX_LENGTH) : ''
  if (!text) return NextResponse.json({ misspelled: [] })

  return NextResponse.json({ misspelled: await findMisspellings(text) || [] })
}
