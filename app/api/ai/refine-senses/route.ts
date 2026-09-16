import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasOpenRouterKey, isOpenRouterRateLimitError, OPENROUTER_MODEL_ROUTES, openRouterJson } from '@/lib/openrouter'
import { applyRefinement, needsRefinement, parseRefinedMeanings, refinementSchema, type RefinedMeaning } from '@/lib/sense-refinement'
import { activeSenses, parseSenses, PARTS_OF_SPEECH } from '@/lib/senses'
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

const MAX_SENSES = 8
const MAX_SENSE_LENGTH = 120

async function classify(danish: string, texts: readonly string[]): Promise<RefinedMeaning[]> {
  const parsed = await openRouterJson({
    temperature: 0,
    max_tokens: 240,
    messages: [
      {
        role: 'system',
        content: `You classify the meanings of a Danish vocabulary entry for a learner's flashcards.
You receive the Danish entry and a numbered list of its meanings in the learner's language. Some meanings were produced by splitting on commas, so one real meaning may have been broken into adjacent fragments.

Return one object per real meaning:
- indices: the 1-based numbers of the listed items that form this meaning. Usually a single number. Use several ONLY when adjacent items are fragments of one meaning that a comma split apart. Never group two genuinely different meanings, and never group synonyms that each stand on their own.
- pos: the part of speech of the DANISH entry in that meaning, one of: ${PARTS_OF_SPEECH.join(', ')}. Use "phrase" for a multi-word expression with no single head word. Use "" only when you genuinely cannot tell.
- gender: for a noun only, the Danish article "en" or "et". Otherwise "".
Cover every listed item exactly once. Do not translate, rewrite or add meanings.`,
      },
      {
        role: 'user',
        content: `Danish: ${danish}\nMeanings:\n${texts.map((text, index) => `${index + 1}. ${text}`).join('\n')}`,
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'sense_refinement', strict: true, schema: refinementSchema } },
  }, 'sense refinement', { models: OPENROUTER_MODEL_ROUTES.translation, timeoutMs: 10000 })
  return parseRefinedMeanings(parsed, texts.length)
}

function readDraft(value: unknown): { danish: string; senses: string[] } | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const danish = typeof record.danish === 'string' ? record.danish.trim() : ''
  const senses = Array.isArray(record.senses)
    ? record.senses.filter((text): text is string => typeof text === 'string').map((text) => text.trim().slice(0, MAX_SENSE_LENGTH))
    : []
  if (!danish || danish.length > 300 || !senses.length || senses.length > MAX_SENSES || senses.some((text) => !text)) return null
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
      return NextResponse.json({ meanings: await classify(draft.danish, draft.senses) })
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
    if (live.length > MAX_SENSES) return NextResponse.json({ refined: false })

    const meanings = await classify(String(entry.danish), live.map((sense) => sense.text.trim().slice(0, MAX_SENSE_LENGTH)))
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
