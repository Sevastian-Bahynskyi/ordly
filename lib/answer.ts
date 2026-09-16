import type { EntrySense } from './types'

export type AnswerResult = 'correct' | 'mostly' | 'incorrect'

function base(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('da-DK')
    .replace(/[.,!?;:"'()\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
}

function relaxed(value: string) {
  return base(value)
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
}

export interface CheckAnswerOptions {
  sentence?: boolean
  meaning?: boolean
  /**
   * The entry's senses. Every non-removed sense text is accepted as correct on its own.
   * Sense texts are already one meaning each, so they are never split further — that is
   * what keeps a sentence entry's single sense intact.
   */
  senses?: readonly EntrySense[] | null
}

export function checkAnswer(input: string, expected: string, options: CheckAnswerOptions = {}): AnswerResult {
  const fromExpected = options.sentence ? [expected] : expected.split(/[;,/]/)
  const fromSenses = (options.senses || []).filter((sense) => !sense.removed_at).map((sense) => sense.text)
  const candidates = [...new Set([...fromExpected, ...fromSenses].map(base).filter(Boolean))]
  const actual = base(input)
  if (!actual) return 'incorrect'
  if (candidates.includes(actual)) return 'correct'

  if (options.meaning) {
    const spelling = (value: string): string => value.replaceAll('ё', 'е').replaceAll('ъ', '')
    if (candidates.some((candidate) => spelling(candidate) === spelling(actual))) return 'correct'
  }

  for (const candidate of candidates) {
    if (relaxed(candidate) === relaxed(actual)) return 'mostly'
  }
  return 'incorrect'
}
