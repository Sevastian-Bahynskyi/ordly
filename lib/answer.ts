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
  return 'incorrect'
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
