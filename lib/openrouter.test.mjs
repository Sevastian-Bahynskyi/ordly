import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOpenRouterRequestBody, normalizeOpenRouterBody, OPENROUTER_MODEL_ROUTES } from './openrouter.ts'

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

test('preserves required schema fields when using JSON object mode', () => {
  const payload = normalizeOpenRouterBody({
    messages: [{ role: 'system', content: 'Create an example sentence.' }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'example',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            example_sentence: { type: 'string' },
            example_translation: { type: 'string' },
          },
          required: ['example_sentence', 'example_translation'],
          additionalProperties: false,
        },
      },
    },
  })

  const messages = payload.messages
  assert.ok(Array.isArray(messages))
  assert.match(String(messages[0]?.content), /JSON/)
  assert.match(String(messages[0]?.content), /example_sentence/)
  assert.match(String(messages[0]?.content), /example_translation/)
})
