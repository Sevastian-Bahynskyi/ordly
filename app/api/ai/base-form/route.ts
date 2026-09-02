import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const schema = {
  type: 'object',
  properties: {
    base_form: { type: 'string' },
  },
  required: ['base_form'],
  additionalProperties: false,
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'Groq is not configured yet.' }, { status: 503 })

  const body = await request.json()
  const danish = String(body.danish || '').trim()
  if (!danish) return NextResponse.json({ error: 'Danish word is required.' }, { status: 400 })
  if (danish.length > 200) return NextResponse.json({ error: 'Keep the Danish entry under 200 characters.' }, { status: 400 })

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      temperature: 0.05,
      messages: [
        {
          role: 'system',
          content: `Normalize one Danish vocabulary item to its dictionary/base form without changing its meaning. Return only the Danish base form. Rules: finite, past, imperative, or participle verbs become the bare infinitive without a leading "at"; nouns become singular indefinite; adjectives become the positive/base form; adverbs, pronouns, prepositions, proper nouns, and items already in base form stay unchanged. For verb phrases, normalize the verb to infinitive while preserving required particles and reflexive pronouns, and do not prepend "at". Preserve Danish spelling and diacritics. Do not translate, explain, add alternatives, or invent a different lexical item.`,
        },
        {
          role: 'user',
          content: `Danish input: ${danish}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'danish_base_form', strict: true, schema } },
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    console.error('Groq base-form failed', response.status, details)
    return NextResponse.json({ error: 'Groq could not find the base form.' }, { status: 502 })
  }

  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (!content) return NextResponse.json({ error: 'Groq returned an empty response.' }, { status: 502 })

  const parsed = JSON.parse(content)
  const baseForm = String(parsed.base_form || '').trim()
  if (!baseForm) return NextResponse.json({ error: 'Groq returned an empty base form.' }, { status: 502 })

  return NextResponse.json({ base_form: baseForm })
}
