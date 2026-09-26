-- Run only against an isolated test database with every Ordly migration applied.
-- Issue #28: a catalog phrase records its forms, and a saved phrase carries them.
begin;
insert into auth.users(id, email) values ('10000000-0000-4000-8000-000000000028', 'phrase-forms-fixture@example.invalid');
insert into public.word_catalog(lemma, kind, pos, ipa, ipa_source, pronunciation)
values ('stå op', 'phrase', 'verb', '[ˈsdɔˀ] [ʌb]', 'components', 'сдо о́б');
insert into public.word_catalog_form(lemma, kind, form_key, form_text) values
  ('stå op', 'phrase', 'present', 'står op'), ('stå op', 'phrase', 'present', 'står … op'), ('stå op', 'phrase', 'past', 'stod op');
insert into public.word_catalog(lemma, kind) values ('gulv', 'word');
insert into public.word_catalog_form(lemma, kind, form_key, form_text) values ('gulv', 'word', 'definite_singular', 'gulvet');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000028', true);

do $$
declare
  row public.vocabulary_entries;
  copied integer;
begin
  -- The composer's read: a typed form finds its phrase.
  if not exists (select 1 from public.word_catalog_form where kind = 'phrase' and form_text = 'står … op' and lemma = 'stå op') then
    raise exception 'A split form did not find its phrase';
  end if;

  -- Saving the headword copies the phrase's forms, and the entry is verified.
  insert into public.vocabulary_entries(id, danish, translation, catalog_lemma)
  values ('28000000-0000-4000-8000-000000000001', 'stå op', 'вставать', 'stå op')
  returning * into row;
  if row.unverified then raise exception 'A catalog phrase was marked unverified'; end if;
  select count(*) into copied from public.word_forms where entry_id = row.id and source = 'cor';
  if copied <> 3 then raise exception 'Expected 3 phrase forms on the entry, found %', copied; end if;

  -- A word keeps receiving only its own forms.
  insert into public.vocabulary_entries(id, danish, translation, catalog_lemma)
  values ('28000000-0000-4000-8000-000000000002', 'gulv', 'пол', 'gulv')
  returning * into row;
  select count(*) into copied from public.word_forms where entry_id = row.id;
  if copied <> 1 then raise exception 'Expected 1 word form, found %', copied; end if;
end $$;

-- A phrase's pronunciation still needs its IPA.
reset role;
do $$
begin
  begin
    insert into public.word_catalog(lemma, kind, pronunciation) values ('gå ud', 'phrase', 'го у́д');
    raise exception 'A pronunciation without IPA was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;
