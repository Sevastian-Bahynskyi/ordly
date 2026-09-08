const models = [
  'z-ai/glm-5.3-flash:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
]

const words = ['til rådighed', 'uafhængighed', 'tilgængelighed']
const apiKey = process.env.OPENROUTER_API_KEY

if (!process.env.VERCEL) {
  console.log('Pronunciation smoke: skipped outside Vercel')
  process.exit(0)
}

if (!apiKey) {
  throw new Error('Pronunciation smoke: OPENROUTER_API_KEY is missing in Vercel')
}

const system = `You are the pronunciation engine for a Danish vocabulary app used by a native Russian speaker.
Write a SIMPLE RUSSIAN-CYRILLIC READING HINT for the complete Danish word or phrase as normally pronounced in contemporary Standard Danish.
Do not output IPA. Work out the real Danish sound internally, then write how a Russian speaker should approximately read it aloud.
Output ONLY normal Russian Cyrillic letters, spaces, hyphens, punctuation and optional combining acute accents for stress.
Never output Latin letters, Danish spelling, IPA symbols, labels, explanations, alternatives, translations, JSON, or Markdown.
Base the result on spoken Danish, not spelling. Respect silent letters, reductions, vowel quality and natural word boundaries.
Danish soft d must not automatically become Russian з.
Quality anchors: lyder -> лю́ле; stadig -> сдэ́эди; synes -> сю́нес; selvfølgelig -> сэфё́ли.
Return ONLY the final Cyrillic reading hint.`

function clean(value) {
  const text = String(value || '').trim()
  if (!text || /[A-Za-z]/.test(text)) return ''
  const cleaned = text
    .replace(/[^А-Яа-яЁё\u0301\s.,!?…-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  return /[А-Яа-яЁё]/u.test(cleaned) ? cleaned : ''
}

async function callModel(model, danish, timeoutMs) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ordly-sevastian-bahynskyis-projects.vercel.app',
      'X-Title': 'Ordly build smoke',
    },
    body: JSON.stringify({
      model,
      temperature: 0.02,
      max_tokens: 256,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: danish },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`${model}: HTTP ${response.status}`)
  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  const value = Array.isArray(content)
    ? content.map((part) => typeof part === 'string' ? part : String(part?.text || '')).join('')
    : String(content || '')
  const pronunciation = clean(value)
  if (!pronunciation) throw new Error(`${model}: invalid Cyrillic output`)
  return pronunciation
}

for (const danish of words) {
  let pronunciation = ''
  let lastError
  const started = Date.now()

  for (let i = 0; i < models.length; i += 1) {
    try {
      pronunciation = await callModel(models[i], danish, i === 0 ? 10000 : 16000)
      break
    } catch (error) {
      lastError = error
      console.warn(`Pronunciation smoke fallback for ${danish}:`, error.message)
    }
  }

  if (!pronunciation) throw lastError || new Error(`Pronunciation smoke failed for ${danish}`)
  console.log(`Pronunciation smoke OK: ${danish} -> ${pronunciation} (${Date.now() - started}ms)`)
}

console.log('Pronunciation smoke: all hard cases passed')
