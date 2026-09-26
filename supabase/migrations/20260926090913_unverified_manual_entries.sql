-- Issue #25: Ordly no longer calls a model at runtime. Anything the catalog does not hold is
-- entered by hand, is checked by nothing, and is studied in Review only.
--
-- `unverified` marks those entries. It is owned by this trigger, never by the client:
--
-- - a new entry is unverified unless it was unlocked from a catalog row that exists;
-- - an existing entry becomes unverified when its Danish changes to text that no catalog row
--   backs, and never becomes verified again by itself.
--
-- Every row already stored keeps `false`: existing Material, including entries a model filled
-- before this change, keeps its data, its Review history and its place in Practice.

alter table public.vocabulary_entries
  add column unverified boolean not null default false;

comment on column public.vocabulary_entries.unverified is
  'Entered by hand outside the catalog: not checked, excluded from Practice, studied in Review only. Set by private.mark_unverified_entry().';

create function private.mark_unverified_entry()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- An update that keeps the Danish keeps the flag, so Review's status writes cost no lookup.
  if tg_op = 'UPDATE' and (old.unverified or new.danish is not distinct from old.danish) then
    new.unverified := old.unverified;
    return new;
  end if;
  new.unverified := new.catalog_lemma is null or not exists (
    select 1 from public.word_catalog c where c.lemma = new.catalog_lemma
  );
  return new;
end;
$$;
revoke all on function private.mark_unverified_entry() from public, anon, authenticated;

create trigger vocabulary_mark_unverified
before insert or update on public.vocabulary_entries
for each row execute function private.mark_unverified_entry();
