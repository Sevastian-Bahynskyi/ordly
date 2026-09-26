import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateBatch, profileFromRuns } from './content-estimate.ts'

const line = (op, scope, quantities) => ({ service: op.split('.')[0], op, model: op.startsWith('deepseek') ? 'DeepSeek-V4-Pro' : null, scope, calls: 1, inputTokens: 0, outputTokens: 0, chars: 0, seconds: 0, usd: 0, ...quantities })
const calibration = [{
  run: 'c', issue: 27, batch: 'calibration-0001', command: 'x', startedAt: '', updatedAt: '', estimateUsd: null,
  lines: [
    line('deepseek.generate', 'family', { calls: 10, inputTokens: 100_000, outputTokens: 20_000 }),
    line('translator.da-uk', 'family', { calls: 30, chars: 2_000 }),
    line('speech.tts', 'family', { calls: 30, chars: 4_000 }),
    line('deepseek.entry-senses', 'entry', { calls: 5, inputTokens: 10_000, outputTokens: 5_000 }),
  ],
}]

test('a profile is the calibration spend per unit, by scope', () => {
  const profile = profileFromRuns(calibration, { family: { units: 10, items: { sentence: 30 } }, entry: { units: 5, items: { meaning: 6, example: 6 } } }, 'calibration-0001')
  assert.equal(profile.units.family.units, 10)
  assert.equal(profile.units.family.lines.find((entry) => entry.op === 'deepseek.generate').inputTokens, 100_000)
  assert.equal(profile.source, 'calibration-0001')
})

test('an estimate scales the profile to the batch and prices it at current list prices', () => {
  const profile = profileFromRuns(calibration, { family: { units: 10, items: { sentence: 30 } }, entry: { units: 5, items: { meaning: 6, example: 6 } } }, 'c')
  const estimate = estimateBatch({ family: 20, entry: 0 }, profile, { audio: true })
  // 2× the family calibration: 200k in, 40k out tokens; 4,000 translator chars; 8,000 TTS chars.
  const expected = 200_000 * 1.74e-6 + 40_000 * 3.48e-6 + 4_000 * 10e-6 + 8_000 * 15e-6
  assert.equal(estimate.usd.toFixed(6), expected.toFixed(6))
  assert.equal(estimate.items.sentence, 60)
  const silent = estimateBatch({ family: 20, entry: 0 }, profile, { audio: false })
  assert.equal(silent.byService.speech, 0)
  assert.ok(silent.usd < estimate.usd)
})

test('a unit type the profile has never measured cannot be estimated', () => {
  const profile = profileFromRuns(calibration, { family: { units: 10, items: { sentence: 30 } } }, 'c')
  assert.throws(() => estimateBatch({ family: 1, entry: 3 }, profile, { audio: true }), /entry/u)
})
