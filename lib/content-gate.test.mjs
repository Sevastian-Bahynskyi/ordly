import assert from 'node:assert/strict'
import test from 'node:test'
import { entryProblems } from './content-gate.ts'
import { loadUkrainianCheckers } from './ukrainian-dictionaries.ts'

const spell = await loadUkrainianCheckers()
const sense = (patch = {}) => ({
  ordinal: 1, ru: 'останавливаться, глохнуть', en: 'to stall, to come to a standstill', uk: 'зупинятися, глухнути',
  example: 'Forhandlingerne gik i stå i går.', example_en: 'The negotiations stalled yesterday.', example_ru: 'Переговоры вчера зашли в тупик.', example_uk: 'Переговори вчора зайшли в глухий кут.',
  ...patch,
})
const entry = { lemma: 'gå i stå', kind: 'phrase', pos: 'verb', forms: ['gå i stå', 'går i stå', 'gik i stå', 'gået i stå'] }
const check = (senses, unknown = () => []) => entryProblems(entry, senses, { spell, unknownWords: unknown })

test('a clean sense passes the gate', () => {
  assert.deepEqual(check([sense()]), [])
})

test('wordings in the wrong language or script are caught', () => {
  const problems = check([sense({ ru: 'to stall', uk: 'останавливаться', en: 'at gå i stå' })])
  assert.ok(problems.some((problem) => /ru/u.test(problem)))
  assert.ok(problems.some((problem) => /uk wording/u.test(problem)))
  assert.ok(problems.some((problem) => /en/u.test(problem)))
})

test('the example must use one verified form once, spelled correctly, with every translation', () => {
  assert.ok(check([sense({ example: 'Forhandlingerne stoppede i går.' })]).some((problem) => /form/u.test(problem)))
  assert.ok(check([sense({ example: 'Motoren gik i stå, og bilen gik i stå.' })]).some((problem) => /form/u.test(problem)))
  assert.ok(check([sense({ example_uk: '' })]).some((problem) => /example_uk/u.test(problem)))
  assert.ok(check([sense({ example: 'Den gik i stå 3 gange.' })]).some((problem) => /digit/u.test(problem)))
  assert.ok(check([sense()], () => ['forhandlingerne']).some((problem) => /unknown/u.test(problem)))
})

test('two senses of one entry cannot share a wording', () => {
  const problems = check([sense(), sense({ ordinal: 2, en: 'to stall, to come to a standstill' })])
  assert.ok(problems.some((problem) => /same as sense 1/u.test(problem)))
})
