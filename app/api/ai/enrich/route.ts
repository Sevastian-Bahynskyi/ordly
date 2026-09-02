import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EntryKind } from '@/lib/types'

const schema = {
  type: 'object',
  properties: {
    danish: { type: 'string' },
    pronunciation_ipa: {
      type: 'string',
      description: 'Normal contemporary Standard Danish pronunciation in IPA. This is an intermediate grounding field.',
    },
    pronunciation: {
      type: 'string',
      description: 'Russian-readable Cyrillic phonetic respelling derived from pronunciation_ipa, optimized so a Russian speaker reading it aloud sounds close to the Danish.',
    },
    translation: { type: 'string' },
    example_sentence: { type: 'string' },
    example_translation: { type: 'string' },
  },
  required: ['danish', 'pronunciation_ipa', 'pronunciation', 'translation', 'example_sentence', 'example_translation'],
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
  const fields = Array.isArray(body.fields) ? body.fields.map(String) : []
  const entryKind: EntryKind = body.entryKind === 'sentence' ? 'sentence' : 'word'
  const includeExample = body.includeExample !== false

  if (!danish) return NextResponse.json({ error: 'Danish text is required.' }, { status: 400 })

  const [{ data: profile }, { data: known }] = await Promise.all([
    supabase.from('profiles').select('default_translation_language, danish_level').single(),
    supabase.from('vocabulary_entries').select('danish').in('learning_status', ['learning', 'mastered']).not('danish', 'eq', danish).limit(30),
  ])

  const targetLanguage = languageNames[profile?.default_translation_language || 'ru'] || 'Russian'
  const level = profile?.danish_level || 'A1'
  const knownWords = (known || []).map((x) => x.danish).join(', ')
  const requested = fields.length ? fields.join(', ') : 'all missing fields'

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      reasoning_effort: 'medium',
      temperature: 0.05,
      messages: [
        {
          role: 'system',
          content: `You create Danish study cards for one ${level} learner. The target translation language is ${targetLanguage}. The saved item is classified as a ${entryKind}. Keep translations concise and natural.

PRONUNCIATION HAS A MANDATORY TWO-STAGE PROCESS:
A) First determine the actual normal contemporary Standard Danish pronunciation and write it in pronunciation_ipa.
B) Then IGNORE THE DANISH SPELLING and convert the IPA sound into a practical Russian-Cyrillic respelling in pronunciation.

The pronunciation field is not letter transliteration. Its only purpose is this: if a Russian speaker reads the Cyrillic aloud naturally, the result should sound as close as practical to a Danish native speaker.

Rules for pronunciation:
- Never copy silent Danish letters into Cyrillic.
- Respect reductions and the pronunciation of the expression in context, especially function words and fixed phrases.
- Use only Russian Cyrillic letters, spaces, hyphens/apostrophes and optional stress marks in pronunciation. No IPA or Latin there.
- Prefer sound accuracy over visual similarity to Danish spelling.
- Danish sounds that Russian lacks should use the closest practical Russian approximation, not a spelling-derived compromise.
- Validate by mentally pronouncing the final Cyrillic as Russian and comparing it against pronunciation_ipa.
- For a whole sentence, transcribe connected natural Danish, not isolated spelling word-by-word.
- Confirmed anchor for this app: synes [ˈsynəs] / [ˈsyns] → "сюнес".
- Context anchors from standard Danish dictionaries: hvad in questions is commonly [va]/[vað] (so do NOT write "хвад"); kan as the modal can be [ka]/[kan]; godt as an adverb is around [gʌd] (do NOT mechanically preserve the written t); and lide in kunne lide is commonly [li]/[liˀ] (do NOT mechanically write "лиде"). Choose the best Russian-readable result from the actual phrase context.

CONTENT RULES:
- If entryKind is "sentence", translation means the translation of the entire saved Danish sentence/expression.
- If entryKind is "word", translation means the lexical meaning of the saved word/phrase.
- ${includeExample ? `A separate simple example sentence is enabled. Make it understandable at ${level} and make the saved word/phrase meaning obvious.` : 'A separate example is disabled. Return empty strings for example_sentence and example_translation.'}
- Prefer reusing known Danish vocabulary when natural: ${knownWords || 'none yet'}.
- The user requested these fields now: ${requested}. Preserve manually supplied information unless a requested field must be regenerated for the current Danish text.
- Return only the requested JSON schema.`,
        },
        {
          role: 'user',
          content: `Danish: ${danish}\nCard kind: ${entryKind}\nSeparate example enabled: ${includeExample ? 'yes' : 'no'}\nExisting pronunciation: ${draft.pronunciation || '(missing)'}\nExisting ${targetLanguage} translation: ${draft.translation || '(missing)'}\nExisting Danish example: ${draft.example_sentence || '(missing)'}\nExisting example translation: ${draft.example_translation || '(missing)'}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'danish_study_card', strict: true, schema } },
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    console.error('Groq enrich failed', response.status, details)
    return NextResponse.json({ error: 'Groq could not enrich this text.' }, { status: 502 })
  }

  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (!content) return NextResponse.json({ error: 'Groq returned an empty response.' }, { status: 502 })

  const parsed = JSON.parse(content)
  return NextResponse.json({
    danish: parsed.danish,
    pronunciation: parsed.pronunciation,
    translation: parsed.translation,
    example_sentence: includeExample ? parsed.example_sentence : '',
    example_translation: includeExample ? parsed.example_translation : '',
  })
}
