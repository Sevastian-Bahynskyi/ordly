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

const PIPELINE_VERSION = 6
const PRONUNCIATION_MODEL = process.env.GROQ_PRONUNCIATION_MODEL || 'openai/gpt-oss-120b'

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

const cyrillicSchema = {
  type: 'object',
  properties: {
    pronunciation: { type: 'string' },
  },
  required: ['pronunciation'],
  additionalProperties: false,
}

const fallbackPronunciationSchema = {
  type: 'object',
  properties: {
    pronunciation_ipa: { type: 'string' },
    pronunciation: { type: 'string' },
  },
  required: ['pronunciation_ipa', 'pronunciation'],
  additionalProperties: false,
}

const languageNames: Record<string, string> = { ru: 'Russian', en: 'English', uk: 'Ukrainian' }

type TranslationLanguage = 'ru' | 'en' | 'uk'

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

function cleanCyrillic(value: unknown, fallback = '') {
  const text = String(value || '').trim()
  if (!text || /[A-Za-z]/.test(text)) return fallback

  const cleaned = text
    .replace(/[^А-Яа-яЁё\u0301\s.,!?…-]/gu, '')
    .replace(/\s+([.,!?…])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || !/[А-Яа-яЁё]/u.test(cleaned)) return fallback
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
    const parsed = await groqCompletion({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      temperature: semanticAttempt === 0 ? 0.04 : 0,
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
    }, semanticAttempt === 0 ? 'translation' : 'translation retry')

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

function pronunciationEditorSystemPrompt() {
  return `You are a Danish pronunciation editor for one Russian-speaking learner.

The OUTPUT IS NOT IPA and is NOT transliteration. It is a practical Russian respelling: the learner must be able to look at the Cyrillic, read it with ordinary Russian reading habits, and immediately say something close to the real Danish pronunciation without knowing phonetics.

Rules:
- When IPA is supplied, treat it as authoritative and judge the sound against IPA rather than Danish spelling.
- Optimize for what a native Russian speaker will actually SAY when reading the hint aloud, not for one-to-one symbol correspondence.
- Use ONLY ordinary Russian alphabet letters А-Я/а-я/Ё/ё, spaces, hyphens, normal sentence punctuation, and an optional combining acute accent for stress. Never output Latin letters, IPA symbols, special phonetic characters, apostrophes, colons, slashes, brackets, or explanations.
- For a full sentence, write a readable pronunciation for the ENTIRE sentence from beginning to end. Preserve natural word boundaries, connected speech, weak forms and reductions. Do not return only one prominent word.
- Choose the closest readable Russian letter or letter sequence for each Danish sound. If Danish has no exact Russian equivalent, choose the approximation that makes the learner's spoken result closest.
- Danish soft d [ð] / [ð̞] is an approximant, NOT Russian з and usually should not be written as з. Depending on the surrounding sounds, a Russian-readable soft д-like or л-like approximation can be better. In lyder [ˈlyːðə], the useful learner approximation is лю́ле, not лю́зэ and not лю́дэ.
- Do not blindly reuse the same Russian letter for [ð] in every word. Context matters. For stadig around [ˈsdæːði], the established learner-friendly result is still close to сдэ́эди.
- Preserve useful syllable count, stress, reductions and vowel quality. Represent vowel length only when it actually helps a Russian reader reproduce the sound.
- Do not add consonants just because they exist in Danish orthography.
- Prefer a familiar, pronounceable Russian-looking hint over a mechanically precise but confusing string.

Quality anchors:
- lyder [ˈlyːðə] → лю́ле, never лю́зэ.
- stadig around [ˈsdæːði] → close to сдэ́эди, never стаади or штадик.
- synes around [ˈsynəs] → close to сю́нес.
- selvfølgelig with reduced pronunciation around [sɛˈføli] → close to сэфё́ли.

Final check before answering: hide the Danish spelling and any IPA, read only your Russian output as an ordinary Russian speaker, and ask what sound would come out. If that spoken result is materially wrong, rewrite the hint.`
}

async function validateCyrillicPronunciation(danish: string, ipa: string, deterministicDraft: string) {
  if (!process.env.GROQ_API_KEY) return deterministicDraft

  const parsed = await groqCompletion({
    model: PRONUNCIATION_MODEL,
    reasoning_effort: 'low',
    temperature: 0.03,
    messages: [
      { role: 'system', content: pronunciationEditorSystemPrompt() },
      {
        role: 'user',
        content: `Danish text: ${danish}\nAuthoritative IPA: ${ipa}\nDeterministic Cyrillic draft: ${deterministicDraft}\nReturn a corrected Cyrillic pronunciation for the complete supplied text.`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'cyrillic_pronunciation_validation', strict: true, schema: cyrillicSchema },
    },
  }, 'Cyrillic pronunciation validation')

  return cleanCyrillic(parsed.pronunciation, deterministicDraft)
}

async function chooseLowConfidenceCandidateAndPronunciation(danish: string, candidates: PronunciationCandidate[]) {
  if (!process.env.GROQ_API_KEY || candidates.length < 2) return null

  const ids = candidates.map((candidate) => candidate.id)
  const schema = {
    type: 'object',
    properties: {
      candidate_id: { type: 'string', enum: ids },
      pronunciation: { type: 'string' },
    },
    required: ['candidate_id', 'pronunciation'],
    additionalProperties: false,
  }

  const choices = candidates
    .map((candidate) => `${candidate.id}: ${candidate.source} ${candidate.ipa} | deterministic Cyrillic: ${ipaToCyrillic(candidate.ipa)}`)
    .join('\n')

  const parsed = await groqCompletion({
    model: PRONUNCIATION_MODEL,
    reasoning_effort: 'low',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `${pronunciationEditorSystemPrompt()}\n\nThere is also a disagreement between dictionary IPA candidates. Select exactly one supplied IPA candidate that best represents ordinary contemporary Standard Danish, then return a corrected Russian-Cyrillic pronunciation for that selected IPA.`,
      },
      { role: 'user', content: `Danish word: ${danish}\nCandidates:\n${choices}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'pronunciation_source_and_cyrillic', strict: true, schema },
    },
  }, 'pronunciation tie-break and validation')

  const selected = candidates.find((candidate) => candidate.id === parsed.candidate_id)
  if (!selected) return null
  const deterministicDraft = ipaToCyrillic(selected.ipa)
  return {
    selected,
    pronunciation: cleanCyrillic(parsed.pronunciation, deterministicDraft),
  }
}

async function generateSentencePronunciation(danish: string) {
  try {
    const parsed = await groqCompletion({
      model: PRONUNCIATION_MODEL,
      reasoning_effort: 'low',
      temperature: 0.02,
      messages: [
        {
          role: 'system',
          content: `You pronounce complete Danish sentences for a Russian-speaking learner. Determine the natural contemporary Standard Danish connected-speech pronunciation of the ENTIRE supplied sentence, including reductions and weak forms. Return both IPA for the whole sentence and a practical Russian-Cyrillic reading hint for the whole sentence.\n\n${pronunciationEditorSystemPrompt()}\n\nThe required JSON has exactly two fields: pronunciation_ipa and pronunciation.`,
        },
        { role: 'user', content: danish },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'danish_sentence_pronunciation', strict: true, schema: fallbackPronunciationSchema },
      },
    }, 'sentence pronunciation')

    const ipa = String(parsed.pronunciation_ipa || '').trim()
    const pronunciation = cleanCyrillic(parsed.pronunciation)
    if (pronunciation) return { ipa, pronunciation }
  } catch (error) {
    console.warn('Structured sentence pronunciation failed; retrying Cyrillic-only', error)
  }

  const parsed = await groqCompletion({
    model: PRONUNCIATION_MODEL,
    reasoning_effort: 'low',
    temperature: 0.02,
    messages: [
      {
        role: 'system',
        content: `Produce only a practical Russian-Cyrillic pronunciation hint for the ENTIRE supplied Danish sentence in natural contemporary Standard Danish connected speech. Do not translate it. Do not omit words.\n\n${pronunciationEditorSystemPrompt()}`,
      },
      { role: 'user', content: danish },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'danish_sentence_cyrillic', strict: true, schema: cyrillicSchema },
    },
  }, 'sentence Cyrillic pronunciation')

  const pronunciation = cleanCyrillic(parsed.pronunciation)
  if (!pronunciation) throw new Error('Sentence pronunciation was not valid Cyrillic')
  return { ipa: '', pronunciation }
}

async function generatePronunciationFallback(danish: string) {
  const parsed = await groqCompletion({
    model: PRONUNCIATION_MODEL,
    reasoning_effort: 'low',
    temperature: 0.02,
    messages: [
      {
        role: 'system',
        content: `No dictionary IPA was available. Determine the actual contemporary Standard Danish pronunciation of the supplied word or phrase, using natural spoken pronunciation, silent letters and normal reductions. Return IPA and a Russian-Cyrillic learner pronunciation.\n\n${pronunciationEditorSystemPrompt()}\n\nThe required JSON has exactly two fields: pronunciation_ipa and pronunciation.`,
      },
      { role: 'user', content: danish },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'danish_pronunciation_fallback', strict: true, schema: fallbackPronunciationSchema },
    },
  }, 'pronunciation fallback')

  const ipa = String(parsed.pronunciation_ipa || '').trim()
  const deterministicDraft = ipaToCyrillic(ipa)
  return {
    ipa,
    pronunciation: cleanCyrillic(parsed.pronunciation, deterministicDraft),
  }
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

  if (cached?.pronunciation) {
    return {
      pronunciation: String(cached.pronunciation),
      ipa: String(cached.ipa || ''),
      source: String(cached.source),
      confidence: Number(cached.confidence),
      cached: true,
    }
  }

  if (entryKind === 'sentence') {
    const sentence = await generateSentencePronunciation(danish)

    if (sentence.ipa) {
      const { error: cacheError } = await supabase.from('pronunciation_cache').upsert({
        user_id: userId,
        normalized_text: normalizedText,
        pipeline_version: PIPELINE_VERSION,
        pronunciation: sentence.pronunciation,
        ipa: sentence.ipa,
        source: 'groq',
        confidence: 0.65,
        ddo_ipa: [],
        wiktionary_ipa: [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,normalized_text,pipeline_version' })
      if (cacheError) console.warn('Could not cache sentence pronunciation', cacheError.message)
    }

    return {
      pronunciation: sentence.pronunciation,
      ipa: sentence.ipa,
      source: 'groq',
      confidence: 0.65,
      cached: false,
    }
  }

  let ipa = ''
  let pronunciation = ''
  let source: 'ddo' | 'wiktionary' | 'groq' = 'groq'
  let confidence = 0.45
  let ddoIpa: string[] = []
  let wiktionaryIpa: string[] = []

  if (isSingleDictionaryWord(normalizedText)) {
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
          const resolved = await chooseLowConfidenceCandidateAndPronunciation(danish, resolution.candidates)
          if (resolved) {
            ipa = resolved.selected.ipa
            source = resolved.selected.source
            confidence = 0.84
            pronunciation = resolved.pronunciation
          }
        } catch (error) {
          console.warn('Groq pronunciation tie-break failed; keeping dictionary preference', error)
        }
      }
    }
  }

  if (!ipa) {
    const fallback = await generatePronunciationFallback(danish)
    ipa = fallback.ipa
    pronunciation = fallback.pronunciation
    source = 'groq'
    confidence = 0.6
  }

  if (!ipa) throw new Error('Could not determine pronunciation IPA')

  if (!pronunciation) {
    const deterministicDraft = ipaToCyrillic(ipa)
    if (!deterministicDraft) throw new Error('Could not convert IPA to Cyrillic')

    try {
      pronunciation = await validateCyrillicPronunciation(danish, ipa, deterministicDraft)
    } catch (error) {
      console.warn('Groq Cyrillic validation failed; keeping deterministic pronunciation', error)
      pronunciation = deterministicDraft
    }
  }

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
  const includeExample = entryKind !== 'sentence' && body.includeExample !== false

  if (!danish) return NextResponse.json({ error: 'Danish text is required.' }, { status: 400 })

  const needsPronunciation = fields.includes('pronunciation')
  const needsTranslation = fields.includes('translation')
  const needsExamples = includeExample && fields.some((field: string) => field === 'example_sentence' || field === 'example_translation')

  const result: Record<string, string | number | boolean> = {}
  const failures: string[] = []
  const jobs: Promise<void>[] = []

  const profilePromise = needsTranslation || needsExamples
    ? supabase.from('profiles').select('default_translation_language, danish_level').single()
    : null

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
        console.error('Pronunciation enrichment failed', error)
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

        const parsed = await groqCompletion({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
          reasoning_effort: 'low',
          temperature: 0.12,
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
        }, 'example content')

        result.example_sentence = existingExample || String(parsed.example_sentence || '').trim()
        result.example_translation = String(parsed.example_translation || '').trim()
      } catch (error) {
        console.error('Example enrichment failed', error)
        failures.push('examples')
      }
    })())
  }

  await Promise.all(jobs)

  if (!Object.keys(result).length) {
    const message = failures.length === 1 && failures[0] === 'pronunciation'
      ? 'Could not generate pronunciation. Please try again.'
      : failures.length === 1 && failures[0] === 'translation'
        ? 'Could not generate a valid translation. Please try again.'
        : 'Could not enrich this text. Please try again.'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  return NextResponse.json({
    ...result,
    partial: failures.length > 0,
    failed: failures,
  })
}
