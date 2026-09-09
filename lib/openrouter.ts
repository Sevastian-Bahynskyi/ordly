export const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free',
] as const

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const APP_URL = 'https://ordly-sevastian-bahynskyis-projects.vercel.app'

type OpenRouterOptions = {
  timeoutMs?: number
  validate?: (value: Record<string, unknown>) => boolean
}

export class OpenRouterHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`OpenRouter returned ${status}`)
    this.name = 'OpenRouterHttpError'
    this.status = status
  }
}

function extractTextContent(payload: Record<string, unknown>): string {
  const choices = payload.choices
  if (!Array.isArray(choices) || !choices.length) return ''

  const message = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined
  const content = message?.content
  if (typeof content === 'string') return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') return String((part as Record<string, unknown>).text || '')
        return ''
      })
      .join('')
      .trim()
  }

  return ''
}

async function requestModels(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const [model, ...models] = OPENROUTER_MODELS
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_URL,
      'X-Title': 'Ordly',
    },
    body: JSON.stringify({ ...body, model, models }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) throw new OpenRouterHttpError(response.status)
  return response.json() as Promise<Record<string, unknown>>
}

export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

export function isOpenRouterRateLimitError(error: unknown): boolean {
  return error instanceof OpenRouterHttpError && error.status === 429
}

export async function openRouterJson(
  body: Record<string, unknown>,
  label: string,
  options: OpenRouterOptions = {},
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error(`${label}: OpenRouter is not configured`)

  const { model: _model, models: _models, reasoning_effort: _reasoningEffort, ...baseBody } = body
  const responseFormat = baseBody.response_format as Record<string, unknown> | undefined
  const payload = await requestModels(apiKey, {
    ...baseBody,
    max_tokens: baseBody.max_tokens ?? 300,
    ...(responseFormat ? { response_format: { type: 'json_object' } } : {}),
  }, options.timeoutMs ?? 10000)
  const content = extractTextContent(payload)
  if (!content) throw new Error(`${label}: OpenRouter returned an empty response`)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    throw new Error(`${label}: OpenRouter returned invalid JSON`)
  }

  if (options.validate && !options.validate(parsed)) {
    throw new Error(`${label}: OpenRouter returned an invalid result`)
  }

  return parsed
}
