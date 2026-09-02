import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EntryKind } from '@/lib/types'

const contentSchema = {
  type: 'object',
  properties: {
    translation: { type: 'string' },
    example_sentence: { type: 'string' },
    example_translation: { type: 'string' },
  },
  required: ['translation', 'example_sentence', 'example_translation'],
  additionalProperties: false,
}

const pronunciationSchema = {
  type: 'object',
  properties: {
    pronunciation_ipa: { type: 'string' },
    pronunciation: { type: 'string' },
  },
  required: ['pronunciation_ipa', 'pronunciation'],
  additionalProperties: false,
}

const languageNames: Record<string, string> = { ru: 'Russian', en: 'English', uk: 'Ukrainian' }

async function groqCompletion(body: Record<string, unknown>, label: string) {
  let lastStatus = 0
  let lastDetails = ''

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error(`${label}: Groq returned an empty response`)
      return JSON.parse(content)
    }

    lastStatus = response.status
    lastDetails = await response.text()
    console.error(`Groq ${label} failed`, response.status, lastDetails)

    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === 1) break
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error(`${label}: Groq request failed (${lastStatus}) ${lastDetails.slice(0, 240)}`)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'Groq is not configured yet.' }, { status: 503 })

  const body = await request.json()
  const draft = body.draft || {}
  const danish = String(draft.danish || '').trim()
  const fields: string[] = Array.isArray(body.fields) ? body.fields.map(String) : []
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
  const needsPronunciation = fields.includes('pronunciation')
  const needsContent = fields.some((field: string) => field === 'translation' || field === 'example_sentence' || field === 'example_translation')

  const result: Record<string, string> = {}
  const failures: string[] = []
  const jobs: Promise<void>[] = []

  if (needsPronunciation) {
    jobs.push((async () => {
      try {
        const parsed = await groqCompletion({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
          reasoning_effort: 'medium',
          temperature: 0.05,
          messages: [
            {
              role: 'system',
              content: `You are a Danish pronunciation specialist helping a Russian-speaking learner. Return exactly two fields: pronunciation_ipa and pronunciation.

STEP 1 — pronunciation_ipa:
Determine the actual normal contemporary Standard Danish pronunciation of the supplied text. For phrases and sentences, use natural connected speech, reductions, silent letters and normal function-word pronunciation rather than spelling each word separately.

STEP 2 — pronunciation:
Convert the sound represented by pronunciation_ipa into a practical Russian-Cyrillic respelling. The goal is NOT transliteration. The goal is that a Russian speaker who simply reads the Cyrillic aloud naturally should sound as close as practical to a Danish speaker.

Rules:
- pronunciation must contain Russian Cyrillic only, plus spaces, hyphens, apostrophes and optional stress marks.
- Never copy silent Danish letters merely because they are written.
- Prefer the actual heard sound over Danish spelling in every case.
- Danish y is front rounded; a practical Russian approximation is often ю after a consonant when that gives a closer result.
- Soft/reduced final syllables must sound reduced rather than spelling-driven.
- For connected speech, transcribe what is actually heard, not a word-by-word school transliteration.
- Read your final Cyrillic aloud mentally as Russian and compare it with the IPA. Correct anything that would make a Russian reader say the wrong sound.

Hard anchors for this app:
- synes → IPA around [ˈsynəs]/[ˈsyns] → сюнес
- selvfølgelig has a common reduced pronunciation around [sɛˈføːli] → a compact Russian-readable result should be close to сэфёли, not сельвфёльгелиг
- hvad in an ordinary question is normally pronounced around [va]/[vað], so never хвад
- godt as an adverb does not preserve a literal written final t
- lide in kunne lide is normally reduced around [li]/[liˀ], not spelling-based лиде.

Do not translate the text and do not explain anything.`
            },
            { role: 'user', content: danish },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'danish_pronunciation', strict: true, schema: pronunciationSchema },
          },
        }, 'pronunciation')

        result.pronunciation = String(parsed.pronunciation || '').trim()
      } catch (error) {
        console.error(error)
        failures.push('pronunciation')
      }
    })())
  }

  if (needsContent) {
    jobs.push((async () => {
      try {
        const parsed = await groqCompletion({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
          reasoning_effort: 'low',
          temperature: 0.15,
          messages: [
            {
              role: 'system',
              content: `You create Danish study cards for one ${level} learner. The target translation language is ${targetLanguage}. The saved item is a ${entryKind}.

- If this is a sentence, translation is the natural translation of the whole Danish sentence/expression.
- If this is a word/phrase, translation is its concise lexical meaning.
- ${includeExample ? `Generate a simple natural Danish example at ${level} and its ${targetLanguage} translation.` : 'A separate example is disabled: return empty strings for example_sentence and example_translation.'}
- Preserve the meaning of the exact Danish text supplied.
- Prefer known words when natural: ${knownWords || 'none yet'}.
- Do not return pronunciation or commentary.`
            },
            {
              role: 'user',
              content: `Danish: ${danish}\nExisting ${targetLanguage} translation: ${draft.translation || '(missing)'}\nExisting example: ${draft.example_sentence || '(missing)'}\nExisting example translation: ${draft.example_translation || '(missing)'}`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'danish_study_content', strict: true, schema: contentSchema },
          },
        }, 'content')

        result.translation = String(parsed.translation || '').trim()
        result.example_sentence = includeExample ? String(parsed.example_sentence || '').trim() : ''
        result.example_translation = includeExample ? String(parsed.example_translation || '').trim() : ''
      } catch (error) {
        console.error(error)
        failures.push('content')
      }
    })())
  }

  await Promise.all(jobs)

  if (!Object.keys(result).length) {
    return NextResponse.json({ error: 'AI could not enrich this text. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({
    ...result,
    partial: failures.length > 0,
    failed: failures,
  })
}
