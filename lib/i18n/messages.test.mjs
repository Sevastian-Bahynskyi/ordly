import assert from 'node:assert/strict'
import test from 'node:test'
import { MESSAGES } from './index.ts'
import { ukrainianProblems } from '../ukrainian.ts'
import { loadUkrainianCheckers } from '../ukrainian-dictionaries.ts'

/** Every string a dictionary can produce, with its key path. Functions are called with sample values. */
function leaves(value, path = []) {
  if (typeof value === 'string') return [[path.join('.'), value]]
  if (typeof value === 'function') {
    const out = value(...Array.from({ length: value.length }, () => 3))
    return leaves(Array.isArray(out) ? out.join('') : out, path)
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, [...path, index]))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => leaves(item, [...path, key]))
  return []
}

const keys = (language) => leaves(MESSAGES[language]).map(([key]) => key)
// Names that stay as they are in every language, and the Danish sample words the interface quotes.
const KEPT = /Ordly|ORDLY|FSRS|GitHub|Safari|Chrome|Edge|Dock|Web Push|push|iPhone|iPad|Mac|learning-stats\.csv|synes|you@example\.com|CSV/gu

test('every language has exactly the keys English has', () => {
  assert.deepEqual(keys('ru'), keys('en'))
  assert.deepEqual(keys('uk'), keys('en'))
})

test('no Russian or Ukrainian string is left in English', () => {
  for (const language of ['ru', 'uk']) {
    for (const [key, text] of leaves(MESSAGES[language])) {
      const rest = text.replace(KEPT, '').replace(/[^\p{L}]/gu, '')
      if (!rest) continue
      assert.match(rest, /\p{Script=Cyrillic}/u, `${language}.${key} is not translated: ${text}`)
      assert.doesNotMatch(text.replace(KEPT, ''), /\b[A-Za-z]{3,}\b/u, `${language}.${key} mixes in English: ${text}`)
    }
  }
})

test('Russian strings carry no Ukrainian letters, and every Ukrainian string passes the Ukrainian check', async () => {
  for (const [key, text] of leaves(MESSAGES.ru)) assert.doesNotMatch(text, /[іїєґІЇЄҐ]/u, `ru.${key}: ${text}`)
  const spell = await loadUkrainianCheckers()
  for (const [key, text] of leaves(MESSAGES.uk)) {
    const cyrillic = text.replace(KEPT, '')
    if (!/\p{Script=Cyrillic}/u.test(cyrillic)) continue
    const problems = ukrainianProblems(cyrillic, spell)
    assert.deepEqual(problems, [], `uk.${key}: ${text}`)
  }
})

test('Practice copy has every key in all three languages, and its Ukrainian passes the Ukrainian check', async () => {
  const { PRACTICE_COPY } = await import('../practice-i18n.ts')
  const practiceKeys = (language) => leaves(PRACTICE_COPY[language]).map(([key]) => key)
  assert.deepEqual(practiceKeys('uk'), practiceKeys('en'))
  assert.deepEqual(practiceKeys('ru'), practiceKeys('en'))
  const spell = await loadUkrainianCheckers()
  for (const [key, text] of leaves(PRACTICE_COPY.uk)) {
    const cyrillic = text
    if (!/\p{Script=Cyrillic}/u.test(cyrillic)) continue
    assert.deepEqual(ukrainianProblems(cyrillic, spell), [], `practice uk.${key}: ${text}`)
  }
})
