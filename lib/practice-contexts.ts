import type { TranslationLanguage } from './types'

/**
 * Catalog sentences for a saved word (issue #16).
 *
 * A saved entry that came from the catalog carries the catalog's sense ids verbatim, so the
 * sentence families written for those senses can give it more contexts than the one example it
 * was saved with. Only the learner's own saved senses are ever looked up, so a catalog sentence
 * is supporting content for a target the learner chose, never a new target.
 *
 * A sentence is offered only with a translation in the learner's language; one without it is
 * missing, not substituted. Families above the learner's level (plus one step, so there is room
 * to grow) are left for later.
 */
export interface CatalogContext {
  variantId: string
  version: string
  senseId: string
  sentence: string
  /** The target word's form in this sentence. */
  target: string
  translation: string
  /** Other complete word orders that are equally correct. */
  orders: string[]
}

export interface CatalogFamilyRow {
  sense_id: unknown
  level: unknown
  catalog_sentence_variant: unknown
}

const LEVELS = ['A1', 'A2', 'B1', 'B2']

function levelIndex(level: string): number {
  return LEVELS.indexOf(level)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** The highest family level offered to a learner at `danishLevel`: one step above it. */
export function contextLevelCap(danishLevel: string | null | undefined): number {
  const at = levelIndex((danishLevel || 'A1').toUpperCase())
  // C1 and anything unknown above B2 read every family; unknown below reads from A1.
  if (at < 0) return /^C/i.test(danishLevel || '') ? 3 : 1
  return Math.min(3, at + 1)
}

/** Rows as PostgREST returns them → contexts per sense, in the learner's language only. */
export function contextsBySense(rows: readonly CatalogFamilyRow[], locale: TranslationLanguage, danishLevel: string | null | undefined): Record<string, CatalogContext[]> {
  const cap = contextLevelCap(danishLevel)
  const out: Record<string, CatalogContext[]> = {}
  for (const row of rows) {
    if (!isRecord(row) || !text(row.sense_id) || !Array.isArray(row.catalog_sentence_variant)) continue
    const level = levelIndex(String(row.level))
    if (level < 0 || level > cap) continue
    for (const variant of row.catalog_sentence_variant) {
      if (!isRecord(variant) || !text(variant.id) || !text(variant.version) || !text(variant.danish) || !text(variant.target)) continue
      const translations = isRecord(variant.translations) ? variant.translations : {}
      const translation = translations[locale]
      if (!text(translation)) continue
      const orders = Array.isArray(variant.orders) ? variant.orders.filter(text) : []
      ;(out[row.sense_id] ||= []).push({
        variantId: variant.id, version: variant.version, senseId: row.sense_id,
        sentence: variant.danish.trim(), target: variant.target.trim(), translation: translation.trim(), orders,
      })
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.variantId.localeCompare(b.variantId))
  return out
}
