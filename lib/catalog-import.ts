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
