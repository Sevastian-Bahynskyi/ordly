import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const schema = {
  type: 'object',
  properties: {
    danish: { type: 'string' },
    pronunciation: { type: 'string' },
    translation: { type: 'string' },
    example_sentence: { type: 'string' },
    example_translation: { type: 'string' },
  },
  required: ['danish', 'pronunciation', 'translation', 'example_sentence', 'example_translation'],
  additionalProperties: false,
}

const languageNames: Record<string, string> = { ru: 'Russian', en: 'English', uk: 'Ukrainian' }

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'Groq is not configured yet.' }, { status: 503 })

  const body = await request.json()
  const draft = body.draft || {}
  const danish = String(draft.danish || '').trim()
  if (!danish) return NextResponse.json({ error: 'Danish word is required.' }, { status: 400 })

  const [{ data: profile }, { data: known }] = await Promise.all([
    supabase.from('profiles').select('default_translation_language, danish_level').single(),
    supabase.from('vocabulary_entries').select('danish').in('learning_status', ['learning', 'mastered']).not('danish', 'eq', danish).limit(30),
  ])

  const targetLanguage = languageNames[profile?.default_translation_language || 'ru'] || 'Russian'
  const level = profile?.danish_level || 'A1'
  const knownWords = (known || []).map((x) => x.danish).join(', ')

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      temperature: 0.25,
      messages: [
        {
          role: 'system',
          content: `You create Danish vocabulary cards for one ${level} learner. The target translation language is ${targetLanguage}. Keep everything concise and natural. Pronunciation MUST be simplified human-readable pronunciation, never IPA, using ordinary Latin letters and hyphens. The example must be simple enough for ${level}, while still making the meaning of the requested word obvious. If the requested word itself is advanced, keep the surrounding grammar and vocabulary simple. Prefer reusing known Danish vocabulary when natural: ${knownWords || 'none yet'}. Return only the requested card data.`,
        },
        {
          role: 'user',
          content: `Complete this card without inventing a different meaning than the information already provided. Danish: ${danish}\nExisting pronunciation: ${draft.pronunciation || '(missing)'}\nExisting ${targetLanguage} translation: ${draft.translation || '(missing)'}\nExisting Danish sentence: ${draft.example_sentence || '(missing)'}\nExisting sentence translation: ${draft.example_translation || '(missing)'}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'danish_vocabulary_card', strict: true, schema } },
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    console.error('Groq enrich failed', response.status, details)
    return NextResponse.json({ error: 'Groq could not enrich this word.' }, { status: 502 })
  }

  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (!content) return NextResponse.json({ error: 'Groq returned an empty response.' }, { status: 502 })
  return NextResponse.json(JSON.parse(content))
}
