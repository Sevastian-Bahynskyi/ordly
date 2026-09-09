export const OPENROUTER_MODEL_ROUTES = {
  pronunciation: ['google/gemini-3.1-flash-lite', 'qwen/qwen3.7-flash'],
  translation: ['qwen/qwen3.7-flash'],
  danishCorrection: ['qwen/qwen3.7-flash'],
  semanticGrading: ['qwen/qwen3.7-flash'],
  examples: ['qwen/qwen3.7-flash'],
  iconConcept: ['qwen/qwen3.7-flash'],
  default: ['qwen/qwen3.7-flash'],
} as const

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const APP_URL = 'https://ordly-sevastian-bahynskyis-projects.vercel.app'

type OpenRouterOptions = {
  models?: readonly string[]
  timeoutMs?: number
  validate?: (value: Record<string, unknown>) => boolean
}

export function buildOpenRouterRequestBody(
  body: Record<string, unknown>,
  models: readonly string[],
): Record<string, unknown> {
  const [model, ...fallbackModels] = models
  if (!model) throw new Error('OpenRouter model route is empty')

  return {
    ...body,
    reasoning: body.reasoning ?? { enabled: false },
    model,
    ...(fallbackModels.length ? { models: fallbackModels } : {}),
  }
}

export function normalizeOpenRouterBody(body: Record<string, unknown>): Record<string, unknown> {
  const { model: _model, models: _models, reasoning_effort: _reasoningEffort, ...baseBody } = body
  const responseFormat = baseBody.response_format as Record<string, unknown> | undefined
  const jsonSchema = responseFormat?.json_schema as Record<string, unknown> | undefined
  const schema = jsonSchema?.schema as Record<string, unknown> | undefined
  const messages = Array.isArray(baseBody.messages) ? baseBody.messages : []
  const jsonInstruction = schema
    ? `Return only valid JSON matching this exact JSON Schema. Include every required field and no additional fields: ${JSON.stringify(schema)}`
    : 'Return only a valid JSON object with the requested fields and no surrounding text.'

  return {
    ...baseBody,
    max_tokens: baseBody.max_tokens ?? 300,
    ...(responseFormat
      ? {
          messages: [{ role: 'system', content: jsonInstruction }, ...messages],
          response_format: { type: 'json_object' },
        }
      : {}),
  }
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
  models: readonly string[],
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_URL,
      'X-Title': 'Ordly',
    },
    body: JSON.stringify(buildOpenRouterRequestBody(body, models)),
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

  const payload = await requestModels(
    apiKey,
    normalizeOpenRouterBody(body),
    options.models ?? OPENROUTER_MODEL_ROUTES.default,
    options.timeoutMs ?? 10000,
  )
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
