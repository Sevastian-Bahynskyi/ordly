const apiKey = process.env.OPENROUTER_API_KEY

if (!process.env.VERCEL) {
  console.log('Pronunciation smoke: skipped outside Vercel')
  process.exit(0)
}
if (!apiKey) throw new Error('OPENROUTER_API_KEY missing')

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://ordly-sevastian-bahynskyis-projects.vercel.app',
    'X-Title': 'Ordly transport smoke',
  },
  body: JSON.stringify({
    model: 'openrouter/free',
    max_tokens: 64,
    messages: [{ role: 'user', content: 'Reply with one short word.' }],
  }),
  signal: AbortSignal.timeout(30000),
})

if (!response.ok) {
  throw new Error(`OpenRouter transport HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`)
}
const payload = await response.json()
const content = payload?.choices?.[0]?.message?.content
if (!content) throw new Error(`OpenRouter transport returned no content: ${JSON.stringify(payload).slice(0, 500)}`)
console.log('OpenRouter transport smoke OK')
