import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasOpenRouterKey, OPENROUTER_MODEL_ROUTES, openRouterJson } from '@/lib/openrouter'
import { interfaceMessages } from '@/lib/i18n/server'

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
  const api = (await interfaceMessages()).api
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: api.unauthorized }, { status: 401 })
  if (!hasOpenRouterKey()) return NextResponse.json({ error: api.aiUnavailable }, { status: 503 })

  const body = await request.json()
  const danish = String(body.danish || '').trim()
  const mode = (['word', 'phrase', 'sentence'].includes(body.mode) ? body.mode : 'word') as Mode
  if (!danish) return NextResponse.json({ error: api.danishRequired }, { status: 400 })
  if (danish.length > 300) return NextResponse.json({ error: api.danishTooLong }, { status: 400 })

  const instruction = mode === 'word'
    ? `The input is ONE Danish vocabulary word. Normalize it to its dictionary/base form without changing meaning. Finite, past, imperative, or participle verbs become the bare infinitive without a leading "at"; nouns become singular indefinite; adjectives become positive/base form; adverbs, pronouns, prepositions, proper nouns, and words already in base form stay unchanged. Preserve Danish spelling and diacritics. is_correct is true only when the input is already the appropriate base form.`
    : mode === 'phrase'
      ? `The input is a Danish PHRASE, not a single vocabulary word. VERIFY it: is it correct, natural Danish that a native speaker would use to express its evident meaning? Check spelling, word choice, fixed-expression wording, prepositions and particles, agreement and word order. If it is already correct and natural, return it exactly unchanged and set is_correct=true. If not, return the SMALLEST correction that keeps the intended meaning (for example a wrong preposition in a fixed expression) and set is_correct=false. Never collapse a multi-word phrase into one word, never turn it into a full sentence, and never rewrite a correct phrase just to make each word a dictionary headword. Do not explain the correction.`
      : `The input is a Danish SENTENCE or sentence fragment. Do NOT convert words to dictionary/base forms. Check its overall Danish grammar, spelling, word order, agreement, punctuation, and naturalness. If it is already acceptable natural Danish, return it exactly unchanged and set is_correct=true. If it is incorrect or clearly unnatural, make the SMALLEST correction necessary while preserving the intended meaning and set is_correct=false. Do not explain the correction.`

  try {
    const parsed = await openRouterJson({
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
    }, 'Danish normalization', { models: OPENROUTER_MODEL_ROUTES.danishCorrection })

    const result = String(parsed.result || '').trim()
    if (!result) return NextResponse.json({ error: api.emptyDanish }, { status: 502 })

    if (mode === 'phrase' && danish.split(/\s+/u).length > 1 && result.split(/\s+/u).length < 2) {
      return NextResponse.json({ error: api.collapsedPhrase }, { status: 502 })
    }

    return NextResponse.json({ result, is_correct: Boolean(parsed.is_correct) })
  } catch (error) {
    console.error('OpenRouter Danish normalization failed', error)
    return NextResponse.json({ error: api.couldNotCheckDanish }, { status: 502 })
  }
}
