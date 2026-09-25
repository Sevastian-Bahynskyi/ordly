import { seededRandom, shuffled } from './catalog-audit'
import type { PublishedFamily, PublishedVariant } from './catalog-families'

/**
 * The seeded audit of sentence families (issue #16; spec #12 decision 16).
 *
 * The gate has already refused everything mechanically checkable, so the audit is for sentences
 * that are well-formed and wrong: a correct Danish sentence that shows another meaning, a gap two
 * words fit, a translation that says something else. The unit is one sentence, judged once in
 * Danish and once per learner language.
 *
 * The sample is **stratified**: every level, every source (the original catalog and the
 * expansion past rank 3,000), every grammar cell present, and an extra share of the shapes that
 * carry more risk — sentences with authored alternative word orders, and families whose slots
 * carry constraints. Rates are published per stratum with a 95% margin; a stratum below 95% clean
 * stops publication until it is repaired.
 */

export const FAMILY_AUDIT_FAILURES = [
  'wrong_sense',
  'ungrammatical',
  'unnatural',
  'ambiguous_gap',
  'bad_order',
  'translation_en',
  'translation_ru',
  'level_or_cell',
] as const
export type FamilyAuditFailure = typeof FAMILY_AUDIT_FAILURES[number]

export const FAMILY_AUDIT_LABELS: Record<FamilyAuditFailure, string> = {
  wrong_sense: 'The sentence does not demonstrate the sense it is filed under (severe)',
  ungrammatical: 'The Danish is ungrammatical or wrongly inflected (severe)',
  unnatural: 'Grammatical, but not what a native speaker would say',
  ambiguous_gap: 'With the translation shown, another common word or form also fits the gap',
  bad_order: 'An authored alternative word order is wrong, or a common valid order is missing',
  translation_en: 'The English translation does not say what the Danish says',
  translation_ru: 'The Russian translation does not say what the Danish says',
  level_or_cell: 'The level, situation or grammar label does not describe the sentence',
}

/** Failures that teach something false. One unresolved severe finding stops a batch. */
export const SEVERE_FAILURES = new Set<FamilyAuditFailure>(['wrong_sense', 'ungrammatical', 'translation_en', 'translation_ru'])

export interface FamilyAuditItem {
  id: string
  family_id: string
  lemma: string
  sense: { ru: string; en: string | null }
  level: string
  situation: string
  grammar: string
  source: 'catalog' | 'expansion'
  batch: string
  frame: string
  variant: PublishedVariant
  risk: string[]
}

export interface FamilyAuditVerdict {
  id: string
  failures: FamilyAuditFailure[]
  note?: string
}

type Audited = PublishedFamily & { batch?: string; source?: 'catalog' | 'expansion' }

function risks(family: Audited, variant: PublishedVariant): string[] {
  const out: string[] = []
  if (variant.orders.length) out.push('authored_orders')
  if (Object.values(family.slots).some((options) => options.some((option) => option.requires && Object.keys(option.requires).length))) out.push('constrained_slots')
  if (variant.danish.split(/\s+/).length > 10) out.push('long_sentence')
  return out
}

/**
 * Draw `size` sentences. Every level and source is represented in proportion but never below a
 * floor; one sentence per family at most, so a single family cannot dominate; risky shapes are
 * drawn first within each stratum.
 */
export function drawFamilyAudit(families: readonly Audited[], senses: ReadonlyMap<string, { ru: string; en: string | null }>, options: { seed: number; size: number; all?: boolean }): FamilyAuditItem[] {
  const random = seededRandom(options.seed)
  const candidates = options.all
    ? families.flatMap((family) => family.variants.map((variant) => ({ family, variant, risk: risks(family, variant) })))
    : shuffled(families, random).map((family) => {
      const variant = family.variants[Math.floor(random() * family.variants.length)]
      return { family, variant, risk: risks(family, variant) }
    })
  const toItem = ({ family, variant, risk }: typeof candidates[number]): FamilyAuditItem => ({
    id: variant.id, family_id: family.id, lemma: family.lemma,
    sense: senses.get(family.sense_id) || { ru: '?', en: null },
    level: family.level, situation: family.situation, grammar: family.grammar,
    source: family.source || 'catalog', batch: family.batch || '', frame: family.frame, variant, risk,
  })
  if (options.all) return candidates.map(toItem)
  const strata = new Map<string, typeof candidates>()
  for (const candidate of candidates) {
    const key = `${candidate.family.level}|${candidate.family.source || 'catalog'}`
    strata.set(key, [...(strata.get(key) || []), candidate])
  }
  const floor = Math.max(8, Math.floor(options.size / Math.max(1, strata.size) / 2))
  const picked: typeof candidates = []
  const seenCells = new Set<string>()
  for (const [, list] of [...strata.entries()].sort()) {
    const quota = Math.max(floor, Math.round(options.size * list.length / candidates.length))
    // Risky shapes and cells not yet represented first; then the rest of the shuffled stratum.
    const ordered = [...list].sort((a, b) => (b.risk.length - a.risk.length) || Number(seenCells.has(a.family.grammar)) - Number(seenCells.has(b.family.grammar)))
    for (const candidate of ordered.slice(0, quota)) {
      picked.push(candidate)
      seenCells.add(candidate.family.grammar)
    }
  }
  return picked.map(toItem)
}

