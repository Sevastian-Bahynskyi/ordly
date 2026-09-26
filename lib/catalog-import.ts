import { createHash } from 'node:crypto'

/** Namespace for the derived sense ids. Changing it re-mints every id, so it never changes. */
const SENSE_NAMESPACE = 'ordly.word_catalog.sense'

/**
 * A stable uuid for one meaning of one entry.
 *
 * Derived from lemma, kind and ordinal — not from the meaning's text, because correcting a
 * translation must not strand the scheduling state attached to that meaning.
 */
export function senseId(lemma: string, kind: string, ordinal: number): string {
  const digest = createHash('sha1').update(`${SENSE_NAMESPACE}:${lemma}:${kind}:${ordinal}`).digest('hex')
  const variant = ((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variant}${digest.slice(18, 20)}`,
    digest.slice(20, 32),
  ].join('-')
}

export interface CatalogImportEntryKey {
  lemma: string
  kind: 'word' | 'phrase'
  senseIds: string[]
}

function quoted(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function catalogCleanupSql(entries: readonly CatalogImportEntryKey[]): string {
  if (!entries.length) throw new Error('Refusing to synchronize an empty catalog')
  const entryValues = entries.map((entry) => `(${quoted(entry.lemma)}, ${quoted(entry.kind)})`)
  const senseValues = entries.flatMap((entry) => entry.senseIds.map((senseId) => (
    `(${quoted(entry.lemma)}, ${quoted(entry.kind)}, ${quoted(senseId)}::uuid)`
  )))
  if (!senseValues.length) throw new Error('Refusing to synchronize a catalog with no meanings')

  return `begin;
with current_sense(lemma, kind, sense_id) as (values ${senseValues.join(', ')})
delete from public.word_catalog_sense stored
where not exists (
  select 1 from current_sense current
  where current.lemma = stored.lemma
    and current.kind = stored.kind
    and current.sense_id = stored.sense_id
);
with current_entry(lemma, kind) as (values ${entryValues.join(', ')})
delete from public.word_catalog stored
where not exists (
  select 1 from current_entry current
  where current.lemma = stored.lemma and current.kind = stored.kind
);
commit;`
}

/** A dollar-quote tag that cannot occur inside the payload. */
function dollarQuoted(value: string): string {
  let n = 0
  while (value.includes(`$j${n}$`)) n += 1
  return `$j${n}$${value}$j${n}$`
}

export interface CatalogEntryRow {
  lemma: string; kind: string; freq_rank: number | null; pos: string | null; gender: string | null
  definite_singular: string | null; indefinite_plural: string | null; ipa: string | null; ipa_source: string | null
  pronunciation: string | null; audio_path: string | null; example_sentence: string | null; example_translation: string | null; generator: string
}

export interface CatalogSenseRow {
  lemma: string; kind: string; sense_id: string; ordinal: number; lang: string; text: string
  pos: string | null; gender: string | null; example: string | null; example_translation: string | null
}

/**
 * The same upserts `scripts/import-catalog.ts` runs, as one JSON payload per statement: a
 * statement that has to travel through a tool call should carry data, not quoting. Additive only.
 */
export function catalogEntriesJsonSql(rows: readonly CatalogEntryRow[]): string {
  return `insert into public.word_catalog (lemma, kind, freq_rank, pos, gender, definite_singular, indefinite_plural, ipa, ipa_source, pronunciation, audio_path, example_sentence, example_translation, generator)
select * from jsonb_to_recordset(${dollarQuoted(JSON.stringify(rows))}::jsonb) as r(lemma text, kind text, freq_rank integer, pos text, gender text, definite_singular text, indefinite_plural text, ipa text, ipa_source text, pronunciation text, audio_path text, example_sentence text, example_translation text, generator text)
on conflict (lemma, kind) do update set freq_rank = excluded.freq_rank, pos = excluded.pos, gender = excluded.gender,
  definite_singular = excluded.definite_singular, indefinite_plural = excluded.indefinite_plural, ipa = excluded.ipa, ipa_source = excluded.ipa_source,
  pronunciation = excluded.pronunciation, audio_path = excluded.audio_path, example_sentence = excluded.example_sentence,
  example_translation = excluded.example_translation, built_at = now(), generator = excluded.generator`
}

export function catalogSensesJsonSql(rows: readonly CatalogSenseRow[]): string {
  return `insert into public.word_catalog_sense (lemma, kind, sense_id, ordinal, lang, text, pos, gender, example, example_translation)
select * from jsonb_to_recordset(${dollarQuoted(JSON.stringify(rows))}::jsonb) as r(lemma text, kind text, sense_id uuid, ordinal integer, lang text, text text, pos text, gender text, example text, example_translation text)
on conflict (lemma, kind, sense_id, lang) do update set ordinal = excluded.ordinal, text = excluded.text, pos = excluded.pos,
  gender = excluded.gender, example = excluded.example, example_translation = excluded.example_translation`
}

/** Verified forms as `[lemma, form_key, form_text, gender]` tuples. */
export function catalogFormsJsonSql(rows: readonly [string, string, string, string][]): string {
  return `insert into public.word_catalog_form (lemma, kind, form_key, form_text, gender)
select f ->> 0, 'word', f ->> 1, f ->> 2, f ->> 3 from jsonb_array_elements(${dollarQuoted(JSON.stringify(rows))}::jsonb) f
on conflict do nothing`
}

/**
 * A catalog phrase's recorded forms (issue #28), `source: 'cor'` because they are the head verb's
 * register paradigm. Only onto a phrase already in the catalog, so a form never names a headword
 * the composer could not open; additive, so re-running a batch changes nothing.
 */
export function catalogPhraseFormsJsonSql(rows: readonly { lemma: string; form_key: string; form_text: string }[]): string {
  return `insert into public.word_catalog_form (lemma, kind, form_key, form_text, gender, source)
select f ->> 'lemma', 'phrase', f ->> 'form_key', f ->> 'form_text', '', 'cor' from jsonb_array_elements(${dollarQuoted(JSON.stringify(rows))}::jsonb) f
join public.word_catalog c on c.lemma = f ->> 'lemma' and c.kind = 'phrase'
on conflict do nothing`
}
