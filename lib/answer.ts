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

function distance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}

export function checkAnswer(input: string, expected: string): AnswerResult {
  const candidates = expected.split(/[;,/]/).map(base).filter(Boolean)
  const actual = base(input)
  if (!actual) return 'incorrect'
  if (candidates.includes(actual)) return 'correct'

  for (const candidate of candidates) {
    if (relaxed(candidate) === relaxed(actual)) return 'mostly'
    const allowed = Math.max(1, Math.floor(candidate.length * 0.16))
    if (distance(relaxed(candidate), relaxed(actual)) <= allowed) return 'mostly'
  }
  return 'incorrect'
}
