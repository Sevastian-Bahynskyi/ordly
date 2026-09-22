-- The pre-built word catalog (issue #6 §5).
--
-- Ordly used to ask a model to invent the same facts once per word, at the moment the word was
-- added. This is those facts, built once, offline, under the deterministic gate in §9. Adding a
-- word becomes a lookup: the learner types what they saw, the register resolves it to a lemma,
-- and the row is *unlocked* into their material rather than generated in front of them.
--
-- Reference data, exactly like `public.cor_form`: identical for every account, so no `user_id`,
-- read-only to the app, and **the data is loaded by a script, never by a migration**. A fresh
-- environment with no catalog loaded simply misses on every lookup and falls through to the live
-- AI path, which is the designed behaviour for the 15-25% of words the catalog will never hold.

create table public.word_catalog (
  -- Lowercased dictionary form. Words and phrases share the table because they share every
  -- reader; `kind` is what says whether COR could be asked about it at all.
  lemma text not null,
  kind text not null check (kind in ('word', 'phrase')),
  -- Rank in the frequency list the catalog was built from. Null for phrases, which come from a
  -- curated list rather than a corpus: a lemma frequency list contains no multi-word entries.
  freq_rank integer check (freq_rank is null or freq_rank > 0),
  pos text,
  -- From COR only. Null means the register was ambiguous or silent, and null is shown as nothing
  -- rather than as a guess (issue #5 §22, "silence beats a guess").
  gender text check (gender is null or gender in ('en', 'et')),
  -- Read from the register, never built by appending an article: `menneske` -> `mennesket`,
  -- `skulder` -> `skulderen`, which is not the same rule.
  definite_singular text,
  indefinite_plural text,
  -- The IPA the Cyrillic hint was derived from, and where it came from. A row with no IPA must
  -- have no pronunciation: a pronunciation invented from Danish spelling is the exact regression
  -- AGENTS.md §8 exists to forbid.
  ipa text,
  ipa_source text check (ipa_source is null or ipa_source in ('ddo', 'wiktionary')),
  pronunciation text,
  -- Object path in the private audio bucket. Null is ordinary: DDO has no recording for every
  -- headword and none at all for a phrase, and a silent row is still a good row.
  audio_path text,
  example_sentence text,
  example_translation text,
  built_at timestamptz not null default now(),
  -- Which generator wrote the judgement fields. Provenance, so a bad batch can be found later.
  generator text,
  primary key (lemma, kind),
  constraint word_catalog_pronunciation_needs_ipa check (pronunciation is null or ipa is not null),
  constraint word_catalog_phrase_has_no_rank check (kind = 'word' or freq_rank is null)
);

comment on table public.word_catalog is
  'Pre-built Danish word data (issue #6). Reference data: no user_id, identical for every account, loaded by a script rather than by a migration. Unlocking a word copies it into vocabulary_entries; the catalog is never read at review time.';

-- Every lookup is by lemma, which the primary key already indexes. This one serves the "what
-- could this typed form be" path, where several catalog rows share a COR lemma.
create index word_catalog_rank_idx on public.word_catalog(freq_rank) where freq_rank is not null;

create table public.word_catalog_sense (
  lemma text not null,
  kind text not null,
  -- Minted here and permanent. An entry unlocked from the catalog inherits this id rather than
  -- generating a fresh one: practice objectives are keyed `entry:<id>:sense:<sid>`, so a new id
  -- silently strands FSRS state (AGENTS.md §20).
  sense_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 3),
  -- The catalog is Russian today. The column exists so Ukrainian and English are a batch job
  -- rather than a migration.
  lang text not null default 'ru',
  text text not null check (btrim(text) <> ''),
  pos text,
  gender text check (gender is null or gender in ('en', 'et')),
  example text,
  example_translation text,
  primary key (lemma, kind, sense_id),
  constraint word_catalog_sense_entry_fkey foreign key (lemma, kind)
    references public.word_catalog(lemma, kind) on delete cascade,
  unique (lemma, kind, lang, ordinal)
);

comment on table public.word_catalog_sense is
  'One meaning of a catalog entry. sense_id is minted here and permanent: an unlocked entry inherits it, or FSRS state attached to that meaning is stranded on the next edit (AGENTS.md §20).';

alter table public.word_catalog enable row level security;
alter table public.word_catalog_sense enable row level security;

revoke all on public.word_catalog from anon;
revoke all on public.word_catalog_sense from anon;
grant select on public.word_catalog to authenticated;
grant select on public.word_catalog_sense to authenticated;

create policy "signed-in sessions read the catalog" on public.word_catalog for select to authenticated
  using (true);
create policy "signed-in sessions read catalog meanings" on public.word_catalog_sense for select to authenticated
  using (true);

-- Provenance only. The unlock copies the catalog row rather than pointing at it, so the entry
-- stays freely editable (AGENTS.md §1) and a later catalog fix cannot rewrite a learner's word
-- behind their back. This column is what makes a future opt-in refresh possible.
alter table public.vocabulary_entries add column if not exists catalog_lemma text;

comment on column public.vocabulary_entries.catalog_lemma is
  'The catalog row this entry was unlocked from, for provenance. The entry is a copy, not a reference: nothing reads the catalog to render or grade an entry.';

-- A catalog word carries every meaning it has, but only the meaning the learner actually met is
-- taught. The others are stored `locked` and can be unlocked later.
--
-- This is why `locked` has to reach the trigger: `translation` is the denormalized join the review
-- flow grades against, so a locked meaning left in it would demand a translation of a sense the
-- learner never saw. A sense with no `locked` key is not locked, so every existing row is
-- unaffected.
create or replace function private.translation_from_senses(senses jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(string_agg(btrim(element.value ->> 'text'), ', ' order by element.ordinality), '')
  from jsonb_array_elements(
         case when jsonb_typeof(senses) = 'array' then senses else '[]'::jsonb end
       ) with ordinality as element(value, ordinality)
  where element.value ->> 'removed_at' is null
    and coalesce(element.value ->> 'locked', 'false') <> 'true'
    and btrim(coalesce(element.value ->> 'text', '')) <> ''
$$;
revoke all on function private.translation_from_senses(jsonb) from public, anon, authenticated;
