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
  /**
   * Senses of entries joined to this one by a `synonym` edge (§4). Build them with
   * `linkedSensesFor` in lib/synonyms.ts, which keeps the a_id/b_id direction straight.
   *
   * Opt-in, exactly like `senses`: with nothing passed the candidate set is unchanged. Grading
   * stays deterministic and offline — resolving the edges is the caller's job, not a network
   * call from here.
   */
  linkedSenses?: readonly EntrySense[] | null
}

export function checkAnswer(input: string, expected: string, options: CheckAnswerOptions = {}): AnswerResult {
  const fromExpected = options.sentence ? [expected] : expected.split(/[;,/]/)
  const fromSenses = (options.senses || []).filter((sense) => !sense.removed_at).map((sense) => sense.text)
  const fromLinked = (options.linkedSenses || []).filter((sense) => !sense.removed_at).map((sense) => sense.text)
  const candidates = [...new Set([...fromExpected, ...fromSenses, ...fromLinked].map(base).filter(Boolean))]
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

  // A typing slip in Danish is close, not wrong. Meaning recall is left to the synonym graph and
  // the semantic check: in the learner's own language one letter can be a different word.
  if (!options.meaning) {
    for (const candidate of candidates) {
      const expectedText = relaxed(candidate)
      if (editDistance(relaxed(actual), expectedText) <= typoAllowance(expectedText, Boolean(options.sentence))) return 'mostly'
    }
  }
  return 'incorrect'
}

/**
 * How many edits still count as a slip. Short words get none, so `en`/`er` or `hus`/`hun` stay
 * different words; sentences get very few, so a dropped `ikke` is never a typo.
 */
export function typoAllowance(expected: string, sentence: boolean): number {
  const length = [...expected].length
  if (sentence && expected.includes(' ')) return Math.min(2, Math.floor(length / 16))
  if (length <= 4) return 0
  if (length <= 8) return 1
  return 2
}

/** Optimal string alignment distance: insertions, deletions, substitutions and adjacent swaps. */
export function editDistance(left: string, right: string): number {
  const a = [...left]
  const b = [...right]
  if (!a.length) return b.length
  if (!b.length) return a.length
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
    }
  }
  return rows[a.length][b.length]
}

/**
 * The ids of the senses a typed meaning actually named, for coverage (D9, D18).
 *
 * Uses the same equivalences `checkAnswer` accepts for a meaning — exact after normalization,
 * Russian ё/ъ spelling, and the æøå-relaxed form — so a sense is credited exactly when grading
 * would have accepted the answer on that sense's text alone. Removed senses are never credited.
 */
export function matchingSenseIds(input: string, senses: readonly EntrySense[] | null | undefined): string[] {
  const actual = base(input)
  if (!actual) return []
  const spelling = (value: string): string => value.replaceAll('ё', 'е').replaceAll('ъ', '')
  return (senses || [])
    .filter((sense) => !sense.removed_at)
    .filter((sense) => {
      const candidate = base(sense.text)
      return Boolean(candidate) && (candidate === actual || spelling(candidate) === spelling(actual) || relaxed(candidate) === relaxed(actual))
    })
    .map((sense) => sense.id)
}
