import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  hasOpenRouterKey,
  isOpenRouterRateLimitError,
  OPENROUTER_MODEL_ROUTES,
  openRouterJson,
} from '@/lib/openrouter'
import {
  canonicalLinkPair,
  discoverySenses,
  rankSynonymCandidates,
  SYNONYM_CANDIDATE_LIMIT,
  SYNONYM_POOL_LIMIT,
  synonymSearchFilter,
  synonymSearchTerms,
  type SynonymCandidate,
  type SynonymEntry,
} from '@/lib/synonyms'
import type { EntryLinkKind, EntryLinkSource } from '@/lib/types'
import { isUuid } from '@/lib/uuid'

/**
 * Synonym discovery (D4, D16). Runs AFTER the entry is saved, never inside the composer save
 * path, so a slow or failing model can never cost the learner a word.
 *
 * Shape: the deterministic pre-filter in lib/synonyms.ts picks at most SYNONYM_CANDIDATE_LIMIT
 * neighbours, then exactly one AI call scores that shortlist. Confidence decides what the edge
 * means: at or above AUTO_LINK_CONFIDENCE it is auto-linked (`confirmed = true`), below that it
 * is stored unconfirmed for the UI to offer as a dismissible chip. Everything under
 * SUGGEST_CONFIDENCE is dropped rather than stored as clutter.
 */

/** At or above this the edge is good enough to stand on its own. */
const AUTO_LINK_CONFIDENCE = 0.85

/** Below this the model is guessing and the edge is not worth showing at all. */
const SUGGEST_CONFIDENCE = 0.5

/** A concept is a phrase, not a sentence; the chip and the graph label have to hold it. */
const CONCEPT_MAX = 48

const ENTRY_COLUMNS = 'id, danish, translation, senses, entry_kind'

const scoreSchema = {
  type: 'object',
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          confidence: { type: 'number' },
          concept: { type: 'string' },
        },
        required: ['index', 'confidence', 'concept'],
        additionalProperties: false,
      },
    },
  },
  required: ['links'],
  additionalProperties: false,
}

interface DiscoveredLink {
  entry_id: string
  danish: string
  translation: string | null
  kind: Extract<EntryLinkKind, 'synonym'>
  source: Extract<EntryLinkSource, 'ai'>
  confidence: number
  confirmed: boolean
  /** The shared meaning the model named. An edge without one is never stored. */
  concept: string
}

function empty(entryId: string, skipped: string | null, considered = 0): NextResponse {
  return NextResponse.json({ entry_id: entryId, links: [], considered, skipped })
}

