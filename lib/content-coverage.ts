/**
 * Text and learning coverage of the supplied content (issue #16; spec #12 decision 15).
 *
 * Three separate measures, never added together:
 *
 * 1. **Weighted lemma coverage within DSL's `freq-30k-ex` list.** The share of the list's summed
 *    frequency carried by lemmas the catalog supports — a lemma in a word class the catalog has a
 *    sense for, worded in the learner language. It is coverage *of that list*, not of all Danish
 *    text, and it is reported per frequency band and for open and closed classes separately so
 *    function words cannot hide lexical gaps.
 * 2. **Token, lemma and sentence coverage of a frozen, unseen sentence set** — the independent
 *    check, chosen before the content was tuned.
 * 3. **Learning coverage of an A1–B2 situation/grammar matrix**: which cells have gated sentence
 *    families in both learner languages.
 *
 * None of these certifies a learner's level.
 */

/** DSL word-class codes the catalog can hold, and the catalog part of speech each one means. */
export const DSL_CLASSES: Record<string, string> = {
  NC: 'noun', V: 'verb', A: 'adjective', D: 'adverb',
  T: 'preposition', P: 'pronoun', C: 'conjunction', L: 'numeral', I: 'interjection',
}
export const OPEN_CLASSES = new Set(['NC', 'V', 'A', 'D'])

export interface FrequencyRow { cls: string; lemma: string; freq: number; rank: number }

/** The list as shipped: class, lemma, proportion. Classes outside `DSL_CLASSES` are excluded. */
export function parseFrequencyList(text: string): { rows: FrequencyRow[]; excluded: Record<string, number> } {
  const rows: FrequencyRow[] = []
  const excluded: Record<string, number> = {}
  for (const line of text.split(/\r?\n/u)) {
    const [cls, lemma, freq] = line.split('\t')
    if (!cls || !lemma || !freq) continue
    if (!DSL_CLASSES[cls]) { excluded[cls] = (excluded[cls] || 0) + 1; continue }
    rows.push({ cls, lemma, freq: Number(freq), rank: rows.length + 1 })
  }
  return { rows, excluded }
}

/** `lemma|pos` pairs the catalog supports in one learner language. */
export type SupportedSet = ReadonlySet<string>

export function supportKey(lemma: string, pos: string): string {
  return `${lemma.toLocaleLowerCase('da-DK')}|${pos}`
}

export const BANDS: [number, number][] = [[1, 1000], [1001, 2000], [2001, 3000], [3001, 5000], [5001, 10000], [10001, 30000]]

export interface WeightedCoverage {
  overall: number
  covered: number
  lemmas: number
  bands: { from: number; to: number; coverage: number; covered: number; lemmas: number }[]
  open: number
  closed: number
}

export function weightedCoverage(rows: readonly FrequencyRow[], supported: SupportedSet): WeightedCoverage {
  const hit = (row: FrequencyRow) => supported.has(supportKey(row.lemma, DSL_CLASSES[row.cls]))
  const share = (subset: readonly FrequencyRow[]) => {
    const total = subset.reduce((sum, row) => sum + row.freq, 0)
    return total ? subset.filter(hit).reduce((sum, row) => sum + row.freq, 0) / total : 0
  }
  return {
    overall: share(rows),
    covered: rows.filter(hit).length,
    lemmas: rows.length,
    bands: BANDS.map(([from, to]) => {
      const band = rows.filter((row) => row.rank >= from && row.rank <= to)
      return { from, to, coverage: share(band), covered: band.filter(hit).length, lemmas: band.length }
    }),
    open: share(rows.filter((row) => OPEN_CLASSES.has(row.cls))),
    closed: share(rows.filter((row) => !OPEN_CLASSES.has(row.cls))),
  }
}

export interface TextCoverage {
  sentences: number
  tokens: number
  /** Tokens no form list knows (names, foreign words): reported, and left out of the rates. */
  unknownTokens: number
  tokenCoverage: number
  lemmas: number
  lemmaCoverage: number
  /** Sentences in which every known token is covered. */
  sentenceCoverage: number
}

/**
 * Coverage of running text. A token is covered when any lemma the form list gives for it (or the
 * token itself) is a catalog lemma: the form list cannot say which reading a token is, so this is
 * an upper bound on the lemma side, stated as such in the report.
 */
export function textCoverage(sentences: readonly string[], lemmasOf: (form: string) => readonly string[] | undefined, catalogLemmas: ReadonlySet<string>): TextCoverage {
  let tokens = 0
  let unknown = 0
  let covered = 0
  let full = 0
  const seen = new Map<string, boolean>()
  for (const sentence of sentences) {
    let all = true
    for (const match of sentence.matchAll(/\p{L}+(?:['’-]\p{L}+)*/gu)) {
      const token = match[0].toLocaleLowerCase('da-DK')
      const candidates = lemmasOf(token)
      if (!candidates?.length && !catalogLemmas.has(token)) { unknown += 1; continue }
      tokens += 1
      const lemmas = [...new Set([token, ...(candidates || [])])]
      const inCatalog = lemmas.find((lemma) => catalogLemmas.has(lemma))
      const lemma = inCatalog || (candidates && candidates[0]) || token
      seen.set(lemma, Boolean(inCatalog))
      if (inCatalog) covered += 1
      else all = false
    }
    if (all) full += 1
  }
  const lemmaHits = [...seen.values()].filter(Boolean).length
  return {
    sentences: sentences.length, tokens, unknownTokens: unknown,
    tokenCoverage: tokens ? covered / tokens : 0,
    lemmas: seen.size, lemmaCoverage: seen.size ? lemmaHits / seen.size : 0,
    sentenceCoverage: sentences.length ? full / sentences.length : 0,
  }
}

export interface MatrixCell { axis: 'situation' | 'grammar'; id: string; level: string; families: number; sentences: number }

/** Families per matrix cell; a cell the matrix does not list is never credited. */
export function matrixCoverage(
  matrix: { situations: { id: string; levels: string[] }[]; grammar: { id: string; levels: string[] }[] },
  families: readonly { level: string; situation: string; grammar: string; variants: readonly unknown[] }[],
): MatrixCell[] {
  const cells: MatrixCell[] = []
  for (const [axis, list] of [['situation', matrix.situations], ['grammar', matrix.grammar]] as const) {
    for (const entry of list) for (const level of entry.levels) {
      const inCell = families.filter((family) => family.level === level && (axis === 'situation' ? family.situation : family.grammar) === entry.id)
      cells.push({ axis, id: entry.id, level, families: inCell.length, sentences: inCell.reduce((sum, family) => sum + family.variants.length, 0) })
    }
  }
  return cells
}
