import type { TranslationLanguage } from './types'

/**
 * Localized catalog wording (issue #14). A locale file adds a learner-language wording to senses
 * that already exist: it reuses each sense's id, ordinal, part of speech and gender, so a learner's
 * saved meaning keeps its identity when the same sense gains an English or a Russian text.
 *
 * Checked here before anything is written; the database checks the identity again
 * (`word_catalog_sense_locale_consistent`).
 */
export interface LocaleSenseRow {
  lemma: string
  kind: 'word' | 'phrase'
  sense_id: string
  ordinal: number
  pos: string | null
  gender: 'en' | 'et' | null
  text: string
  example: string | null
  example_translation: string | null
}

export interface LocaleFile {
  lang: TranslationLanguage
  generator: string
  senses: LocaleSenseRow[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CYRILLIC = /\p{Script=Cyrillic}/u
const LATIN = /\p{Script=Latin}/u

function nullableText(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.trim().length > 0 && value.length <= 500)
}

/** Every problem in a locale file, one line each. An empty list means it may be loaded. */
export function validateLocaleFile(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['not an object']
  const file = value as Record<string, unknown>
  if (file.lang !== 'en' && file.lang !== 'ru' && file.lang !== 'uk') return ['unsupported lang']
  if (typeof file.generator !== 'string' || !file.generator.trim()) return ['missing generator (provenance)']
  if (!Array.isArray(file.senses) || !file.senses.length) return ['no senses']
  const errors: string[] = []
  const seen = new Set<string>()
  const ordinals = new Set<string>()
  file.senses.forEach((raw, index) => {
    const at = `sense ${index + 1}`
    if (!raw || typeof raw !== 'object') { errors.push(`${at}: not an object`); return }
    const row = raw as Record<string, unknown>
    if (typeof row.lemma !== 'string' || !row.lemma.trim()) errors.push(`${at}: missing lemma`)
    if (row.kind !== 'word' && row.kind !== 'phrase') errors.push(`${at}: bad kind`)
    if (typeof row.sense_id !== 'string' || !UUID.test(row.sense_id)) errors.push(`${at}: bad sense_id`)
    if (!Number.isInteger(row.ordinal) || Number(row.ordinal) < 1 || Number(row.ordinal) > 3) errors.push(`${at}: bad ordinal`)
    if (row.gender !== null && row.gender !== 'en' && row.gender !== 'et') errors.push(`${at}: bad gender`)
    if (typeof row.text !== 'string' || !row.text.trim() || row.text.length > 300) errors.push(`${at}: missing text`)
    // The wording must be in the file's language: a Russian gloss filed as English is exactly the
    // mislabelling issue #14 forbids.
    else if (file.lang === 'en' && (CYRILLIC.test(row.text) || !LATIN.test(row.text))) errors.push(`${at}: English text is not Latin script`)
    else if (file.lang !== 'en' && !CYRILLIC.test(row.text)) errors.push(`${at}: ${file.lang} text is not Cyrillic`)
    if (!nullableText(row.example) || !nullableText(row.example_translation)) errors.push(`${at}: bad example`)
    else if ((row.example === null) !== (row.example_translation === null)) errors.push(`${at}: an example needs its translation`)
    else if (typeof row.example_translation === 'string' && file.lang === 'en' && CYRILLIC.test(row.example_translation)) errors.push(`${at}: English example translation is not Latin script`)
    const key = `${row.lemma}|${row.kind}|${row.sense_id}`
    if (seen.has(key)) errors.push(`${at}: duplicate sense`)
    seen.add(key)
    const ordinal = `${row.lemma}|${row.kind}|${row.ordinal}`
    if (ordinals.has(ordinal)) errors.push(`${at}: duplicate ordinal`)
    ordinals.add(ordinal)
  })
  return errors
}

function sql(value: string | number | null): string {
  if (value === null) return 'null'
  if (typeof value === 'number') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * One idempotent upsert. Rows join to an existing sense in another language, so a locale file can
 * never mint a new meaning: a row whose sense does not exist yet is skipped and reported by the
 * returned counts. Re-running the same file changes nothing.
 */
export function localeUpsertSql(file: LocaleFile): string {
  const values = file.senses.map((row) => `(${[row.lemma, row.kind, row.sense_id, row.ordinal, row.pos, row.gender, row.text, row.example, row.example_translation].map(sql).join(', ')})`)
  return `with incoming(lemma, kind, sense_id, ordinal, pos, gender, text, example, example_translation) as (values ${values.join(', ')}),
known as (
  select incoming.* from incoming
  where exists (
    select 1 from public.word_catalog_sense existing
    where existing.lemma = incoming.lemma and existing.kind = incoming.kind
      and existing.sense_id = incoming.sense_id::uuid and existing.lang <> ${sql(file.lang)}
  )
),
written as (
  insert into public.word_catalog_sense (lemma, kind, sense_id, ordinal, lang, text, pos, gender, example, example_translation, generator)
  select lemma, kind, sense_id::uuid, ordinal, ${sql(file.lang)}, text, pos, gender, example, example_translation, ${sql(file.generator)} from known
  on conflict (lemma, kind, sense_id, lang) do update set
    text = excluded.text, example = excluded.example, example_translation = excluded.example_translation, generator = excluded.generator
  returning 1
)
select (select count(*) from incoming) as incoming, (select count(*) from known) as matched, (select count(*) from written) as written`
}
