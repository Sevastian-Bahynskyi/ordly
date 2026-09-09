import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasOpenRouterKey, OPENROUTER_MODEL_ROUTES, openRouterJson } from '@/lib/openrouter'

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
  if (!hasOpenRouterKey()) return NextResponse.json({ error: 'AI checking is unavailable.' }, { status: 503 })

  const body = await request.json()
  const danish = String(body.danish || '').trim()
  const expected = String(body.expected || '').trim()
  const answer = String(body.answer || '').trim()
  const mode = String(body.mode || 'recognition')
  const language = String(body.language || 'Russian')

  if (!danish || !expected || !answer) {
    return NextResponse.json({ error: 'Missing answer context.' }, { status: 400 })
  }

  try {
    const parsed = await openRouterJson({
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
    }, 'answer checking', { models: OPENROUTER_MODEL_ROUTES.semanticGrading })

    const result = String(parsed.result || '')
    if (!['correct', 'mostly', 'incorrect'].includes(result)) {
      return NextResponse.json({ error: 'AI returned an invalid result.' }, { status: 502 })
    }

    return NextResponse.json({ result })
  } catch (error) {
    console.error('OpenRouter answer checking failed', error)
    return NextResponse.json({ error: 'AI checking failed.' }, { status: 502 })
  }
}
