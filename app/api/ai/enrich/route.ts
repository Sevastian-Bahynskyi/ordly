import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EntryKind } from '@/lib/types'
import { hasOpenRouterKey, isOpenRouterRateLimitError, OPENROUTER_MODEL_ROUTES, openRouterJson } from '@/lib/openrouter'
import { normalizePronunciationText } from '@/lib/pronunciation'

const PIPELINE_VERSION = 11

const translationSchema = {
  type: 'object',
  properties: {
    translation: { type: 'string' },
  },
  required: ['translation'],
  additionalProperties: false,
}

const exampleSchema = {
  type: 'object',
  properties: {
    example_sentence: { type: 'string' },
    example_translation: { type: 'string' },
  },
  required: ['example_sentence', 'example_translation'],
  additionalProperties: false,
}

const pronunciationSchema = {
  type: 'object',
  properties: {
    pronunciation: { type: 'string' },
  },
  required: ['pronunciation'],
  additionalProperties: false,
}

const languageNames: Record<string, string> = { ru: 'Russian', en: 'English', uk: 'Ukrainian' }

type TranslationLanguage = 'ru' | 'en' | 'uk'

async function aiCompletion(body: Record<string, unknown>, label: string, models: readonly string[]) {
  return openRouterJson(body, label, { models, timeoutMs: 10000 })
}

function cleanCyrillic(value: unknown) {
  const text = String(value || '')
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^["“”]+|["“”]+$/g, '')
    .replace(/^(?:произношение|транскрипция)\s*[:—-]?\s*/iu, '')
    .trim()

  if (!text || /[A-Za-z]/.test(text)) return ''

  const cleaned = text
    .replace(/[^А-Яа-яЁё\u0301\s.,!?…-]/gu, '')
    .replace(/\s+([.,!?…])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || !/[А-Яа-яЁё]/u.test(cleaned)) return ''
  return cleaned
}

function comparableText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('da-DK')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function translationLooksValid(danish: string, translation: string, language: TranslationLanguage) {
  const value = translation.trim()
  if (!value || value.length > 500) return false

  if (comparableText(value) === comparableText(danish)) return false

  if (language === 'ru') {
    if (!/[А-Яа-яЁё]/u.test(value)) return false
    if (/[A-Za-zÆØÅæøå]/u.test(value)) return false
  }

  if (language === 'uk') {
    if (!/[А-Яа-яЁёІіЇїЄєҐґ]/u.test(value)) return false
    if (/[A-Za-zÆØÅæøå]/u.test(value)) return false
  }

  return true
}

