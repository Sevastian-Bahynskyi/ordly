const apiKey = process.env.OPENROUTER_API_KEY

if (!process.env.VERCEL) {
  console.log('Pronunciation smoke: skipped outside Vercel')
  process.exit(0)
}
if (!apiKey) throw new Error('OPENROUTER_API_KEY missing')

const model = 'openrouter/free'
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://ordly-sevastian-bahynskyis-projects.vercel.app',
    'X-Title': 'Ordly pronunciation smoke',
  },
  body: JSON.stringify({
    model,
    temperature: 0.02,
    max_tokens: 256,
    messages: [
      {
        role: 'system',
        content: 'Write how a native Russian speaker should read the supplied Danish word or phrase to sound close to contemporary spoken Danish. Return ONLY a simple Russian-Cyrillic pronunciation hint. No Latin letters, IPA, labels, explanation, JSON, or Markdown.',
      },
      { role: 'user', content: 'til rådighed' },
    ],
  }),
  signal: AbortSignal.timeout(30000),
})

if (!response.ok) throw new Error(`Free-router smoke HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
const payload = await response.json()
const content = payload?.choices?.[0]?.message?.content
const text = Array.isArray(content)
  ? content.map((part) => typeof part === 'string' ? part : String(part?.text || '')).join('').trim()
  : String(content || '').trim()

if (!text) throw new Error('Free-router smoke returned empty content')
if (!/[А-Яа-яЁё]/u.test(text) || /[A-Za-z]/.test(text)) {
  throw new Error(`Free-router smoke returned non-Cyrillic content: ${text.slice(0, 200)}`)
}
console.log(`Free-router pronunciation smoke OK: til rådighed -> ${text}`)
