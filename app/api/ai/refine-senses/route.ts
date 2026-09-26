import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchCorForms } from '@/lib/cor'
import { hasOpenRouterKey, isOpenRouterRateLimitError } from '@/lib/openrouter'
import { applyRefinement, corRefinement, needsRefinement, withCorGender } from '@/lib/sense-refinement'
import { classifySenses, MAX_REFINED_SENSES, MAX_REFINED_SENSE_LENGTH } from '@/lib/sense-refinement-ai'
import { activeSenses, parseSenses } from '@/lib/senses'
import { isUuid } from '@/lib/uuid'
import { interfaceMessages } from '@/lib/i18n/server'

/**
 * Refinement of part of speech, gender and sense boundaries (D11, phase 2).
 *
 * The word register rules first (issue #5 §1). COR's candidates for the entry's form are read
 * once, filtered by part of speech, and:
 *
 * - if they agree on one part of speech, that settles the entry and **no model is called**;
 * - if they do not, the model is asked for the part of speech only, and COR still decides the
 *   gender of every meaning the model called a noun.
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
  const api = (await interfaceMessages()).api
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: api.unauthorized }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}

  try {
    if (record.draft !== undefined) {
      const draft = readDraft(record.draft)
      if (!draft) return NextResponse.json({ error: api.addDanishAndMeaning }, { status: 400 })
      const rows = await fetchCorForms(supabase, draft.danish)
      const settled = corRefinement(rows, draft.senses.length)
      if (settled) return NextResponse.json({ meanings: settled, source: 'cor' })
      if (!hasOpenRouterKey()) return NextResponse.json({ error: api.aiUnavailable }, { status: 503 })
      return NextResponse.json({ meanings: withCorGender(await classifySenses(draft.danish, draft.senses), rows), source: 'ai' })
    }

    if (!isUuid(record.entryId)) return NextResponse.json({ error: api.entryRequired }, { status: 400 })

    // RLS scopes the read and the write to the signed-in owner.
    const { data: entry } = await supabase
      .from('vocabulary_entries')
      .select('id, danish, senses, entry_kind, updated_at')
      .eq('id', record.entryId)
      .maybeSingle()
    if (!entry) return NextResponse.json({ error: api.entryNotFound }, { status: 404 })
    // A sentence has exactly one meaning and no part of speech worth a call.
    if (entry.entry_kind === 'sentence' || !needsRefinement(entry.senses)) return NextResponse.json({ refined: false })

    const stored = parseSenses(entry.senses)
    const live = activeSenses(stored)
    if (live.length > MAX_REFINED_SENSES) return NextResponse.json({ refined: false })

    const rows = await fetchCorForms(supabase, String(entry.danish))
    const settled = corRefinement(rows, live.length)
    if (!settled && !hasOpenRouterKey()) return NextResponse.json({ error: api.aiUnavailable }, { status: 503 })
    const meanings = settled
      ?? withCorGender(await classifySenses(String(entry.danish), live.map((sense) => sense.text.trim().slice(0, MAX_REFINED_SENSE_LENGTH))), rows)

    const { data: written, error } = await supabase
      .from('vocabulary_entries')
      .update({ senses: applyRefinement(stored, meanings, { source: settled ? 'cor' : 'ai' }) })
      .eq('id', entry.id)
      .eq('updated_at', entry.updated_at)
      .select('id')
    if (error) return NextResponse.json({ error: api.couldNotSaveRefined }, { status: 502 })
    return NextResponse.json({ refined: Boolean(written?.length) })
  } catch (error) {
    // The message only: the error object can carry the request, which holds the learner's words.
    console.error('Sense refinement failed', error instanceof Error ? error.message : 'unknown error')
    if (isOpenRouterRateLimitError(error)) return NextResponse.json({ error: api.aiBusy }, { status: 429 })
    return NextResponse.json({ error: api.couldNotRefine }, { status: 502 })
  }
}
