import { NextResponse } from 'next/server'
import { openRouterText } from '@/lib/openrouter'

const TOKEN = 'ordly-pronunciation-smoke-20260908-a91f'
const WORDS = ['til rådighed', 'uafhængighed', 'tilgængelighed'] as const

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
  return /[А-Яа-яЁё]/u.test(cleaned) ? cleaned : ''
}

const system = `You are the pronunciation engine for a Danish vocabulary app used by a native Russian speaker.
Your only job is to write a SIMPLE RUSSIAN-CYRILLIC READING HINT for the complete Danish word or phrase as it is normally pronounced in contemporary Standard Danish.
This is not a linguistic transliteration and you must not output IPA. Work out the real Danish sound internally, then write how a Russian speaker should approximately read it aloud.
Rules:
- Output only normal Russian Cyrillic letters, spaces, hyphens, normal punctuation, and optional combining acute accents for stress.
- Never output Latin letters, Danish spelling, IPA symbols, slashes, brackets, labels, explanations, alternatives, translations, JSON, or Markdown.
- Base the result on actual spoken Danish, not spelling. Respect silent letters, reductions, vowel quality and natural word boundaries.
- Make it immediately readable by an ordinary Russian speaker with no phonetics knowledge.
- Prefer a useful, pronounceable approximation over a mechanically exact transcription.
- Danish soft d must not automatically become Russian з. Choose the sound that makes a Russian reader come closest in context.
- Return the pronunciation for the WHOLE input.
Quality anchors: lyder -> лю́ле; stadig -> close to сдэ́эди; synes -> close to сю́нес; selvfølgelig -> close to сэфё́ли.
Return ONLY the final Cyrillic reading hint itself.`

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('token') !== TOKEN) return new NextResponse(null, { status: 404 })

  const results = []
  for (const danish of WORDS) {
    const started = Date.now()
    try {
      const raw = await openRouterText({
        temperature: 0.02,
        max_tokens: 256,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: danish },
        ],
      }, 'pronunciation smoke', {
        primaryTimeoutMs: 10000,
        fallbackTimeoutMs: 16000,
        validate: (value) => Boolean(cleanCyrillic(value)),
      })
      results.push({ danish, pronunciation: cleanCyrillic(raw), ms: Date.now() - started })
    } catch (error) {
      results.push({ danish, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started })
    }
  }

  return NextResponse.json({ results })
}