function senseLines(entry: SynonymEntry): string {
  return discoverySenses(entry)
    .map((sense) => (sense.pos ? `${sense.text} (${sense.pos})` : sense.text))
    .join('; ')
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasOpenRouterKey()) {
    return NextResponse.json({ error: 'Synonym discovery is unavailable.' }, { status: 503 })
  }

  const body: unknown = await request.json().catch(() => null)
  const rawId = body && typeof body === 'object' ? (body as { entryId?: unknown }).entryId : null
  const entryId = typeof rawId === 'string' ? rawId.trim().toLowerCase() : ''
  if (!isUuid(entryId)) {
    return NextResponse.json({ error: 'Vocabulary entry is required.' }, { status: 400 })
  }

  // RLS scopes this to the signed-in owner; there is no explicit user_id filter anywhere here.
  const { data: entry, error: entryError } = await supabase
    .from('vocabulary_entries')
    .select(ENTRY_COLUMNS)
    .eq('id', entryId)
    .maybeSingle()

  if (entryError) {
    console.error('Synonym discovery could not read the entry', entryError.message)
    return NextResponse.json({ error: 'Vocabulary entry was not found.' }, { status: 404 })
  }
  if (!entry) return NextResponse.json({ error: 'Vocabulary entry was not found.' }, { status: 404 })

  const source = entry as SynonymEntry
  if (source.entry_kind === 'sentence') return empty(entryId, 'sentence')

  // User-authored senses are excluded from the evidence, so an entry whose only meanings came
  // from `My answer was right` has nothing discovery is allowed to reason from (§4).
  const terms = synonymSearchTerms(source)
  if (!terms.length) return empty(entryId, 'no_evidence')

  const [{ data: existingLinks }, { data: pool, error: poolError }] = await Promise.all([
    supabase
      .from('entry_links')
      .select('a_id, b_id, kind, source, confirmed')
      .eq('kind', 'synonym')
      .or(`a_id.eq.${entryId},b_id.eq.${entryId}`),
    supabase
      .from('vocabulary_entries')
      .select(ENTRY_COLUMNS)
      .eq('entry_kind', 'word')
      .neq('id', entryId)
      .or(synonymSearchFilter(terms))
      .limit(SYNONYM_POOL_LIMIT),
  ])

  if (poolError) {
    console.error('Synonym discovery could not read the vocabulary', poolError.message)
    return NextResponse.json({ error: 'Synonym discovery failed.' }, { status: 502 })
  }

  // A pair the learner has already ruled on stays ruled on — confirmed, or dismissed (a tombstone
  // written with `source: 'user'`, so it is never proposed again). AI edges are left in the running so
  // that re-running discovery after an edit can re-score an edge D17 demoted.
  const settled = new Set<string>()
  for (const link of existingLinks || []) {
    if (link.source !== 'user') continue
    settled.add(String(link.a_id) === entryId ? String(link.b_id) : String(link.a_id))
  }

  const candidates = rankSynonymCandidates(source, (pool || []) as SynonymEntry[], {
    excludeIds: [...settled],
    limit: SYNONYM_CANDIDATE_LIMIT,
  })
  if (!candidates.length) return empty(entryId, 'no_candidates')

  const byIndex = new Map<number, SynonymCandidate>(candidates.map((candidate, index) => [index + 1, candidate]))
  // One line per sense pair, not per entry: the model rules on the meaning that actually matched.
  const candidateLines = candidates
    .map((candidate, index) => `${index + 1}. "${source.danish}" meaning "${candidate.sourceSense}"`
      + ` vs "${candidate.danish}" meaning "${candidate.candidateSense}"`)
    .join('\n')

  let parsed: Record<string, unknown>
  try {
    parsed = await openRouterJson({
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You decide whether two Danish words are synonyms in one specific meaning.

Each candidate is a pair of meanings: one meaning of the target word, and one meaning of the candidate word. Judge that pair alone. The words often have other meanings; those are irrelevant and must not make the pair a synonym.

Two words are synonyms in a meaning when they can replace each other in normal Danish without changing what the sentence means. Near-synonyms with a clear register or intensity difference still count, but only if a learner could safely use either.
Treat as NOT synonyms: words that are merely related or share a topic, antonyms, inflections of the same word, a broader or narrower term, and meanings that only look alike because one phrase contains the other. "only" and "just now" are different meanings, as are "in front of" and "before".

For each pair you accept, return its 1-based index, a confidence between 0 and 1, and \`concept\`: the shared meaning itself, written as the learner's translation language phrase both words express, at most three words. Use a confidence above 0.85 only when you are certain. Omit every pair that is not a synonym; an empty list is the correct answer when none of them are.`,
        },
        {
          role: 'user',
          content: `Target word: ${source.danish}\nAll its meanings, for context only: ${senseLines(source) || source.translation || ''}\n\nPairs to judge:\n${candidateLines}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'synonym_links', strict: true, schema: scoreSchema } },
    }, 'synonym discovery', { models: OPENROUTER_MODEL_ROUTES.semanticGrading, timeoutMs: 12000 })
  } catch (error) {
    // The message only: the error object can carry the request, which holds the learner's words.
    console.error('OpenRouter synonym discovery failed', error instanceof Error ? error.message : 'unknown error')
    if (isOpenRouterRateLimitError(error)) {
      return NextResponse.json({ error: 'AI is rate limited. Try again shortly.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Synonym discovery failed.' }, { status: 502 })
  }

  const scored = Array.isArray(parsed.links) ? parsed.links : []
  const accepted = new Map<string, DiscoveredLink>()
  for (const item of scored) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const candidate = byIndex.get(Number(record.index))
    if (!candidate) continue
    const confidence = Number(record.confidence)
    if (!Number.isFinite(confidence) || confidence < SUGGEST_CONFIDENCE) continue
    // An edge nobody can explain is the bug this route had. A model that will not name the
    // shared meaning has not made a claim worth storing.
    const concept = typeof record.concept === 'string' ? record.concept.trim().slice(0, CONCEPT_MAX) : ''
    if (!concept) continue
    const clamped = Math.min(1, Math.max(0, confidence))
    accepted.set(candidate.id, {
      entry_id: candidate.id,
      danish: candidate.danish,
      translation: candidate.translation,
      kind: 'synonym',
      source: 'ai',
      confidence: clamped,
      confirmed: clamped >= AUTO_LINK_CONFIDENCE,
      concept,
    })
  }

  if (!accepted.size) return empty(entryId, 'no_links', candidates.length)

  const rows = [...accepted.values()].map((link) => ({
    ...canonicalLinkPair(entryId, link.entry_id),
    kind: link.kind,
    source: link.source,
    confidence: link.confidence,
    confirmed: link.confirmed,
    concept: link.concept,
  }))

  // user_id comes from the column default (auth.uid()); the insert policy then verifies that
  // both a_id and b_id belong to that same owner before the row is allowed in.
  const { error: writeError } = await supabase
    .from('entry_links')
    .upsert(rows, { onConflict: 'a_id,b_id,kind' })

  if (writeError) {
    console.error('Synonym discovery could not store edges', writeError.message)
    return NextResponse.json({ error: 'Synonym discovery failed.' }, { status: 502 })
  }

  return NextResponse.json({
    entry_id: entryId,
    links: [...accepted.values()],
    considered: candidates.length,
    skipped: null,
  })
}