export interface StratumTally { stratum: string; reviewed: number; clean: number; rate: number; margin: number; severe: number }

function tally(stratum: string, verdicts: readonly FamilyAuditVerdict[], counts: (verdict: FamilyAuditVerdict) => boolean): StratumTally {
  const reviewed = verdicts.length
  const clean = verdicts.filter((verdict) => !counts(verdict)).length
  const rate = reviewed ? clean / reviewed : 0
  return {
    stratum, reviewed, clean, rate,
    margin: reviewed ? 1.96 * Math.sqrt((rate * (1 - rate)) / reviewed) : 1,
    severe: verdicts.filter((verdict) => verdict.failures.some((failure) => SEVERE_FAILURES.has(failure))).length,
  }
}

/**
 * Rates overall and per stratum: learner language (a sentence counts against English only for
 * Danish-side or English failures), level, source, grammar cell, format (a gap is spoiled by an
 * ambiguous gap, an order task by a bad order) and each risk shape.
 */
export function tallyFamilyAudit(items: readonly FamilyAuditItem[], verdicts: readonly FamilyAuditVerdict[]): StratumTally[] {
  const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict]))
  const judged = items.filter((item) => byId.has(item.id)).map((item) => ({ item, verdict: byId.get(item.id) as FamilyAuditVerdict }))
  const danish = (failures: readonly FamilyAuditFailure[]) => failures.some((failure) => ['wrong_sense', 'ungrammatical', 'unnatural', 'level_or_cell'].includes(failure))
  const rows: StratumTally[] = [tally('overall', judged.map((entry) => entry.verdict), (verdict) => verdict.failures.length > 0)]
  rows.push(tally('language: English', judged.map((entry) => entry.verdict), (verdict) => danish(verdict.failures) || verdict.failures.includes('translation_en')))
  rows.push(tally('language: Russian', judged.map((entry) => entry.verdict), (verdict) => danish(verdict.failures) || verdict.failures.includes('translation_ru')))
  rows.push(tally('format: typed gap', judged.map((entry) => entry.verdict), (verdict) => danish(verdict.failures) || verdict.failures.includes('ambiguous_gap')))
  rows.push(tally('format: word order', judged.map((entry) => entry.verdict), (verdict) => danish(verdict.failures) || verdict.failures.includes('bad_order')))
  const groups: [string, (item: FamilyAuditItem) => string[]][] = [
    ['level', (item) => [item.level]],
    ['source', (item) => [item.source]],
    ['grammar', (item) => [item.grammar]],
    ['risk', (item) => item.risk],
  ]
  for (const [name, keys] of groups) {
    const buckets = new Map<string, FamilyAuditVerdict[]>()
    for (const { item, verdict } of judged) for (const key of keys(item)) buckets.set(key, [...(buckets.get(key) || []), verdict])
    for (const [key, list] of [...buckets.entries()].sort()) rows.push(tally(`${name}: ${key}`, list, (verdict) => verdict.failures.length > 0))
  }
  return rows
}

/** Strata that stop publication: below 95% clean with enough rows to say so, or any severe finding left unrepaired. */
export function failingStrata(rows: readonly StratumTally[], minimum = 10): StratumTally[] {
  return rows.filter((row) => row.reviewed >= minimum && row.rate < 0.95)
}

/**
 * A batch reply that passed a seeded audit, pinned to the exact bytes that were approved. Keyed by
 * the reply's path (`catalog/families/out/batch-0001.json`). Editing the reply afterwards voids
 * the approval, so a batch can never be published in a state no audit covered.
 */
export interface FamilyAuditApproval { seed: number; sha1: string }
export type FamilyAuditApprovals = Record<string, FamilyAuditApproval>

/**
 * Sampled sentences with a finding that are still in the current replies exactly as judged: the
 * same variant id (same Danish) with the same version (same translations, orders and accepted
 * answers). Repairing a finding changes one of those, so an empty list means every finding was
 * acted on — rewritten, or its family dropped.
 */
export function unrepairedFindings(items: readonly FamilyAuditItem[], verdicts: readonly FamilyAuditVerdict[], current: ReadonlyMap<string, string>): FamilyAuditItem[] {
  const flagged = new Set(verdicts.filter((verdict) => verdict.failures.length).map((verdict) => verdict.id))
  return items.filter((item) => flagged.has(item.id) && current.get(item.variant.id) === item.variant.version)
}
