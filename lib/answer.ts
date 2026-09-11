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

export function checkAnswer(input: string, expected: string, options: { sentence?: boolean } = {}): AnswerResult {
  const candidates = (options.sentence ? [expected] : expected.split(/[;,/]/)).map(base).filter(Boolean)
  const actual = base(input)
  if (!actual) return 'incorrect'
  if (candidates.includes(actual)) return 'correct'

  for (const candidate of candidates) {
    if (relaxed(candidate) === relaxed(actual)) return 'mostly'
  }
  return 'incorrect'
}
