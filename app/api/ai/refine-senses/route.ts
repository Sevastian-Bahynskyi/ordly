import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasOpenRouterKey, isOpenRouterRateLimitError } from '@/lib/openrouter'
import { applyRefinement, needsRefinement } from '@/lib/sense-refinement'
import { classifySenses, MAX_REFINED_SENSES, MAX_REFINED_SENSE_LENGTH } from '@/lib/sense-refinement-ai'
import { activeSenses, parseSenses } from '@/lib/senses'
import { isUuid } from '@/lib/uuid'

/**
 * AI refinement of part of speech, gender and sense boundaries (D11, phase 2).
 *
 * Two shapes, one prompt:
 *
 * - `{ entryId }` refines a stored entry in place. Used on demand by `SenseRefinementBackfill`,
 *   a few recent entries at a time. Only `'split'` senses are touched, and the translation string
 *   is left byte-for-byte unchanged (see lib/sense-refinement.ts). The write is conditional on
 *   `updated_at`, so an edit made meanwhile simply wins.
 * - `{ draft: { danish, senses } }` classifies unsaved meanings and writes nothing. The entry
 *   editor's per-sense grammar action uses it.
 */

function readDraft(value: unknown): { danish: string; senses: string[] } | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const danish = typeof record.danish === 'string' ? record.danish.trim() : ''
  const senses = Array.isArray(record.senses)
    ? record.senses.filter((text): text is string => typeof text === 'string').map((text) => text.trim().slice(0, MAX_REFINED_SENSE_LENGTH))
    : []
  if (!danish || danish.length > 300 || !senses.length || senses.length > MAX_REFINED_SENSES || senses.some((text) => !text)) return null
  return { danish, senses }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasOpenRouterKey()) return NextResponse.json({ error: 'AI is not configured yet.' }, { status: 503 })

  const body: unknown = await request.json().catch(() => null)
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}

  try {
    if (record.draft !== undefined) {
      const draft = readDraft(record.draft)
      if (!draft) return NextResponse.json({ error: 'Add the Danish text and a meaning first.' }, { status: 400 })
      return NextResponse.json({ meanings: await classifySenses(draft.danish, draft.senses) })
    }

    if (!isUuid(record.entryId)) return NextResponse.json({ error: 'Vocabulary entry is required.' }, { status: 400 })

    // RLS scopes the read and the write to the signed-in owner.
    const { data: entry } = await supabase
      .from('vocabulary_entries')
      .select('id, danish, senses, entry_kind, updated_at')
      .eq('id', record.entryId)
      .maybeSingle()
    if (!entry) return NextResponse.json({ error: 'Vocabulary entry was not found.' }, { status: 404 })
    // A sentence has exactly one meaning and no part of speech worth a call.
    if (entry.entry_kind === 'sentence' || !needsRefinement(entry.senses)) return NextResponse.json({ refined: false })

    const stored = parseSenses(entry.senses)
    const live = activeSenses(stored)
    if (live.length > MAX_REFINED_SENSES) return NextResponse.json({ refined: false })

    const meanings = await classifySenses(String(entry.danish), live.map((sense) => sense.text.trim().slice(0, MAX_REFINED_SENSE_LENGTH)))
    const { data: written, error } = await supabase
      .from('vocabulary_entries')
      .update({ senses: applyRefinement(stored, meanings) })
      .eq('id', entry.id)
      .eq('updated_at', entry.updated_at)
      .select('id')
    if (error) return NextResponse.json({ error: 'Could not save the refined meanings.' }, { status: 502 })
    return NextResponse.json({ refined: Boolean(written?.length) })
  } catch (error) {
    // The message only: the error object can carry the request, which holds the learner's words.
    console.error('Sense refinement failed', error instanceof Error ? error.message : 'unknown error')
    if (isOpenRouterRateLimitError(error)) return NextResponse.json({ error: 'AI is temporarily busy. Please try again shortly.' }, { status: 429 })
    return NextResponse.json({ error: 'Could not refine these meanings.' }, { status: 502 })
  }
}
