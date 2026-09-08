if (!process.env.VERCEL) {
  console.log('Pronunciation smoke: skipped outside Vercel')
  process.exit(0)
}

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('Pronunciation smoke: OPENROUTER_API_KEY is missing in Vercel')
}

console.log('Pronunciation smoke: Vercel has OPENROUTER_API_KEY')
