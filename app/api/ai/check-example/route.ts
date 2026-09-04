import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const schema = {
  type: 'object',
  properties: {
    is_correct: { type: 'boolean' },
    corrected_sentence: { type: 'string' },
    translation: { type: 'string' },
  },
  required: ['is_correct', 'corrected_sentence', 'translation'],
  additionalProperties: false,
}

const languageNames: Record<string, string> = {
  ru: 'Russian',
  en: 'English',
  uk: 'Ukrainian',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const sentence = String(body.sentence || '').trim()
  if (!sentence) return NextResponse.json({ error: 'Example sentence is required.' }, { status: 400 })
  if (sentence.length > 700) return NextResponse.json({ error: 'Example sentence is too long.' }, { status: 400 })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_translation_language, danish_level')
    .single()

  const targetLanguage = languageNames[profile?.default_translation_language || 'ru'] || 'Russian'
  const level = String(profile?.danish_level || 'A1')

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
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
              content: `You are a strict Danish grammar and spelling checker for a ${level} learner.

The learner wrote a Danish example sentence. Your job is to protect THEIR idea and THEIR wording while making the sentence correct Danish.

Rules:
- Check spelling, inflection, agreement, articles, pronouns, verb forms, word order, punctuation and clear grammar errors.
- Make the SMALLEST correction necessary. Do not rewrite merely because another wording is more elegant.
- Preserve the learner's intended meaning, vocabulary choice, tone and level.
- Do not make the sentence more advanced.
- Do not add new facts, remove ideas, or substitute unrelated synonyms.
- If the sentence is already grammatically and orthographically acceptable contemporary Danish, set is_correct=true and return corrected_sentence EXACTLY as supplied.
- If there is a real error, set is_correct=false and return one corrected sentence only.
- translation must be a natural ${targetLanguage} translation of corrected_sentence.
- Return no explanations or commentary.

Before answering, compare the original and correction. If you changed anything that was not required for correctness, undo that change.`,
            },
            {
              role: 'user',
              content: attempt === 0
                ? `Check this exact Danish sentence:\n${sentence}`
                : `Check again very conservatively. Preserve the original idea and wording and correct only real Danish errors:\n${sentence}`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'danish_example_check', strict: true, schema },
          },
        }),
        signal: AbortSignal.timeout(7000),
      })

      if (!response.ok) throw new Error(`Groq returned ${response.status}`)
      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error('Empty AI response')
      const parsed = JSON.parse(content)

      const correctedSentence = String(parsed.corrected_sentence || '').trim()
      const translation = String(parsed.translation || '').trim()
      if (!correctedSentence || !translation) throw new Error('Incomplete AI response')

      const isCorrect = Boolean(parsed.is_correct) && correctedSentence === sentence
      return NextResponse.json({
        is_correct: isCorrect,
        corrected_sentence: correctedSentence,
        translation,
      })
    } catch (error) {
      if (attempt === 1) {
        console.error('Example sentence check failed', error)
        return NextResponse.json({ error: 'Could not check this example sentence. Please try again.' }, { status: 502 })
      }
    }
  }

  return NextResponse.json({ error: 'Could not check this example sentence. Please try again.' }, { status: 502 })
}
