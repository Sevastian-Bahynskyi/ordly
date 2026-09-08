const apiKey = process.env.OPENROUTER_API_KEY

if (!process.env.VERCEL) process.exit(0)
if (!apiKey) throw new Error('OPENROUTER_API_KEY missing')

let response
try {
  response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Say OK.' }],
    }),
    signal: AbortSignal.timeout(15000),
  })
} catch (error) {
  throw new Error(`Expected HTTP 429 but transport threw: ${error}`)
}

if (response.status !== 429) {
  throw new Error(`Expected HTTP 429 probe; got ${response.status}`)
}
console.log('Confirmed OpenRouter HTTP 429')
