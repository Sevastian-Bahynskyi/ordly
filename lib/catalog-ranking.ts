import type { PartOfSpeech } from './types'

/**
 * The frequency ranking the catalog is built in (issue #6 §4, step 0).
 *
 * Source: the DSL lemma frequency list (korpus.dsl.dk), three tab-separated fields per line —
 * part of speech, lemma, frequency — over ~1.1 billion tokens. It is licence-gated, so it is
 * never committed and never downloaded automatically; the operator accepts the terms and passes
 * the file in. Nothing here assumes the file is sorted: the rank is assigned from the frequency.
 *
 * Frequency order is load-bearing rather than cosmetic. The build can stop at any point, and what
 * has been built is always the most valuable remainder.
 */
export interface RankedLemma {
  lemma: string
  pos: PartOfSpeech | null
  frequency: number
  /** 1-based, assigned here by descending frequency. */
  rank: number
}

/** The abbreviations Danish frequency lists use, mapped onto Ordly's parts of speech. */
const RANKING_PARTS_OF_SPEECH: Record<string, PartOfSpeech> = {
  sb: 'noun',
  vb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  præp: 'preposition',
  konj: 'conjunction',
  talord: 'numeral',
  udråbsord: 'interjection',
  interj: 'interjection',
  flerord: 'phrase',
}

/** Word classes that are not vocabulary worth teaching, dropped before ranking. */
const EXCLUDED_CLASSES = new Set(['prop', 'propr', 'forkortelse', 'fork', 'symbol', 'romertal'])

function classKey(value: string): string {
  return value.trim().toLocaleLowerCase('da-DK').replace(/\.$/u, '')
}

export function rankingPartOfSpeech(value: string): PartOfSpeech | null {
  return RANKING_PARTS_OF_SPEECH[classKey(value)] || null
}

export function isExcludedClass(value: string): boolean {
  return EXCLUDED_CLASSES.has(classKey(value))
}

export interface RankingOptions {
  /** Keep only this many lemmas. `null` keeps all of them. */
  limit?: number | null
  /** Drop proper nouns, abbreviations and symbols. On by default: they are not vocabulary. */
  excludeProperNouns?: boolean
}

/**
 * The ranked lemmas of one frequency file.
 *
 * A lemma listed under several word classes keeps its highest frequency and the class that
 * carried it, because the catalog stores one row per lemma. A line that is not three usable
 * fields is skipped rather than guessed at — the file is reference data and a malformed line
 * means the file is not what we think it is, not that a default should be invented.
 */
export function parseRanking(text: string, options: RankingOptions = {}): RankedLemma[] {
  const excludeProperNouns = options.excludeProperNouns !== false
  const best = new Map<string, { lemma: string; pos: PartOfSpeech | null; frequency: number }>()

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const fields = line.split('\t').map((field) => field.trim())
    if (fields.length < 3) continue
    const [rawClass, lemma, rawFrequency] = fields
    if (!lemma || (excludeProperNouns && isExcludedClass(rawClass))) continue
    const frequency = Number(rawFrequency)
    if (!Number.isFinite(frequency) || frequency <= 0) continue
    // A lemma is stored lowercased, because that is how COR and the catalog are keyed.
    const key = lemma.toLocaleLowerCase('da-DK')
    const previous = best.get(key)
    if (!previous || frequency > previous.frequency) {
      best.set(key, { lemma: key, pos: rankingPartOfSpeech(rawClass), frequency })
    }
  }

  const sorted = [...best.values()].sort((left, right) => right.frequency - left.frequency
    || left.lemma.localeCompare(right.lemma, 'da-DK'))
  const limit = options.limit === undefined || options.limit === null ? sorted.length : options.limit
  return sorted.slice(0, Math.max(0, limit)).map((entry, index) => ({ ...entry, rank: index + 1 }))
}

/**
 * How much of a real vocabulary a ranking of each depth would have covered (issue #6 step 0).
 *
 * This is the gate that decides whether the build is worth paying for, and it is measured against
 * words actually added rather than against running text. The two are not the same curve: the
 * words a learner stops on are, by definition, not the ones they already know.
 */
export function coverageAtDepths(
  ranking: readonly RankedLemma[],
  vocabulary: readonly string[],
  depths: readonly number[],
): { depth: number; covered: number; total: number; rate: number }[] {
  const rankByLemma = new Map(ranking.map((entry) => [entry.lemma, entry.rank]))
  const wanted = vocabulary.map((word) => word.trim().toLocaleLowerCase('da-DK')).filter(Boolean)
  return depths.map((depth) => {
    const covered = wanted.filter((word) => {
      const rank = rankByLemma.get(word)
      return rank !== undefined && rank <= depth
    }).length
    return { depth, covered, total: wanted.length, rate: wanted.length ? covered / wanted.length : 0 }
  })
}
