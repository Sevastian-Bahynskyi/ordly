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
