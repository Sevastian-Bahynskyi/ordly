import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EntryKind } from '@/lib/types'
import {
  fetchDdoPronunciations,
  fetchWiktionaryPronunciations,
  ipaToCyrillic,
  isSingleDictionaryWord,
  normalizePronunciationText,
  resolveDictionaryPronunciation,
  type PronunciationCandidate,
} from '@/lib/pronunciation'

const PIPELINE_VERSION = 1

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

const ipaSchema = {
  type: 'object',
  properties: {
    pronunciation_ipa: { type: 'string' },
  },
  required: ['pronunciation_ipa'],
  additionalProperties: false,
}

const languageNames: Record<string, string> = { ru: 'Russian', en: 'English', uk: 'Ukrainian' }

async function groqCompletion(body: Record<string, unknown>, label: string) {
  if (!process.env.GROQ_API_KEY) throw new Error(`${label}: Groq is not configured`)

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
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`${label}: Groq request failed (${lastStatus}) ${lastDetails.slice(0, 240)}`)
}

async function chooseLowConfidenceCandidate(danish: string, candidates: PronunciationCandidate[]) {
  if (!process.env.GROQ_API_KEY || candidates.length < 2) return null

  const ids = candidates.map((candidate) => candidate.id)
  const schema = {
    type: 'object',
    properties: {
      candidate_id: { type: 'string', enum: ids },
    },
    required: ['candidate_id'],
    additionalProperties: false,
  }

  const choices = candidates.map((candidate) => `${candidate.id}: ${candidate.source} ${candidate.ipa}`).join('\n')
  const parsed = await groqCompletion({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    reasoning_effort: 'low',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are resolving a disagreement between phonetic dictionary sources for a Danish learner. Select exactly one supplied IPA candidate that best represents ordinary contemporary Standard Danish pronunciation of the exact word. Do not invent or rewrite IPA. Prefer the normal spoken lexical pronunciation over spelling-driven, dialectal, compound-fragment, or clearly less complete variants. Return only the candidate id through the required JSON schema.`,
      },
      { role: 'user', content: `Danish word: ${danish}\nCandidates:\n${choices}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'pronunciation_source_choice', strict: true, schema },
    },
  }, 'pronunciation tie-break')

  return candidates.find((candidate) => candidate.id === parsed.candidate_id) || null
}

async function generateIpaFallback(danish: string, entryKind: EntryKind) {
  const parsed = await groqCompletion({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    reasoning_effort: entryKind === 'sentence' ? 'medium' : 'low',
    temperature: 0.02,
    messages: [
      {
        role: 'system',
        content: `Return only the actual contemporary Standard Danish IPA pronunciation of the supplied ${entryKind === 'sentence' ? 'sentence/expression' : 'word or phrase'}. Use natural spoken pronunciation, including silent letters and normal reductions. For a sentence or phrase, use connected speech. Do not transliterate, translate, explain, or return Cyrillic.`,
      },
      { role: 'user', content: danish },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'danish_ipa_fallback', strict: true, schema: ipaSchema },
    },
  }, 'IPA fallback')

  return String(parsed.pronunciation_ipa || '').trim()
}

