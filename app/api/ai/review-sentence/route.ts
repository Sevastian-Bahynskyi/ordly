import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasOpenRouterKey, OPENROUTER_MODEL_ROUTES, openRouterJson } from '@/lib/openrouter'

const reviewSentenceSchema = {
  type: 'object',
  properties: {
    sentence: { type: 'string' },
    translation: { type: 'string' },
  },
  required: ['sentence', 'translation'],
  additionalProperties: false,
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { entryId, cycle } = await request.json()
  if (!entryId || !Number.isInteger(cycle)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: cached } = await supabase.from('review_sentence_cache').select('sentence, translation').eq('entry_id', entryId).eq('cycle', cycle).maybeSingle()
  if (cached) return NextResponse.json(cached)
  if (!hasOpenRouterKey()) return NextResponse.json({ error: 'OpenRouter is not configured' }, { status: 503 })

  const [{ data: entry }, { data: profile }, { data: known }] = await Promise.all([
    supabase.from('vocabulary_entries').select('danish, translation').eq('id', entryId).single(),
    supabase.from('profiles').select('default_translation_language, danish_level').single(),
    supabase.from('vocabulary_entries').select('danish').in('learning_status', ['learning', 'mastered']).neq('id', entryId).limit(25),
  ])
  if (!entry) return NextResponse.json({ error: 'Word not found' }, { status: 404 })

  const target = ({ ru: 'Russian', en: 'English', uk: 'Ukrainian' } as Record<string,string>)[profile?.default_translation_language || 'ru']

  try {
    const result = await openRouterJson({
      temperature: 0.55,
      messages: [
        { role: 'system', content: `Write one short, natural Danish sentence for a ${profile?.danish_level || 'A1'} learner. It must use the exact target word or phrase naturally and clearly demonstrate its supplied meaning. Prefer familiar words from this list when useful: ${(known || []).map(x => x.danish).join(', ') || 'none'}. Also translate the sentence into ${target}.` },
        { role: 'user', content: `Target: ${entry.danish}\nMeaning: ${entry.translation}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'review_sentence', strict: true, schema: reviewSentenceSchema } },
    }, 'review sentence', { models: OPENROUTER_MODEL_ROUTES.examples })

    const sentence = String(result.sentence || '').trim()
    const translation = String(result.translation || '').trim()
    if (!sentence || !translation) return NextResponse.json({ error: 'Empty sentence' }, { status: 502 })

    await supabase.from('review_sentence_cache').insert({ entry_id: entryId, cycle, sentence, translation })
    return NextResponse.json({ sentence, translation })
  } catch (error) {
    console.error('OpenRouter review sentence generation failed', error)
    return NextResponse.json({ error: 'Could not generate sentence' }, { status: 502 })
  }
}
