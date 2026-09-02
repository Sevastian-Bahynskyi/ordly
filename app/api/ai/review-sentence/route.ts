import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { entryId, cycle } = await request.json()
  if (!entryId || !Number.isInteger(cycle)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: cached } = await supabase.from('review_sentence_cache').select('sentence, translation').eq('entry_id', entryId).eq('cycle', cycle).maybeSingle()
  if (cached) return NextResponse.json(cached)
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'Groq is not configured' }, { status: 503 })

  const [{ data: entry }, { data: profile }, { data: known }] = await Promise.all([
    supabase.from('vocabulary_entries').select('danish, translation').eq('id', entryId).single(),
    supabase.from('profiles').select('default_translation_language, danish_level').single(),
    supabase.from('vocabulary_entries').select('danish').in('learning_status', ['learning', 'mastered']).neq('id', entryId).limit(25),
  ])
  if (!entry) return NextResponse.json({ error: 'Word not found' }, { status: 404 })

  const target = ({ ru: 'Russian', en: 'English', uk: 'Ukrainian' } as Record<string,string>)[profile?.default_translation_language || 'ru']
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b', reasoning_effort: 'low', temperature: 0.55,
      messages: [
        { role: 'system', content: `Write one short, natural Danish sentence for a ${profile?.danish_level || 'A1'} learner. It must use the exact target word or phrase naturally and clearly demonstrate its supplied meaning. Prefer familiar words from this list when useful: ${(known || []).map(x => x.danish).join(', ') || 'none'}. Also translate the sentence into ${target}.` },
        { role: 'user', content: `Target: ${entry.danish}\nMeaning: ${entry.translation}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'review_sentence', strict: true, schema: { type: 'object', properties: { sentence: { type: 'string' }, translation: { type: 'string' } }, required: ['sentence','translation'], additionalProperties: false } } },
    }),
  })
  if (!response.ok) return NextResponse.json({ error: 'Could not generate sentence' }, { status: 502 })
  const payload = await response.json()
  const result = JSON.parse(payload.choices?.[0]?.message?.content || '{}')
  if (!result.sentence) return NextResponse.json({ error: 'Empty sentence' }, { status: 502 })
  await supabase.from('review_sentence_cache').insert({ entry_id: entryId, cycle, sentence: result.sentence, translation: result.translation })
  return NextResponse.json(result)
}
