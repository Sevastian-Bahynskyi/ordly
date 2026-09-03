import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const schema = {
  type: 'object',
  properties: {
    result: { type: 'string', enum: ['correct', 'mostly', 'incorrect'] },
  },
  required: ['result'],
  additionalProperties: false,
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'AI checking is unavailable.' }, { status: 503 })

  const body = await request.json()
  const danish = String(body.danish || '').trim()
  const expected = String(body.expected || '').trim()
  const answer = String(body.answer || '').trim()
  const mode = String(body.mode || 'recognition')
  const language = String(body.language || 'Russian')

  if (!danish || !expected || !answer) {
    return NextResponse.json({ error: 'Missing answer context.' }, { status: 400 })
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You grade a Danish vocabulary learner's answer by MEANING, not exact wording. Be generous with genuine synonyms but strict about meaning.\n\nReturn correct when the learner's answer expresses the same relevant meaning as the expected answer in this card, even with a different natural synonym. For example Russian "тяжело" can be correct for Danish "svært" when the expected answer is "трудно, сложно".\nReturn mostly only when the meaning is substantially right but noticeably imprecise, too broad/narrow, or has a small grammatical issue that does not change the core meaning.\nReturn incorrect when it is merely related, has a different sense, reverses the meaning, or would teach the learner the wrong equivalence.\nDo not punish punctuation, capitalization, minor spelling mistakes, or a natural synonym.\nThe review direction is ${mode}. The translation language is ${language}.`,
        },
        {
          role: 'user',
          content: `Danish card: ${danish}\nExpected answer: ${expected}\nLearner answer: ${answer}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'answer_grade', strict: true, schema } },
    }),
  })

  if (!response.ok) return NextResponse.json({ error: 'AI checking failed.' }, { status: 502 })
  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (!content) return NextResponse.json({ error: 'AI returned an empty result.' }, { status: 502 })

  const parsed = JSON.parse(content)
  return NextResponse.json({ result: parsed.result })
}
