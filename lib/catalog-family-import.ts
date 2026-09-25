import { createHash } from 'node:crypto'
import type { PublishedFamily } from './catalog-families'

/**
 * SQL for loading the published sentence-family snapshot (issue #16).
 *
 * The snapshot is loaded in chunks, because a whole one does not fit a single statement. Each
 * chunk upserts its families and **replaces** their variants, so a corrected family loses the
 * sentences it no longer has. Every family is stamped with the snapshot's id; once every chunk is
 * in, `familyCleanupSql` removes the families a newer snapshot dropped — and refuses to remove
 * anything unless the database holds exactly the number of families the snapshot says it has,
 * so a half-loaded snapshot can never delete the previous one.
 *
 * Only a family whose sense exists in the catalog is written; the rest are counted, not forced.
 */

export function snapshotId(lines: readonly string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16)
}

/** A dollar-quote tag that cannot occur inside the payload. */
function dollar(value: string): string {
  let n = 0
  while (value.includes(`$f${n}$`)) n += 1
  return `$f${n}$${value}$f${n}$`
}

/**
 * Translations kept beside the snapshot (issue #24): per language, per variant id, pinned to the
 * Danish they translate. The snapshot itself is rebuilt from audited replies, so a language added
 * later lives here rather than in it.
 */
export type TranslationOverlay = Record<string, Record<string, { danish: string; uk?: string; [lang: string]: string | undefined }>>

function variantTranslations(variant: PublishedFamily['variants'][number], extra: TranslationOverlay | undefined): Record<string, string> {
  const translations: Record<string, string> = { en: variant.en, ru: variant.ru }
  for (const [lang, byVariant] of Object.entries(extra || {})) {
    const row = byVariant[variant.id]
    const text = row?.[lang]
    if (row && row.danish === variant.danish && typeof text === 'string' && text.trim()) translations[lang] = text.trim()
  }
  return translations
}

export function familyChunkSql(families: readonly PublishedFamily[], meta: { snapshot: string; generator: string; gate: string; extra?: TranslationOverlay }): string {
  if (!families.length) throw new Error('Refusing an empty chunk')
  const payload = families.map((family) => ({
    id: family.id, lemma: family.lemma, kind: family.kind, sense_id: family.sense_id, level: family.level,
    situation: family.situation, grammar: family.grammar, frame: family.frame, slots: family.slots,
    variants: family.variants.map((variant) => ({ id: variant.id, version: variant.version, danish: variant.danish, target: variant.target, translations: variantTranslations(variant, meta.extra), orders: variant.orders, accepted: variant.accepted ?? [] })),
  }))
  const source = JSON.stringify({ snapshot: meta.snapshot, gate: meta.gate, licence: 'Ordly-authored; generated offline, gated and audited (issue #16)' })
  return `with incoming as (
  select * from jsonb_to_recordset(${dollar(JSON.stringify(payload))}::jsonb)
    as f(id uuid, lemma text, kind text, sense_id uuid, level text, situation text, grammar text, frame text, slots jsonb, variants jsonb)
),
known as (
  select incoming.* from incoming
  where exists (select 1 from public.word_catalog_sense s where s.lemma = incoming.lemma and s.kind = incoming.kind and s.sense_id = incoming.sense_id)
),
families as (
  insert into public.catalog_sentence_family (id, lemma, kind, sense_id, level, situation, grammar, frame, slots, generator, source, imported_at)
  select id, lemma, kind, sense_id, level, situation, grammar, frame, slots, ${dollar(meta.generator)}, ${dollar(source)}::jsonb, now() from known
  on conflict (id) do update set level = excluded.level, situation = excluded.situation, slots = excluded.slots,
    generator = excluded.generator, source = excluded.source, imported_at = excluded.imported_at
  returning id
),
dropped as (
  delete from public.catalog_sentence_variant v using known
  where v.family_id = known.id
    and not exists (select 1 from jsonb_to_recordset(known.variants) as n(id uuid) where n.id = v.id)
  returning 1
),
variants as (
  insert into public.catalog_sentence_variant (id, family_id, version, danish, target, translations, orders, accepted)
  select v.id, known.id, v.version, v.danish, v.target, v.translations, v.orders, coalesce(v.accepted, '{}')
  from known, jsonb_to_recordset(known.variants) as v(id uuid, version text, danish text, target text, translations jsonb, orders text[], accepted text[])
  where exists (select 1 from families where families.id = known.id)
  on conflict (id) do update set version = excluded.version, target = excluded.target, translations = excluded.translations, orders = excluded.orders, accepted = excluded.accepted
  returning 1
)
select (select count(*) from incoming) as incoming, (select count(*) from families) as families,
  (select count(*) from variants) as variants, (select count(*) from dropped) as dropped_variants`
}

/**
 * Remove the families an older snapshot had and this one does not — only when this snapshot is
 * completely loaded. Returns how many were removed, or -1 when it refused.
 */
export function familyCleanupSql(snapshot: string, expected: number): string {
  if (!/^[0-9a-f]{16}$/.test(snapshot) || !Number.isInteger(expected) || expected < 1) throw new Error('Refusing cleanup without a snapshot')
  return `with loaded as (
  select count(*) as n from public.catalog_sentence_family where source ->> 'snapshot' = '${snapshot}'
),
removed as (
  delete from public.catalog_sentence_family
  where source ->> 'snapshot' is distinct from '${snapshot}' and (select n from loaded) = ${expected}
  returning 1
)
select (select n from loaded) as loaded, case when (select n from loaded) = ${expected} then (select count(*) from removed) else -1 end as removed`
}
