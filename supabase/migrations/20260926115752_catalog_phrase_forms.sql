-- Issue #28: catalog phrases record their forms, and carry a pronunciation read from their words' IPA.
--
-- A particle verb is met inflected and split (`stod op`, `står … op`). Its forms are the head verb's
-- register paradigm with the other words fixed, plus a split form after each finite head, loaded
-- by script into `word_catalog_form` like a word's. The composer finds the phrase from any of them
-- and saves the headword; the trigger below copies them into the saved entry, so Practice grades a
-- phrase's other forms as the wrong form, as it does for words.
--
-- A phrase has no IPA of its own in any source. Its hint is read from the recorded IPA of each of
-- its words, and `ipa_source = 'components'` says so; a phrase with a word lacking IPA gets none.

alter table public.word_catalog_form drop constraint word_catalog_form_kind_check;
alter table public.word_catalog_form add constraint word_catalog_form_kind_check check (kind in ('word', 'phrase'));

alter table public.word_catalog drop constraint word_catalog_ipa_source_check;
alter table public.word_catalog add constraint word_catalog_ipa_source_check
  check (ipa_source is null or ipa_source in ('ddo', 'wiktionary', 'components'));

-- Phrase forms are found by the form itself.
create index word_catalog_form_phrase_text_idx on public.word_catalog_form (form_text) where kind = 'phrase';

create or replace function private.copy_catalog_forms()
returns trigger language plpgsql set search_path = '' as $$
declare
  lookup_lemma text;
begin
  if tg_op = 'UPDATE' and (new.danish is distinct from old.danish or new.catalog_lemma is distinct from old.catalog_lemma) then
    delete from public.word_forms where entry_id = new.id and source in ('cor', 'ddo');
  end if;
  if new.entry_kind = 'word' then
    lookup_lemma := coalesce(new.catalog_lemma, new.danish);
    -- A phrase is stored as a `word` entry; its catalog row is the one with a space.
    insert into public.word_forms (user_id, entry_id, form_key, form_text, gender, source, gloss)
    select new.user_id, new.id, f.form_key, f.form_text, f.gender, f.source, f.gloss
    from public.word_catalog_form f
    where f.lemma = lookup_lemma
      and f.kind = case when lookup_lemma ~ '\s' then 'phrase' else 'word' end
    on conflict (entry_id, form_key, form_text, gender) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.copy_catalog_forms() from public, anon, authenticated;
