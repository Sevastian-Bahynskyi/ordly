-- Issue #25, hardening: a catalog lemma verifies an entry only when the entry's Danish is that
-- catalog word — its headword or one of its verified forms. The first version trusted any
-- `catalog_lemma` that named a real row, so a write that changed the Danish and left a stale
-- lemma behind kept the entry verified. Every catalog-backed row stored today already has its
-- lemma as its Danish (135 of 135), so nothing already stored changes.

create or replace function private.mark_unverified_entry()
returns trigger language plpgsql set search_path = '' as $$
declare
  text_key text := lower(btrim(new.danish));
begin
  -- An update that keeps the Danish keeps the flag, so Review's status writes cost no lookup.
  if tg_op = 'UPDATE' and (old.unverified or new.danish is not distinct from old.danish) then
    new.unverified := old.unverified;
    return new;
  end if;
  new.unverified := new.catalog_lemma is null or not exists (
    select 1 from public.word_catalog c
    where c.lemma = new.catalog_lemma
      and (c.lemma = text_key or exists (
        select 1 from public.word_catalog_form f where f.lemma = c.lemma and f.form_text = text_key
      ))
  );
  return new;
end;
$$;
revoke all on function private.mark_unverified_entry() from public, anon, authenticated;
