/**
 * The corpus pipeline's two text providers (issue #16), shared by every generation stage:
 * DeepSeek-V4-Pro on Azure AI Foundry for semantic/generative work, Azure Translator for
 * mechanical translation. Every call is checked against the budget before it is made and recorded
 * in the committed spend ledger after it (`scripts/spend-ledger.ts`, issue #27), against the issue
 * named by `CONTENT_ISSUE`. Credentials come from `.env.corpus.local` (`tsx --env-file`).
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { normalizeSentence } from '../lib/catalog-families'
import { assertBudget, recordPaid, spendLine } from './spend-ledger'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) { console.error(`Missing ${name} — is --env-file=.env.corpus.local set?`); process.exit(1) }
  return value
}

const FOUNDRY_ENDPOINT = requireEnv('AZURE_FOUNDRY_ENDPOINT')
const FOUNDRY_KEY = requireEnv('AZURE_FOUNDRY_API_KEY')
export const MODEL = requireEnv('AZURE_CORPUS_MODEL')
const TRANSLATOR_KEY = requireEnv('AZURE_TRANSLATOR_KEY')
const TRANSLATOR_ENDPOINT = requireEnv('AZURE_TRANSLATOR_ENDPOINT')
export { spendLine }

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 7): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      // A rate limit clears in tens of seconds on this deployment, so it backs off far longer.
      const rateLimited = error instanceof Error && error.message.startsWith('HTTP 429')
      const wait = rateLimited ? Math.min(90_000, 5000 * 2 ** (attempt - 1)) : Math.min(30_000, 1000 * 2 ** (attempt - 1))
      console.error(`${label} attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : String(error)} — retrying in ${wait}ms`)
      if (attempt < attempts) await sleep(wait)
    }
  }
  throw lastError
}

export function extractJson(text: string, open: '{' | '[' = '{'): unknown {
  const close = open === '{' ? '}' : ']'
  const start = text.indexOf(open)
  const end = text.lastIndexOf(close)
  if (start < 0 || end < start) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`)
  return JSON.parse(text.slice(start, end + 1))
}

/** One DeepSeek completion, recorded in the ledger under `op`; the reply text is returned as written. */
export async function deepseekText(op: string, label: string, system: string, user: string, options: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  return withRetry(`DeepSeek ${label}`, async () => {
    await assertBudget()
    const res = await fetch(`${FOUNDRY_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': FOUNDRY_KEY },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 1200,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = await res.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } }
    if (body.usage) await recordPaid({ op, model: MODEL, inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens })
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new Error('empty completion')
    return content
  })
}

/**
 * One DeepSeek completion whose reply must hold JSON; a reply without it is asked again, at most
 * twice more. Transport failures are retried inside `deepseekText` and never multiply with these.
 */
export async function deepseekJson(op: string, label: string, system: string, user: string, options: { maxTokens?: number; temperature?: number; open?: '{' | '[' } = {}): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const text = await deepseekText(op, label, system, user, options)
    try { return extractJson(text, options.open ?? '{') } catch (error) { lastError = error; console.error(`DeepSeek ${label}: reply ${attempt}/3 held no JSON`) }
  }
  throw lastError
}

const translationCachePath = 'catalog/families/translation-cache.json'
const translationCache: Record<string, string> = existsSync(translationCachePath) ? JSON.parse(await readFile(translationCachePath, 'utf8')) as Record<string, string> : {}
// Concurrent translations in one process must not write the file at the same time.
let cacheSaving: Promise<void> = Promise.resolve()
function saveTranslationCache(): Promise<void> {
  cacheSaving = cacheSaving.then(async () => {
    const onDisk = existsSync(translationCachePath) ? JSON.parse(await readFile(translationCachePath, 'utf8')) as Record<string, string> : {}
    Object.assign(translationCache, { ...onDisk, ...translationCache })
    await writeFile(translationCachePath, `${JSON.stringify(translationCache, null, 1)}\n`)
  })
  return cacheSaving
}

export async function translate(text: string, to: string, from = 'da'): Promise<string> {
  const key = `${from}>${to}:${text.trim().toLocaleLowerCase('da-DK')}`
  const cached = translationCache[key]
  if (cached) return cached
  const result = await withRetry(`Translator ${from}->${to} "${text.slice(0, 30)}…"`, async () => {
    await assertBudget()
    const res = await fetch(`${TRANSLATOR_ENDPOINT}/translate?api-version=3.0&from=${from}&to=${to}`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ Text: text }]),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = await res.json() as { translations: { text: string }[] }[]
    const out = body[0]?.translations?.[0]?.text
    if (!out) throw new Error('empty translation')
    return out
  })
  await recordPaid({ op: `translator.${from}-${to}`, chars: text.length })
  translationCache[key] = result
  await saveTranslationCache()
  return result
}

/**
 * Mechanical translation-fidelity check (issue #16 rerun, 2026-09-25): back-translate the
 * generated en/ru through Translator into Danish and compare word overlap against the original
 * Danish sentence. Round-tripping through machine translation always paraphrases somewhat, so
 * this is deliberately lenient — it exists to catch the observed defect (a translation that
 * structurally diverged from the Danish: wrong tense, dropped verb, wrong noun), not to demand a
 * literal match. Below-threshold variants are dropped rather than published.
 */
const FIDELITY_MIN_OVERLAP = 0.35
function wordOverlap(a: string, b: string): number {
  const left = new Set(a.split(' ').filter(Boolean))
  const right = new Set(b.split(' ').filter(Boolean))
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / Math.max(left.size, right.size)
}
export async function translationFidelityOk(danish: string, en: string, ru: string): Promise<boolean> {
  const backFromEn = await translate(en, 'da', 'en')
  const backFromRu = await translate(ru, 'da', 'ru')
  const original = normalizeSentence(danish)
  const enScore = wordOverlap(original, normalizeSentence(backFromEn))
  const ruScore = wordOverlap(original, normalizeSentence(backFromRu))
  if (enScore < FIDELITY_MIN_OVERLAP || ruScore < FIDELITY_MIN_OVERLAP) {
    console.log(`  fidelity check failed (en overlap ${enScore.toFixed(2)}, ru overlap ${ruScore.toFixed(2)}): "${danish}" vs back "${backFromEn}" / "${backFromRu}"`)
    return false
  }
  return true
}