async function resolvePronunciation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  danish: string,
  entryKind: EntryKind,
) {
  const normalizedText = normalizePronunciationText(danish)

  const { data: cached } = await supabase
    .from('pronunciation_cache')
    .select('pronunciation, ipa, source, confidence, ddo_ipa, wiktionary_ipa')
    .eq('user_id', userId)
    .eq('normalized_text', normalizedText)
    .eq('pipeline_version', PIPELINE_VERSION)
    .maybeSingle()

  if (cached?.pronunciation && cached?.ipa) {
    return {
      pronunciation: String(cached.pronunciation),
      ipa: String(cached.ipa),
      source: String(cached.source),
      confidence: Number(cached.confidence),
      cached: true,
    }
  }

  let ipa = ''
  let source: 'ddo' | 'wiktionary' | 'groq' = 'groq'
  let confidence = 0.45
  let ddoIpa: string[] = []
  let wiktionaryIpa: string[] = []

  if (entryKind === 'word' && isSingleDictionaryWord(normalizedText)) {
    ;[ddoIpa, wiktionaryIpa] = await Promise.all([
      fetchDdoPronunciations(normalizedText),
      fetchWiktionaryPronunciations(normalizedText),
    ])

    const resolution = resolveDictionaryPronunciation(ddoIpa, wiktionaryIpa)
    if (resolution) {
      ipa = resolution.ipa
      source = resolution.source
      confidence = resolution.confidence

      if (resolution.needsTieBreak) {
        try {
          const selected = await chooseLowConfidenceCandidate(danish, resolution.candidates)
          if (selected) {
            ipa = selected.ipa
            source = selected.source
            confidence = 0.84
          }
        } catch (error) {
          console.warn('Groq pronunciation tie-break failed; keeping DDO preference', error)
        }
      }
    }
  }

  if (!ipa) {
    ipa = await generateIpaFallback(danish, entryKind)
    source = 'groq'
    confidence = entryKind === 'sentence' ? 0.55 : 0.6
  }

  const pronunciation = ipaToCyrillic(ipa)
  if (!pronunciation) throw new Error('Could not convert IPA to Cyrillic')

  // Persist the final result so the same text becomes a single nearby Supabase read next time.
  const { error: cacheError } = await supabase.from('pronunciation_cache').upsert({
    user_id: userId,
    normalized_text: normalizedText,
    pipeline_version: PIPELINE_VERSION,
    pronunciation,
    ipa,
    source,
    confidence,
    ddo_ipa: ddoIpa,
    wiktionary_ipa: wiktionaryIpa,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,normalized_text,pipeline_version' })
  if (cacheError) console.warn('Could not cache pronunciation', cacheError.message)

  return { pronunciation, ipa, source, confidence, cached: false }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const draft = body.draft || {}
  const danish = String(draft.danish || '').trim()
  const fields: string[] = Array.isArray(body.fields) ? body.fields.map(String) : []
  const entryKind: EntryKind = body.entryKind === 'sentence' ? 'sentence' : 'word'
  const includeExample = body.includeExample !== false

  if (!danish) return NextResponse.json({ error: 'Danish text is required.' }, { status: 400 })

  const needsPronunciation = fields.includes('pronunciation')
  const needsContent = fields.some((field: string) => field === 'translation' || field === 'example_sentence' || field === 'example_translation')

  const result: Record<string, string | number | boolean> = {}
  const failures: string[] = []
  const jobs: Promise<void>[] = []

  if (needsPronunciation) {
    jobs.push((async () => {
      try {
        const pronunciation = await resolvePronunciation(supabase, user.id, danish, entryKind)
        result.pronunciation = pronunciation.pronunciation
        result.pronunciation_ipa = pronunciation.ipa
        result.pronunciation_source = pronunciation.source
        result.pronunciation_confidence = pronunciation.confidence
        result.pronunciation_cached = pronunciation.cached
      } catch (error) {
        console.error(error)
        failures.push('pronunciation')
      }
    })())
  }

  if (needsContent) {
    jobs.push((async () => {
      try {
        const [{ data: profile }, { data: known }] = await Promise.all([
          supabase.from('profiles').select('default_translation_language, danish_level').single(),
          supabase.from('vocabulary_entries').select('danish').in('learning_status', ['learning', 'mastered']).not('danish', 'eq', danish).limit(30),
        ])

        const targetLanguage = languageNames[profile?.default_translation_language || 'ru'] || 'Russian'
        const level = profile?.danish_level || 'A1'
        const knownWords = (known || []).map((x) => x.danish).join(', ')

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
- Do not return pronunciation or commentary.`,
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
    return NextResponse.json({ error: 'Could not enrich this text. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({
    ...result,
    partial: failures.length > 0,
    failed: failures,
  })
}
