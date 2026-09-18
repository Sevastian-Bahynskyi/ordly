import type { CatalogFact, CatalogGeneratedRow } from './catalog-contract'

/**
 * The sampled audit, issue #6 step 5 — the step that is not automatable and not skippable.
 *
 * The deterministic gate (§9) has already rejected everything mechanically checkable, so the
 * audit's entire value is the residue: rows that are well-formed and wrong. A translation that is
 * plausible but not what the word means passes every validator — `bare` glossed as "только что"
 * instead of "только" is Cyrillic, non-empty and in the right script, and it is exactly the
 * mistake that made the synonym graph link `bare` to `lige` (AGENTS.md §20).
 *
 * **The sample is stratified, not uniform.** Uniform random over ten thousand rows is mostly a
 * sample of the comfortable middle: it returns a reassuring number while under-sampling the shapes
 * that actually fail — the tail of the frequency list, the words COR could not classify, the rows
 * where the generator was allowed to choose. Every stratum here exists because something specific
 * can go wrong in it.
 */
export const AUDIT_SAMPLE_SIZE = 200

/** What an auditor can find that no validator can. Each one is a way to be well-formed and wrong. */
export const AUDIT_FAILURE_CLASSES = [
  'translation_wrong',
  'sense_split_wrong',
  'pronunciation_mismatch',
  'example_wrong_sense',
  'example_translation_mismatch',
  'level_drift',
] as const

export type AuditFailureClass = typeof AUDIT_FAILURE_CLASSES[number]

export const AUDIT_FAILURE_LABELS: Record<AuditFailureClass, string> = {
  translation_wrong: 'The Russian meaning is not what the Danish word means',
  sense_split_wrong: 'The meanings are one meaning split, or a common meaning is missing',
  pronunciation_mismatch: 'The Cyrillic does not read as the IPA says the word sounds',
  example_wrong_sense: 'The example contains the word but does not demonstrate that meaning',
  example_translation_mismatch: 'The Russian does not translate the Danish example',
  level_drift: 'The example is not simple everyday Danish',
}

export type AuditStratum =
  | 'head'
  | 'tail'
  | 'pos_unsettled'
  | 'no_ipa'
  | 'three_senses'
  | 'phrase'
  | 'general'

export const AUDIT_STRATUM_REASONS: Record<AuditStratum, string> = {
  head: 'The most frequent words. A defect here is the one you will meet.',
  tail: 'The deep end of the ranking, where meanings get thin and examples get strange.',
  pos_unsettled: 'COR could not classify the lemma, so the generator chose — and can be wrong.',
  no_ipa: 'No IPA was found, so the pronunciation must be null. Check nobody quietly filled it.',
  three_senses: 'The most over-generated shape: three meanings where there is really one.',
  phrase: 'Judged without the register, since COR holds no multi-word entries.',
  general: 'Drawn at random across everything else, including every batch.',
}

export interface AuditRow {
  fact: CatalogFact
  row: CatalogGeneratedRow
  /** Which output file this row came from, so a batch that drifted late is visible. */
  batch: string
}

export interface AuditSampleEntry extends AuditRow {
  stratum: AuditStratum
}

/**
 * Deterministic, seedable PRNG (mulberry32).
 *
 * A sample nobody can redraw is a sample nobody can check. The seed goes in the report, so the
 * same audit can be reproduced exactly, and a second auditor can be given the same rows.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

/**
 * Every stratum a row belongs to, rarest first.
 *
 * A row can qualify several ways — a tail word COR could not classify is both — and it is
 * assigned to the rarest, because the rare strata are the ones a uniform draw would miss.
 */
export function strataOf(entry: AuditRow, deepRankFloor: number): AuditStratum[] {
  const { fact, row } = entry
  const strata: AuditStratum[] = []
  if (fact.kind === 'phrase') strata.push('phrase')
  if (fact.ipa === null) strata.push('no_ipa')
  if (fact.pos === null) strata.push('pos_unsettled')
  if (row.senses.length >= 3) strata.push('three_senses')
  if (fact.freq_rank !== null && fact.freq_rank >= deepRankFloor) strata.push('tail')
  if (fact.freq_rank !== null && fact.freq_rank <= 1000) strata.push('head')
  strata.push('general')
  return strata
}

