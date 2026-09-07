export const OPENROUTER_MODELS = [
  'z-ai/glm-5.2:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
] as const

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const APP_URL = 'https://ordly-sevastian-bahynskyis-projects.vercel.app'

type OpenRouterOptions = {
  timeoutMs?: number
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
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': APP_URL,
          'X-Title': 'Ordly',
        },
        body: JSON.stringify({
          ...baseBody,
          ...(responseFormat ? { response_format: responseFormat } : {}),
          model,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        const details = await response.text().catch(() => '')
        throw new Error(`${model} returned ${response.status}${details ? `: ${details.slice(0, 220)}` : ''}`)
      }

      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content
      if (!content || typeof content !== 'string') throw new Error(`${model} returned an empty response`)

      try {
        return JSON.parse(content) as Record<string, unknown>
      } catch {
        throw new Error(`${model} returned invalid JSON`)
      }
    } catch (error) {
      lastError = error
      console.warn(`OpenRouter ${label} failed on ${model}; trying fallback`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label}: all OpenRouter models failed`)
}