async function generateTranslation(danish: string, entryKind: EntryKind, language: TranslationLanguage) {
  const targetLanguage = languageNames[language]
  const outputRules = entryKind === 'sentence'
    ? `Translate the complete Danish sentence/expression naturally into ${targetLanguage}. Return one natural translation. Do not give alternatives unless the sentence genuinely has two equally necessary readings.`
    : `Translate the Danish word or phrase into ${targetLanguage}. Return its direct lexical meaning. One meaning is completely fine. If it has several common meanings that are genuinely useful to a learner, return 2-3 concise meanings separated only by comma + space.`

  for (let semanticAttempt = 0; semanticAttempt < 2; semanticAttempt += 1) {
    const parsed = await aiCompletion({
      temperature: semanticAttempt === 0 ? 0.04 : 0,
      max_tokens: 160,
      messages: [
        {
          role: 'system',
          content: `You are a strict Danish-to-${targetLanguage} translator for a vocabulary app. This task is TRANSLATION ONLY.

${outputRules}

Hard output rules:
- The translation field MUST contain only the ${targetLanguage} meaning that belongs in a flashcard answer field.
- Never copy or echo the Danish source as the answer.
- Never include the Danish source word alongside the translation.
- Never include pronunciation, IPA, transliteration, stress hints, grammar notes, part-of-speech labels, explanations, examples, arrows, labels, or commentary.
- Do not write things like "noun", "verb", "adjective", "translation", "means", or their ${targetLanguage} equivalents.
- Do not pad a single clear meaning with invented synonyms. One correct meaning is preferred over several weak meanings.
- When several meanings are appropriate for a word/phrase, use only a short comma-separated list of actual ${targetLanguage} translations.
- Preserve the meaning of the exact Danish source. Do not translate a similar-looking word instead.
${language === 'ru' ? '- Write the answer in normal Russian Cyrillic. Do not output Latin-script Danish or transliteration.' : ''}
${language === 'uk' ? '- Write the answer in normal Ukrainian Cyrillic. Do not output Latin-script Danish or transliteration.' : ''}

Examples of the required shape for Russian word translations:
Danish: hele -> весь, целый
Danish: spise -> есть
Danish: hurtigt -> быстро
The JSON must contain exactly one field: translation.`,
        },
        {
          role: 'user',
          content: semanticAttempt === 0
            ? `Translate this exact Danish ${entryKind}: ${danish}`
            : `The previous result failed validation. Translate this exact Danish ${entryKind} again and obey every output rule: ${danish}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'strict_danish_translation', strict: true, schema: translationSchema },
      },
    }, semanticAttempt === 0 ? 'translation' : 'translation retry', OPENROUTER_MODEL_ROUTES.translation)

    const translation = String(parsed.translation || '').trim()
    if (translationLooksValid(danish, translation, language)) return translation

    console.warn('Rejected invalid translation output', {
      danish,
      language,
      output: translation.slice(0, 160),
      semanticAttempt,
    })
  }

  throw new Error('Translation output failed validation twice')
}

function pronunciationPrompt(entryKind: EntryKind) {
  const scope = entryKind === 'sentence'
    ? 'the entire Danish sentence in natural connected speech, including ordinary reductions and weak forms'
    : 'the complete Danish word or phrase as it is normally pronounced in contemporary Standard Danish'

  return `You are the pronunciation engine for a Danish vocabulary app used by a native Russian speaker.

Your only job is to write a SIMPLE RUSSIAN-CYRILLIC READING HINT for ${scope}.

This is not a linguistic transliteration and you must not output IPA. Work out the real Danish sound internally, then write how a Russian speaker should approximately read it aloud.

Rules:
- Output only normal Russian Cyrillic letters, spaces, hyphens, normal punctuation, and optional combining acute accents for stress.
- Never output Latin letters, Danish spelling, IPA symbols, slashes, brackets, labels, explanations, alternatives, translations, JSON, or Markdown.
- Base the result on actual spoken Danish, not spelling. Respect silent letters, reductions, vowel quality and natural word boundaries.
- Make it immediately readable by an ordinary Russian speaker with no phonetics knowledge.
- Prefer a useful, pronounceable approximation over a mechanically exact transcription.
- Danish soft d must not automatically become Russian з. Choose the sound that makes a Russian reader come closest in context.
- For phrases and sentences, return the pronunciation for the WHOLE input, not just one word.

Quality anchors:
- lyder -> лю́ле
- stadig -> close to сдэ́эди
- synes -> close to сю́нес
- selvfølgelig -> close to сэфё́ли

Before answering, mentally read only your Cyrillic result as a Russian speaker. If it would sound materially unlike the Danish input, fix it.

Return JSON with exactly one field named pronunciation.`
}

async function generatePronunciation(danish: string, entryKind: EntryKind) {
  if (!hasOpenRouterKey()) throw new Error('Pronunciation AI is not configured')

  const parsed = await openRouterJson({
    temperature: 0.02,
    max_tokens: 96,
    messages: [
      { role: 'system', content: pronunciationPrompt(entryKind) },
      { role: 'user', content: danish },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'danish_cyrillic_pronunciation', strict: true, schema: pronunciationSchema },
    },
  }, 'pronunciation', {
    models: OPENROUTER_MODEL_ROUTES.pronunciation,
    timeoutMs: 10000,
    validate: (value) => Boolean(cleanCyrillic(value.pronunciation)),
  })

  const pronunciation = cleanCyrillic(parsed.pronunciation)
  if (!pronunciation) throw new Error('Pronunciation model did not return readable Cyrillic')
  return pronunciation
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
    .select('pronunciation')
    .eq('user_id', userId)
    .eq('normalized_text', normalizedText)
    .eq('pipeline_version', PIPELINE_VERSION)
    .maybeSingle()

  if (cached?.pronunciation) {
    return {
      pronunciation: String(cached.pronunciation),
      cached: true,
    }
  }

  const pronunciation = await generatePronunciation(danish, entryKind)

  // pronunciation_cache.source still has a legacy enum from the old Groq-era pipeline.
  // Keep the compatible value until the schema is eventually cleaned up; no Groq request is made here.
  const { error: cacheError } = await supabase.from('pronunciation_cache').upsert({
    user_id: userId,
    normalized_text: normalizedText,
    pipeline_version: PIPELINE_VERSION,
    pronunciation,
    ipa: '',
    source: 'groq',
    confidence: 0.72,
    ddo_ipa: [],
    wiktionary_ipa: [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,normalized_text,pipeline_version' })
  if (cacheError) console.warn('Could not cache direct AI pronunciation', cacheError.message)

  return { pronunciation, cached: false }
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
  const includeExample = entryKind !== 'sentence' && body.includeExample !== false

  if (!danish) return NextResponse.json({ error: 'Danish text is required.' }, { status: 400 })

  const needsPronunciation = fields.includes('pronunciation')
  const needsTranslation = fields.includes('translation')
  const needsExamples = includeExample && fields.some((field: string) => field === 'example_sentence' || field === 'example_translation')

  const result: Record<string, string | number | boolean> = {}
  const failures: string[] = []
  const jobs: Promise<void>[] = []
  let rateLimited = false

  const profilePromise = needsTranslation || needsExamples
    ? supabase.from('profiles').select('default_translation_language, danish_level').single()
    : null

  if (needsPronunciation) {
    jobs.push((async () => {
      try {
        const pronunciation = await resolvePronunciation(supabase, user.id, danish, entryKind)
        result.pronunciation = pronunciation.pronunciation
        result.pronunciation_ipa = ''
        result.pronunciation_source = 'ai'
        result.pronunciation_confidence = 0.72
        result.pronunciation_cached = pronunciation.cached
      } catch (error) {
        console.error('Pronunciation enrichment failed', error)
        rateLimited ||= isOpenRouterRateLimitError(error)
        failures.push('pronunciation')
      }
    })())
  }

  if (needsTranslation) {
    jobs.push((async () => {
      try {
        const { data: profile } = await profilePromise!
        const language = (profile?.default_translation_language || 'ru') as TranslationLanguage
        result.translation = await generateTranslation(danish, entryKind, language)
      } catch (error) {
        console.error('Translation enrichment failed', error)
        rateLimited ||= isOpenRouterRateLimitError(error)
        failures.push('translation')
      }
    })())
  }

  if (needsExamples) {
    jobs.push((async () => {
      try {
        const [{ data: profile }, { data: known }] = await Promise.all([
          profilePromise!,
          supabase.from('vocabulary_entries').select('danish').in('learning_status', ['learning', 'mastered']).not('danish', 'eq', danish).limit(30),
        ])

        const targetLanguage = languageNames[profile?.default_translation_language || 'ru'] || 'Russian'
        const level = profile?.danish_level || 'A1'
        const knownWords = (known || []).map((x) => x.danish).join(', ')
        const existingExample = String(draft.example_sentence || '').trim()

        const parsed = await aiCompletion({
          temperature: 0.12,
          max_tokens: 240,
          messages: [
            {
              role: 'system',
              content: `You create a simple natural Danish example sentence for one ${level} learner and translate that example into ${targetLanguage}.
- The source vocabulary item is: ${danish}
- If an existing example sentence is supplied, KEEP that Danish sentence exactly and only translate it.
- Otherwise generate a short natural Danish example at ${level} that demonstrates the source item clearly.
- Prefer known words when natural: ${knownWords || 'none yet'}.
- example_translation must translate example_sentence, not the isolated source word.
- Return no pronunciation, grammar labels, explanations, or commentary.`,
            },
            {
              role: 'user',
              content: existingExample
                ? `Existing Danish example sentence: ${existingExample}`
                : `Create an example for Danish: ${danish}`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'danish_example_sentence', strict: true, schema: exampleSchema },
          },
        }, 'example content', OPENROUTER_MODEL_ROUTES.examples)

        result.example_sentence = existingExample || String(parsed.example_sentence || '').trim()
        result.example_translation = String(parsed.example_translation || '').trim()
      } catch (error) {
        console.error('Example enrichment failed', error)
        rateLimited ||= isOpenRouterRateLimitError(error)
        failures.push('examples')
      }
    })())
  }

  await Promise.all(jobs)

  if (!Object.keys(result).length) {
    const message = rateLimited
      ? 'AI is temporarily busy. Please try again shortly.'
      : failures.length === 1 && failures[0] === 'pronunciation'
        ? 'Could not generate pronunciation. Please try again.'
        : failures.length === 1 && failures[0] === 'translation'
          ? 'Could not generate a valid translation. Please try again.'
          : 'Could not enrich this text. Please try again.'
    return NextResponse.json({ error: message }, { status: rateLimited ? 429 : 502 })
  }

  return NextResponse.json({
    ...result,
    partial: failures.length > 0,
    failed: failures,
  })
}
