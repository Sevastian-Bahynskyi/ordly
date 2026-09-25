import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasOpenRouterKey, OPENROUTER_MODEL_ROUTES, openRouterJson } from '@/lib/openrouter'
import { interfaceMessages } from '@/lib/i18n/server'
import { LEARNER_LANGUAGE_NAMES } from '@/lib/learner-language'

const schema = {
  type: 'object',
  properties: {
    result: { type: 'string', enum: ['correct', 'mostly', 'incorrect'] },
    relation: { type: 'string', enum: ['valid_alternative', 'near', 'incorrect'] },
    note: { type: 'string' },
  },
  required: ['result', 'relation', 'note'],
  additionalProperties: false,
}

export async function POST(request: Request) {
  const api = (await interfaceMessages()).api
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: api.unauthorized }, { status: 401 })
  if (!hasOpenRouterKey()) return NextResponse.json({ error: api.aiUnavailable }, { status: 503 })

  const body = await request.json()
  const danish = String(body.danish || '').trim()
  const expected = String(body.expected || '').trim()
  const answer = String(body.answer || '').trim()
  const mode = String(body.mode || 'recognition')
  // Interpolated into the prompt, so only a known language name is accepted from the client.
  const language = Object.values(LEARNER_LANGUAGE_NAMES).find((name) => name === body.language) ?? LEARNER_LANGUAGE_NAMES.en

  if (!danish || !expected || !answer) {
    return NextResponse.json({ error: api.missingContext }, { status: 400 })
  }

  try {
    const parsed = await openRouterJson({
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You grade a Danish vocabulary learner's answer by MEANING, not exact wording. Be generous with genuine synonyms and natural paraphrases but strict about meaning.\n\nReturn correct with relation valid_alternative when the learner's answer expresses the same relevant meaning through a synonym, a different part of speech, or a natural construction. For example Russian "тяжело" can be correct for Danish "svært" when the saved answer is "трудно, сложно", and "стыдно" can be a valid natural meaning for Danish "skamme" even when the saved meanings are verbs.\nReturn mostly with relation near only when the core meaning is substantially right but noticeably imprecise, too broad, or too narrow.\nReturn incorrect with relation incorrect when it is merely related, has a different sense, reverses the meaning, or would teach the wrong equivalence.\nThe note must be one short sentence in ${language}, the learner's language, explaining the relationship without repeating the saved answer. Do not punish punctuation, capitalization, minor spelling mistakes, or natural phrasing.\nThe review direction is ${mode}. The translation language is ${language}.`,
        },
        {
          role: 'user',
          content: `Danish card: ${danish}\nExpected answer: ${expected}\nLearner answer: ${answer}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'answer_grade', strict: true, schema } },
    }, 'answer checking', { models: OPENROUTER_MODEL_ROUTES.semanticGrading })

    const result = String(parsed.result || '')
    const relation = String(parsed.relation || '')
    const note = String(parsed.note || '').trim().slice(0, 240)
    const consistent = (result === 'correct' && relation === 'valid_alternative')
      || (result === 'mostly' && relation === 'near')
      || (result === 'incorrect' && relation === 'incorrect')
    if (!consistent || !note) {
      return NextResponse.json({ error: api.invalidResult }, { status: 502 })
    }

    return NextResponse.json({ result, relation, note })
  } catch (error) {
    console.error('OpenRouter answer checking failed', error)
    return NextResponse.json({ error: api.checkFailed }, { status: 502 })
  }
}
