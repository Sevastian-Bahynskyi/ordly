import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const schema = {
  type: 'object',
  properties: {
    result: { type: 'string' },
    is_correct: { type: 'boolean' },
  },
  required: ['result', 'is_correct'],
  additionalProperties: false,
}

type Mode = 'word' | 'phrase' | 'sentence'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'Groq is not configured yet.' }, { status: 503 })

  const body = await request.json()
  const danish = String(body.danish || '').trim()
  const mode = (['word', 'phrase', 'sentence'].includes(body.mode) ? body.mode : 'word') as Mode
  if (!danish) return NextResponse.json({ error: 'Danish text is required.' }, { status: 400 })
  if (danish.length > 300) return NextResponse.json({ error: 'Keep the Danish entry under 300 characters.' }, { status: 400 })

  const instruction = mode === 'word'
    ? `The input is ONE Danish vocabulary word. Normalize it to its dictionary/base form without changing meaning. Finite, past, imperative, or participle verbs become the bare infinitive without a leading "at"; nouns become singular indefinite; adjectives become positive/base form; adverbs, pronouns, prepositions, proper nouns, and words already in base form stay unchanged. Preserve Danish spelling and diacritics. is_correct is true only when the input is already the appropriate base form.`
    : mode === 'phrase'
      ? `The input is a Danish PHRASE, not a single vocabulary word. Normalize the phrase as a useful dictionary-style phrase while PRESERVING the phrase and its meaning. Never collapse a multi-word phrase into one lexical item. Keep required particles, prepositions, reflexive pronouns, complements, intensifiers, and fixed-expression words. Normalize only inflected elements where that makes sense for a reusable phrase (for example a finite verb may become infinitive), but do not rewrite a normal phrase merely to make every individual word a dictionary headword. If the phrase is already natural and reusable, return it unchanged. is_correct means the phrase already needs no normalization.`
      : `The input is a Danish SENTENCE or sentence fragment. Do NOT convert words to dictionary/base forms. Check its overall Danish grammar, spelling, word order, agreement, punctuation, and naturalness. If it is already acceptable natural Danish, return it exactly unchanged and set is_correct=true. If it is incorrect or clearly unnatural, make the SMALLEST correction necessary while preserving the intended meaning and set is_correct=false. Do not explain the correction.`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      temperature: 0.03,
      messages: [
        {
          role: 'system',
          content: `${instruction}\nReturn only the requested structured result. Do not translate, explain, add alternatives, or change the intended meaning.`,
        },
        {
          role: 'user',
          content: `Danish input: ${danish}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'danish_normalization', strict: true, schema } },
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    console.error('Groq Danish normalization failed', response.status, details)
    return NextResponse.json({ error: 'Groq could not check this Danish text.' }, { status: 502 })
  }

  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (!content) return NextResponse.json({ error: 'Groq returned an empty response.' }, { status: 502 })

  let parsed: { result?: string; is_correct?: boolean }
  try {
    parsed = JSON.parse(content)
  } catch {
    return NextResponse.json({ error: 'Groq returned an invalid response.' }, { status: 502 })
  }

  const result = String(parsed.result || '').trim()
  if (!result) return NextResponse.json({ error: 'Groq returned empty Danish text.' }, { status: 502 })

  // Defensive guard: a phrase must remain a phrase. This prevents a model slip from
  // silently reducing entries such as "helt sikker" to a single word.
  if (mode === 'phrase' && danish.split(/\s+/u).length > 1 && result.split(/\s+/u).length < 2) {
    return NextResponse.json({ error: 'AI tried to collapse the phrase. Nothing was changed.' }, { status: 502 })
  }

  return NextResponse.json({ result, is_correct: Boolean(parsed.is_correct) })
}