const STRATUM_SHARE: Record<Exclude<AuditStratum, 'general'>, number> = {
  pos_unsettled: 0.15,
  no_ipa: 0.12,
  three_senses: 0.12,
  tail: 0.15,
  head: 0.15,
  phrase: 0.11,
}

/**
 * The rows to read, stratified and reproducible.
 *
 * Quotas are shares of the sample, not guarantees: a stratum with fewer rows than its quota
 * contributes what it has and the remainder falls through to `general`, so the sample is always
 * the requested size when the corpus can fill it. Every batch is represented because `general` is
 * drawn from the whole shuffled pool.
 */
export function drawAuditSample(
  rows: readonly AuditRow[],
  options: { size?: number; seed?: number } = {},
): AuditSampleEntry[] {
  const size = options.size ?? AUDIT_SAMPLE_SIZE
  if (!Number.isInteger(size) || size < 1) throw new Error('Audit sample size must be a positive integer')
  const random = seededRandom(options.seed ?? 1)

  const ranks = rows.map((entry) => entry.fact.freq_rank).filter((rank): rank is number => rank !== null)
  const deepest = ranks.length ? Math.max(...ranks) : 0
  // "Tail" is the last tenth of what was actually built, not a fixed rank: a 3,000-word catalog
  // has a tail too, and hard-coding 9,000 would simply never sample it.
  const deepRankFloor = Math.max(1, Math.ceil(deepest * 0.9))

  const pool = shuffled(rows, random)
  const taken = new Set<AuditRow>()
  const sample: AuditSampleEntry[] = []

  for (const [stratum, share] of Object.entries(STRATUM_SHARE) as [Exclude<AuditStratum, 'general'>, number][]) {
    const quota = Math.round(size * share)
    for (const entry of pool) {
      if (sample.length >= size) break
      if (taken.has(entry)) continue
      if (strataOf(entry, deepRankFloor)[0] !== stratum) continue
      taken.add(entry)
      sample.push({ ...entry, stratum })
      if (sample.filter((item) => item.stratum === stratum).length >= quota) break
    }
  }

  for (const entry of pool) {
    if (sample.length >= size) break
    if (taken.has(entry)) continue
    taken.add(entry)
    sample.push({ ...entry, stratum: 'general' })
  }

  return sample
}

export interface AuditVerdict {
  lemma: string
  kind: 'word' | 'phrase'
  failures: AuditFailureClass[]
}

export interface AuditTally {
  reviewed: number
  clean: number
  clean_rate: number
  /** ±, at 95%, for a proportion measured on this many rows. */
  margin: number
  by_class: { failure: AuditFailureClass; count: number; rate: number }[]
}

/**
 * What the verdicts add up to, with the honest arithmetic attached.
 *
 * The margin is why this is reported as rates rather than as a certificate. Two hundred rows
 * resolve a systematic defect of roughly five percent or worse; they cannot say anything about
 * whether row 7,431 in particular is right, and a clean audit must never be read as if they could.
 */
export function tallyAudit(verdicts: readonly AuditVerdict[]): AuditTally {
  const reviewed = verdicts.length
  const clean = verdicts.filter((verdict) => !verdict.failures.length).length
  const rate = reviewed ? clean / reviewed : 0
  return {
    reviewed,
    clean,
    clean_rate: rate,
    margin: reviewed ? 1.96 * Math.sqrt((rate * (1 - rate)) / reviewed) : 1,
    by_class: AUDIT_FAILURE_CLASSES.map((failure) => {
      const count = verdicts.filter((verdict) => verdict.failures.includes(failure)).length
      return { failure, count, rate: reviewed ? count / reviewed : 0 }
    }).filter((entry) => entry.count > 0)
      .sort((left, right) => right.count - left.count),
  }
}
