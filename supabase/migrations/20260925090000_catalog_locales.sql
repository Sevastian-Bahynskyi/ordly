-- One catalog sense, several learner languages (issue #14, spec #12 decisions 10 and 13).
--
-- A catalog meaning's identity is its `sense_id`. An unlocked entry inherits that id, and practice
-- history hangs off `entry:<id>:sense:<sid>`, so the id must survive adding a language. Before this
-- migration the primary key was (lemma, kind, sense_id), which left room for one wording per sense:
-- an English row could only be added under a new id. Now the wording is keyed by language too, and
-- every language row of one sense must agree on what the sense is (ordinal, part of speech, gender).
--
-- No data is rewritten. Every existing row is Russian and keeps its id.

alter table public.word_catalog_sense drop constraint if exists word_catalog_sense_pkey;
alter table public.word_catalog_sense add primary key (lemma, kind, sense_id, lang);
alter table public.word_catalog_sense drop constraint if exists word_catalog_sense_lang_check;
alter table public.word_catalog_sense add constraint word_catalog_sense_lang_check check (lang in ('ru', 'en', 'uk'));

-- Provenance per wording: which build or batch wrote it, so a bad batch can be found and fixed.
alter table public.word_catalog_sense add column if not exists generator text;

comment on column public.word_catalog_sense.lang is
  'Learner language of this wording. The same sense_id has one row per language; the id is the meaning, the row is its wording.';

-- Every language row of a sense describes the same meaning. A disagreement is refused rather than
-- silently published, so a later import that changes one language without the others fails loudly.
create or replace function private.check_catalog_sense_locale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.word_catalog_sense sibling
    where sibling.lemma = new.lemma and sibling.kind = new.kind and sibling.sense_id = new.sense_id
      and sibling.lang <> new.lang
      and (sibling.ordinal <> new.ordinal
        or sibling.pos is distinct from new.pos
        or sibling.gender is distinct from new.gender)
  ) then
    raise exception 'Catalog sense % of % differs between languages', new.sense_id, new.lemma using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_catalog_sense_locale() from public, anon, authenticated;

drop trigger if exists word_catalog_sense_locale_consistent on public.word_catalog_sense;
create trigger word_catalog_sense_locale_consistent
before insert or update of ordinal, pos, gender, sense_id, lang on public.word_catalog_sense
for each row execute function private.check_catalog_sense_locale();

-- New profiles start in English. Existing profiles keep what they hold, including Ukrainian.
alter table public.profiles alter column default_translation_language set default 'en';
