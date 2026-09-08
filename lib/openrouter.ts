export const OPENROUTER_MODELS = [
  'z-ai/glm-5.3-flash:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
] as const

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const APP_URL = 'https://ordly-sevastian-bahynskyis-projects.vercel.app'

type OpenRouterOptions = {
  timeoutMs?: number
  validate?: (value: Record<string, unknown>) => boolean
}

type OpenRouterTextOptions = {
  primaryTimeoutMs?: number
  fallbackTimeoutMs?: number
  validate?: (value: string) => boolean
}

function responseFormatForModel(body: Record<string, unknown>, model: string) {
  const responseFormat = body.response_format as Record<string, unknown> | undefined
  if (!responseFormat) return undefined

  // The free Gemma endpoint supports JSON output but does not enforce JSON Schema.
  // Keep it useful as a fallback and rely on our runtime parsing/validation afterward.
  if (model === 'google/gemma-4-31b-it:free' && responseFormat.type === 'json_schema') {
    return { type: 'json_object' }
  }

  return responseFormat
}

function extractTextContent(payload: Record<string, unknown>) {
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

async function requestModel(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_URL,
      'X-Title': 'Ordly',
    },
    body: JSON.stringify({ ...body, model }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`${model} returned ${response.status}${details ? `: ${details.slice(0, 220)}` : ''}`)
  }

  return response.json() as Promise<Record<string, unknown>>
}

export function hasOpenRouterKey() {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

export async function openRouterJson(
  body: Record<string, unknown>,
  label: string,
  options: OpenRouterOptions = {},
) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error(`${label}: OpenRouter is not configured`)

  const { model: _model, models: _models, reasoning_effort: _reasoningEffort, ...baseBody } = body
  const timeoutMs = options.timeoutMs ?? 12000
  let lastError: unknown

  for (const model of OPENROUTER_MODELS) {
    try {
      const responseFormat = responseFormatForModel(baseBody, model)
      const payload = await requestModel(apiKey, model, {
        ...baseBody,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }, timeoutMs)
      const content = extractTextContent(payload)
      if (!content) throw new Error(`${model} returned an empty response`)

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(content) as Record<string, unknown>
      } catch {
        throw new Error(`${model} returned invalid JSON`)
      }

      if (options.validate && !options.validate(parsed)) {
        throw new Error(`${model} returned an invalid ${label} result`)
      }

      return parsed
    } catch (error) {
      lastError = error
      console.warn(`OpenRouter ${label} failed on ${model}; trying fallback`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label}: all OpenRouter models failed`)
}

export async function openRouterText(
  body: Record<string, unknown>,
  label: string,
  options: OpenRouterTextOptions = {},
) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error(`${label}: OpenRouter is not configured`)

  const {
    model: _model,
    models: _models,
    reasoning_effort: _reasoningEffort,
    response_format: _responseFormat,
    ...baseBody
  } = body
  let lastError: unknown

  for (let index = 0; index < OPENROUTER_MODELS.length; index += 1) {
    const model = OPENROUTER_MODELS[index]
    const timeoutMs = index === 0
      ? options.primaryTimeoutMs ?? 10000
      : options.fallbackTimeoutMs ?? 14000

    try {
      const payload = await requestModel(apiKey, model, baseBody, timeoutMs)
      const content = extractTextContent(payload)
      if (!content) throw new Error(`${model} returned an empty response`)
      if (options.validate && !options.validate(content)) {
        throw new Error(`${model} returned an invalid ${label} result`)
      }
      return content
    } catch (error) {
      lastError = error
      console.warn(`OpenRouter ${label} failed on ${model}; trying fallback`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label}: all OpenRouter models failed`)
}
