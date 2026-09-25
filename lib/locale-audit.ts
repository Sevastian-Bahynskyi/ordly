import { seededRandom, shuffled } from './catalog-audit'

/**
 * The seeded audit of a learner-language pass (issue #24): the Ukrainian stratum.
 *
 * The gate has already refused text that is not Ukrainian, that changed a sense's identity or
 * that drifted in a round trip. What it cannot see is a translation that is Ukrainian, fluent and
 * wrong. The unit is one item: a sense's wording, a sense example's translation, or a family
 * sentence's translation. Each is judged against the Danish and the audited English and Russian.
 *
 * The sample is stratified by item type, word or phrase, part of speech and family level, so
 * every one is read however small it is, and rates are published per stratum with a 95% margin.
 * Below 95% clean, or any severe finding left unrepaired, nothing is loaded.
 */

export const LOCALE_AUDIT_FAILURES = ['wrong_meaning', 'russian', 'scope', 'form', 'unnatural'] as const
export type LocaleAuditFailure = typeof LOCALE_AUDIT_FAILURES[number]

export const LOCALE_AUDIT_LABELS: Record<LocaleAuditFailure, string> = {
  wrong_meaning: 'Says something other than the Danish (severe)',
  russian: 'Russian or surzhyk rather than Ukrainian (severe)',
  scope: 'Broader or narrower than the meaning the Russian and English name',
  form: 'Wrong citation form (a verb not in the infinitive, a noun not in the nominative)',
  unnatural: 'Correct, but not what a Ukrainian speaker would say',
}

export const SEVERE_LOCALE_FAILURES = new Set<LocaleAuditFailure>(['wrong_meaning', 'russian'])

export interface LocaleAuditSense {
  lemma: string
  kind: string
  sense_id: string
  pos: string | null
  text: string
  example: string | null
  example_translation: string | null
  /** The audited wordings it must mean the same as. */
  source: { ru: string; en: string | null; example_en?: string | null }
}

export interface LocaleAuditVariant {
  id: string
  level: string
  lemma: string
  danish: string
  en: string
  ru: string
  uk: string
}

export interface LocaleAuditItem {
  id: string
  type: 'wording' | 'example' | 'family'
  lemma: string
  danish: string | null
  ukrainian: string
  english: string | null
  russian: string | null
  strata: string[]
}

export interface LocaleAuditVerdict {
  id: string
  /** `null` until a person has read the item; an unread item is never counted as clean. */
  failures: LocaleAuditFailure[] | null
  note?: string
  /** The finding was fixed in the data after the reading. It still counts against the rate. */
  repaired?: boolean
}

function senseStrata(sense: LocaleAuditSense, type: 'wording' | 'example'): string[] {
  return [`type: ${type}`, `kind: ${sense.kind}`, `pos: ${sense.pos || 'none'}`]
}

/**
 * Draw `size` items: every stratum first gets a share of its own (a small stratum is read in
 * full up to that share), then the rest is drawn at random. Reproducible from `seed`.
 */
export function drawLocaleAudit(senses: readonly LocaleAuditSense[], variants: readonly LocaleAuditVariant[], options: { seed: number; size: number }): LocaleAuditItem[] {
  const random = seededRandom(options.seed)
  const pool: LocaleAuditItem[] = [
    ...senses.map((sense): LocaleAuditItem => ({
      id: `wording:${sense.sense_id}`, type: 'wording', lemma: sense.lemma, danish: sense.example, ukrainian: sense.text,
      english: sense.source.en, russian: sense.source.ru, strata: senseStrata(sense, 'wording'),
    })),
    ...senses.filter((sense) => sense.example && sense.example_translation).map((sense): LocaleAuditItem => ({
      id: `example:${sense.sense_id}`, type: 'example', lemma: sense.lemma, danish: sense.example, ukrainian: sense.example_translation as string,
      english: sense.source.example_en ?? null, russian: null, strata: senseStrata(sense, 'example'),
    })),
    ...variants.map((variant): LocaleAuditItem => ({
      id: `family:${variant.id}`, type: 'family', lemma: variant.lemma, danish: variant.danish, ukrainian: variant.uk,
      english: variant.en, russian: variant.ru, strata: ['type: family', `level: ${variant.level}`],
    })),
  ]
  const order = shuffled(pool, random)
  const strata = [...new Set(order.flatMap((item) => item.strata))].sort()
  const perStratum = Math.max(1, Math.floor(options.size / (strata.length * 2)))
  const picked = new Map<string, LocaleAuditItem>()
  for (const stratum of strata) {
    let taken = 0
    for (const item of order) {
      if (taken >= perStratum || picked.size >= options.size) break
      if (!item.strata.includes(stratum)) continue
      if (!picked.has(item.id)) picked.set(item.id, item)
      taken += 1
    }
  }
  for (const item of order) {
    if (picked.size >= options.size) break
    picked.set(item.id, item)
  }
  return [...picked.values()]
}

export interface LocaleStratumTally { stratum: string; reviewed: number; clean: number; rate: number; margin: number; severe: number }

function tally(stratum: string, verdicts: readonly LocaleAuditVerdict[]): LocaleStratumTally {
  const reviewed = verdicts.length
  const clean = verdicts.filter((verdict) => verdict.failures?.length === 0).length
  const rate = reviewed ? clean / reviewed : 0
  return {
    stratum, reviewed, clean, rate,
    margin: reviewed ? 1.96 * Math.sqrt((rate * (1 - rate)) / reviewed) : 1,
    severe: verdicts.filter((verdict) => !verdict.repaired && (verdict.failures || []).some((failure) => SEVERE_LOCALE_FAILURES.has(failure))).length,
  }
}

/** Overall, then every stratum, over the items that have a verdict. */
export function tallyLocaleAudit(items: readonly LocaleAuditItem[], verdicts: readonly LocaleAuditVerdict[]): LocaleStratumTally[] {
  const byId = new Map(verdicts.filter((verdict) => verdict.failures !== null).map((verdict) => [verdict.id, verdict]))
  const judged = items.filter((item) => byId.has(item.id))
  const rows = [tally('overall', judged.map((item) => byId.get(item.id) as LocaleAuditVerdict))]
  const strata = [...new Set(judged.flatMap((item) => item.strata))].sort()
  for (const stratum of strata) rows.push(tally(stratum, judged.filter((item) => item.strata.includes(stratum)).map((item) => byId.get(item.id) as LocaleAuditVerdict)))
  return rows
}

/** What stops the load: a stratum below 95% clean with enough rows to say so, or a severe finding not yet repaired. */
export function localeAuditBlocks(rows: readonly LocaleStratumTally[], minimum = 10): LocaleStratumTally[] {
  return rows.filter((row) => row.severe > 0 || (row.reviewed >= minimum && row.rate < 0.95))
}

/** Sampled items nobody has read yet. Any at all and the audit has not happened. */
export function unreadLocaleItems(items: readonly LocaleAuditItem[], verdicts: readonly LocaleAuditVerdict[]): LocaleAuditItem[] {
  const read = new Set(verdicts.filter((verdict) => verdict.failures !== null).map((verdict) => verdict.id))
  return items.filter((item) => !read.has(item.id))
}
