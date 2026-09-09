import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOpenRouterRequestBody, OPENROUTER_MODEL_ROUTES } from './openrouter.ts'

test('disables reasoning for short structured Qwen tasks', () => {
  const payload = buildOpenRouterRequestBody(
    { max_tokens: 160, response_format: { type: 'json_object' } },
    OPENROUTER_MODEL_ROUTES.translation,
  )

  assert.deepEqual(payload.reasoning, { enabled: false })
})

test('preserves an explicit reasoning configuration', () => {
  const payload = buildOpenRouterRequestBody(
    { reasoning: { effort: 'low' } },
    OPENROUTER_MODEL_ROUTES.default,
  )

  assert.deepEqual(payload.reasoning, { effort: 'low' })
})
