import type { LocaleFile } from './catalog-locale'

/**
 * A learner-language wording pass over senses that already exist (issue #16).
 *
 * The work file fixes everything except the wording: the sense id, ordinal, part of speech, gender
 * and the Danish example. A reply that changes any of those is not a translation any more, so it
 * is refused rather than repaired.
 */
export interface LocaleWorkRow {
  lemma: string
  kind: 'word' | 'phrase'
  sense_id: string
  ordinal: number
  pos: string | null
  gender: 'en' | 'et' | null
  /** The existing Russian wording: the meaning the new wording must match. */
  ru: string
  example: string | null
  example_ru: string | null
}

const DANISH_LETTERS = /[æøåÆØÅ]/u

function normalized(value: string): string {
  return value.toLocaleLowerCase('en').replace(/\s+/g, ' ').trim()
}

/** Every way a reply departs from its work file, one line each. Empty means it may be merged. */
export function checkLocaleReply(work: readonly LocaleWorkRow[], reply: LocaleFile, lang: string): string[] {
  const errors: string[] = []
  if (reply.lang !== lang) errors.push(`lang is ${String(reply.lang)}, expected ${lang}`)
  const expected = new Map(work.map((row) => [row.sense_id, row]))
  const seen = new Set<string>()
  const wordings = new Map<string, string>()
  for (const row of reply.senses || []) {
    const at = `${row.lemma}#${row.ordinal}`
    const want = expected.get(row.sense_id)
    if (!want) { errors.push(`${at}: sense ${row.sense_id} is not in the work file`); continue }
    seen.add(row.sense_id)
    if (row.lemma !== want.lemma || row.kind !== want.kind || row.ordinal !== want.ordinal) errors.push(`${at}: identity changed`)
    if ((row.pos ?? null) !== want.pos || (row.gender ?? null) !== want.gender) errors.push(`${at}: part of speech or gender changed`)
    if ((row.example ?? null) !== want.example) errors.push(`${at}: the Danish example must be copied unchanged`)
    if (want.example !== null && !row.example_translation?.trim()) errors.push(`${at}: the example needs a translation`)
    if (lang === 'en') {
      if (DANISH_LETTERS.test(row.text || '')) errors.push(`${at}: English wording contains Danish letters`)
      if (DANISH_LETTERS.test(row.example_translation || '')) errors.push(`${at}: English example translation contains Danish letters`)
    }
    // Two meanings of one word worded identically is a merged meaning, not two senses.
    const key = `${row.lemma}|${row.kind}|${normalized(row.text || '')}`
    const other = wordings.get(key)
    if (other) errors.push(`${at}: worded the same as ${other}`)
    wordings.set(key, at)
  }
  for (const row of work) if (!seen.has(row.sense_id)) errors.push(`${row.lemma}#${row.ordinal}: missing from the reply`)
  return errors
}
