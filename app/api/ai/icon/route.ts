import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FALLBACK_ICON = 'ph:bookmark-simple'
const ICON_PREFIXES = ['ph', 'tabler', 'material-symbols', 'solar']

const conceptSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
  },
  required: ['query'],
  additionalProperties: false,
}

function validIconName(value: unknown) {
  const icon = String(value || '').trim()
  return /^[a-z0-9-]+:[a-z0-9-]+$/i.test(icon) ? icon : ''
}

async function generateConceptQuery(danish: string, translation: string) {
  if (!process.env.GROQ_API_KEY) return ''

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Choose a visual icon-search concept for a Danish vocabulary item.
Return a short ENGLISH search query of 1-3 concrete words that would find a memorable pictogram.
Use the MEANING, not Danish spelling. Prefer an object/action/symbol that makes the meaning visually memorable.
For abstract words, choose a conventional visual metaphor: agree -> handshake, think -> brain, difficult -> mountain, repeat -> repeat arrows, hope -> star.
Do not return an icon library name, explanation, punctuation, translation, or alternatives.`,
        },
        {
          role: 'user',
          content: `Danish: ${danish}\nMeaning: ${translation || 'unknown'}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'vocabulary_icon_concept', strict: true, schema: conceptSchema },
      },
    }),
    signal: AbortSignal.timeout(4000),
  })

  if (!response.ok) return ''
  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (!content) return ''

  try {
    const parsed = JSON.parse(content)
    return String(parsed.query || '')
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
  } catch {
    return ''
  }
}

function pickIcon(icons: string[]) {
  const clean = icons.map(validIconName).filter(Boolean)
  if (!clean.length) return ''

  const regularPhosphor = clean.find((icon) =>
    icon.startsWith('ph:') && !/-(bold|duotone|fill|light|thin)$/i.test(icon),
  )
  if (regularPhosphor) return regularPhosphor

  const phosphor = clean.find((icon) => icon.startsWith('ph:'))
  if (phosphor) return phosphor

  const tabler = clean.find((icon) => icon.startsWith('tabler:'))
  if (tabler) return tabler

  return clean[0]
}

async function searchIconify(query: string) {
  if (!query) return ''

  const params = new URLSearchParams({
    query,
    limit: '64',
    prefixes: ICON_PREFIXES.join(','),
  })

  try {
    const response = await fetch(`https://api.iconify.design/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3500),
      next: { revalidate: 60 * 60 * 24 * 30 },
    })
    if (!response.ok) return ''
    const payload = await response.json()
    return pickIcon(Array.isArray(payload.icons) ? payload.icons : [])
  } catch {
    return ''
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const entryId = String(body.entryId || '').trim()
  const suppliedDanish = String(body.danish || '').trim()

  let query = supabase
    .from('vocabulary_entries')
    .select('id, danish, translation, entry_kind, icon_name')

  if (entryId) query = query.eq('id', entryId)
  else if (suppliedDanish) query = query.ilike('danish', suppliedDanish)
  else return NextResponse.json({ error: 'Vocabulary entry is required.' }, { status: 400 })

  const { data: entries, error } = await query.limit(5)
  if (error || !entries?.length) return NextResponse.json({ error: 'Vocabulary entry was not found.' }, { status: 404 })

  const entry = entries[0]
  if (entry.entry_kind === 'sentence') return NextResponse.json({ icon_name: null, skipped: true })

  const existing = validIconName(entry.icon_name)
  if (existing) return NextResponse.json({ icon_name: existing, cached: true })

  const concept = await generateConceptQuery(String(entry.danish), String(entry.translation || ''))
  let iconName = await searchIconify(concept)

  if (!iconName) {
    const latinFallback = String(entry.translation || '').match(/[A-Za-z]{3,}/)?.[0] || ''
    iconName = await searchIconify(latinFallback)
  }

  if (!iconName) iconName = FALLBACK_ICON

  const matchingIds = entries
    .filter((candidate) => candidate.entry_kind !== 'sentence' && !validIconName(candidate.icon_name))
    .map((candidate) => candidate.id)

  if (matchingIds.length) {
    const { error: updateError } = await supabase
      .from('vocabulary_entries')
      .update({ icon_name: iconName })
      .in('id', matchingIds)
    if (updateError) console.warn('Could not persist vocabulary icon', updateError.message)
  }

  return NextResponse.json({ icon_name: iconName, query: concept, cached: false })
}
