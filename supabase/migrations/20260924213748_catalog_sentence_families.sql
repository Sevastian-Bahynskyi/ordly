-- Reusable sentence families (issue #16; spec #12 decisions 10, 14 and 16).
--
-- A family teaches one catalog sense in one context: a Danish frame with named slots, and the
-- explicit list of combinations that were checked as whole sentences. Each combination is a
-- variant with its own verified target form and its own translation per learner language.
-- Nothing is recombined at runtime; a combination that is not a row does not exist.
--
-- Reference data like `word_catalog`: no user_id, read-only to signed-in sessions, loaded by
-- `scripts/import-catalog-families.ts` from the gate's published snapshot, never by a migration.
-- Ids are derived from content, so a re-import mints the same ids and duplicates nothing.

create table public.catalog_sentence_family (
  id uuid primary key,
  lemma text not null,
  kind text not null,
  -- The catalog sense this family teaches. Saved entries carry the same id verbatim, which is how
  -- Practice finds a family for a word the learner has saved.
  sense_id uuid not null,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  -- Cells of catalog/benchmark/cefr-matrix.json.
  situation text not null,
  grammar text not null,
  frame text not null,
  slots jsonb not null default '{}'::jsonb,
  -- Provenance: who wrote it, which gate accepted it, and whether a seeded audit has read its
  -- stratum. Nothing that failed the gate is ever imported.
  generator text not null,
  source jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  -- Senses are keyed per language, so the family points at its entry; the importer only writes
  -- a family whose sense exists, and removing the entry removes its families.
  constraint catalog_sentence_family_entry_fkey foreign key (lemma, kind)
    references public.word_catalog(lemma, kind) on delete cascade
);

comment on table public.catalog_sentence_family is
  'One catalog sense in one context (issue #16). Reference data loaded by script; the variants are the only sentences it can produce.';

create index catalog_sentence_family_sense_idx on public.catalog_sentence_family(sense_id);

create table public.catalog_sentence_variant (
  id uuid primary key,
  family_id uuid not null references public.catalog_sentence_family(id) on delete cascade,
  -- Changes whenever anything the variant teaches changes. A Practice task stores the version it
  -- was built from and is dropped, not graded, when the stored one differs.
  version text not null,
  danish text not null check (btrim(danish) <> ''),
  target text not null check (btrim(target) <> ''),
  -- { "en": "...", "ru": "..." }. A language with no key is missing, never substituted.
  translations jsonb not null check (jsonb_typeof(translations) = 'object'),
  -- Other complete word orders that are equally correct.
  orders text[] not null default '{}'
);

comment on table public.catalog_sentence_variant is
  'One checked sentence of a sentence family, with its target form and translations (issue #16).';

create index catalog_sentence_variant_family_idx on public.catalog_sentence_variant(family_id);

alter table public.catalog_sentence_family enable row level security;
alter table public.catalog_sentence_variant enable row level security;

revoke all on public.catalog_sentence_family from anon;
revoke all on public.catalog_sentence_variant from anon;
revoke insert, update, delete, truncate on public.catalog_sentence_family from authenticated;
revoke insert, update, delete, truncate on public.catalog_sentence_variant from authenticated;
grant select on public.catalog_sentence_family to authenticated;
grant select on public.catalog_sentence_variant to authenticated;

create policy "signed-in sessions read sentence families" on public.catalog_sentence_family for select to authenticated
  using (true);
create policy "signed-in sessions read family sentences" on public.catalog_sentence_variant for select to authenticated
  using (true);
