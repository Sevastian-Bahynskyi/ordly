-- Meaning model, step 2: senses on vocabulary_entries.
-- See docs/meaning-model-plan.md §3.1-3.2 and decisions D1, D2, D11, D15.
--
-- `senses` becomes the unit of meaning. `translation` stays as a denormalized string so
-- every existing read path (review, words list, practice, notifications) keeps working,
-- and a BEFORE trigger keeps the two coherent in both directions without any writer
-- having to know about it. Legacy writers that only set `translation` — raw bulk add and
-- the apply-preview path in components/WordsClient.tsx — stay correct untouched.

alter table public.vocabulary_entries
  add column if not exists senses jsonb not null default '[]'::jsonb;

comment on column public.vocabulary_entries.senses is
  'Ordered array of meaning objects (EntrySense in lib/types.ts). The first non-removed element is the primary sense and reads its example from example_sentence/example_translation. Kept in sync with the denormalized translation column by the vocabulary_sync_senses trigger.';

alter table public.vocabulary_entries drop constraint if exists vocabulary_entries_senses_array;
alter table public.vocabulary_entries
  add constraint vocabulary_entries_senses_array check (jsonb_typeof(senses) = 'array');

alter table public.vocabulary_entries drop constraint if exists vocabulary_entries_senses_size;
alter table public.vocabulary_entries
  add constraint vocabulary_entries_senses_size check (octet_length(senses::text) < 40000);

-- Deterministic translation -> senses split.
--
-- Only entry_kind = 'word' is ever split. A sentence translation such as
-- 'Jeg synes, det er svært.' must stay one sense: comma-splitting it is destructive and
-- would silently shred the answer the learner is graded against.
create or replace function private.senses_from_translation(translation text, entry_kind text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  raw text := btrim(coalesce(translation, ''));
  parts text[];
  part text;
  trimmed text;
  result jsonb := '[]'::jsonb;
  stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if raw = '' then
    return '[]'::jsonb;
  end if;

  if entry_kind = 'word' then
    parts := regexp_split_to_array(raw, '[;,/]');
  else
    parts := array[raw];
  end if;

  foreach part in array parts loop
    trimmed := btrim(part);
    continue when trimmed = '';
    result := result || jsonb_build_object(
      'id', gen_random_uuid()::text,
      'text', trimmed,
      'pos', null::text,
      'gender', null::text,
      'note', null::text,
      'example', null::text,
      'example_translation', null::text,
      'source', 'split',
      'coverage', jsonb_build_object('recognized', 0, 'produced', 0, 'last_seen', null::text),
      'created_at', stamp,
      'removed_at', null::text
    );
  end loop;

  return result;
end;
$$;
revoke all on function private.senses_from_translation(text, text) from public, anon, authenticated;

-- Deterministic senses -> translation join. Soft-deleted senses (removed_at) are skipped.
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
    and btrim(coalesce(element.value ->> 'text', '')) <> ''
$$;
revoke all on function private.translation_from_senses(jsonb) from public, anon, authenticated;

-- BEFORE INSERT OR UPDATE, mutating NEW in place.
--
-- This must never issue a nested UPDATE on vocabulary_entries: writing both columns in the
-- same BEFORE row is exactly what keeps it from recursing.
create or replace function private.sync_entry_senses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A BEFORE trigger runs ahead of the CHECK constraints. Hand a non-array senses value
  -- straight through so vocabulary_entries_senses_array reports it, rather than failing
  -- in here with an opaque "cannot get array length of a non-array".
  if new.senses is not null and jsonb_typeof(new.senses) <> 'array' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Raw bulk add writes `danish` only. translation is null, so senses stays empty and
    -- the row remains excluded from review, exactly as before this migration.
    if jsonb_array_length(coalesce(new.senses, '[]'::jsonb)) = 0 and new.translation is not null then
      new.senses := private.senses_from_translation(new.translation, new.entry_kind);
    end if;
  else
    if new.senses is distinct from old.senses then
      -- senses are authoritative; translation is recomputed below.
      null;
    elsif new.translation is distinct from old.translation then
      new.senses := private.senses_from_translation(new.translation, new.entry_kind);
    end if;
  end if;

  -- Assigned, not coalesced: emptying the senses must also empty the translation, or a
  -- cleared entry would keep answering review with a string nothing backs any more.
  new.translation := private.translation_from_senses(new.senses);
  return new;
end;
$$;
revoke all on function private.sync_entry_senses() from public, anon, authenticated;

drop trigger if exists vocabulary_sync_senses on public.vocabulary_entries;
create trigger vocabulary_sync_senses
before insert or update on public.vocabulary_entries
for each row execute function private.sync_entry_senses();

-- Phase 1 of the two-phase migration (D11): deterministic, zero-AI, no network.
-- AI refinement of pos / gender / sense boundaries happens later and on demand, modelled
-- on components/VocabularyIconBackfill.tsx. There is deliberately no mass AI backfill.
--
-- vocabulary_touch_updated_at is paused for the backfill: updated_at feeds
-- entryContentVersion in lib/practice-planner.ts, and bumping every row would needlessly
-- invalidate every cached practice pack for a change that alters no learnable content.
alter table public.vocabulary_entries disable trigger vocabulary_touch_updated_at;

update public.vocabulary_entries
set senses = private.senses_from_translation(translation, entry_kind)
where jsonb_array_length(senses) = 0
  and translation is not null
  and btrim(translation) <> '';

alter table public.vocabulary_entries enable trigger vocabulary_touch_updated_at;
