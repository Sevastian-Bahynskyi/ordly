-- Run only against an isolated test database with every Ordly migration applied.
-- Issue #14: one catalog sense carries several learner languages under one identity, the catalog
-- stays read-only to learners, and new profiles start in English.
begin;
insert into public.word_catalog(lemma, kind, pos, gender) values ('gulv', 'word', 'noun', 'et');
insert into public.word_catalog_sense(lemma, kind, sense_id, ordinal, lang, text, pos, gender)
values ('gulv', 'word', '93c644ae-08f2-5a1c-ac53-75bf47a66274', 1, 'ru', 'пол', 'noun', 'et');

do $$
begin
  -- The same sense in English: a second wording, not a second meaning.
  insert into public.word_catalog_sense(lemma, kind, sense_id, ordinal, lang, text, pos, gender, generator)
  values ('gulv', 'word', '93c644ae-08f2-5a1c-ac53-75bf47a66274', 1, 'en', 'floor', 'noun', 'et', 'pilot');
  if (select count(distinct sense_id) from public.word_catalog_sense where lemma = 'gulv') <> 1 then raise exception 'The English wording minted a new sense'; end if;

  begin
    insert into public.word_catalog_sense(lemma, kind, sense_id, ordinal, lang, text, pos, gender)
    values ('gulv', 'word', '93c644ae-08f2-5a1c-ac53-75bf47a66274', 1, 'en', 'ground', 'noun', 'et');
    raise exception 'A second English wording of one sense was accepted';
  exception when unique_violation then null; end;

  begin
    update public.word_catalog_sense set pos = 'verb', gender = null where lemma = 'gulv' and lang = 'en';
    raise exception 'Languages were allowed to disagree about the part of speech';
  exception when check_violation then null; end;

  begin
    insert into public.word_catalog_sense(lemma, kind, sense_id, ordinal, lang, text) values ('gulv', 'word', gen_random_uuid(), 2, 'de', 'Boden');
    raise exception 'An unsupported language was accepted';
  exception when check_violation then null; end;
end $$;

-- New profiles start in English; the learner cannot write the catalog.
insert into auth.users(id, email) values ('10000000-0000-4000-8000-000000000001', 'locale-fixture@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
begin
  if (select default_translation_language from public.profiles) <> 'en' then raise exception 'A new profile did not start in English'; end if;
  if (select count(*) from public.word_catalog_sense where lemma = 'gulv') <> 2 then raise exception 'A learner cannot read both wordings'; end if;
  begin
    insert into public.word_catalog_sense(lemma, kind, sense_id, ordinal, lang, text) values ('gulv', 'word', gen_random_uuid(), 2, 'en', 'x');
    raise exception 'A learner wrote the catalog';
  exception when insufficient_privilege then null; end;
  begin
    update public.word_catalog_sense set text = 'changed' where lemma = 'gulv';
    raise exception 'A learner updated the catalog';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.word_catalog_sense where lemma = 'gulv';
    raise exception 'A learner deleted from the catalog';
  exception when insufficient_privilege then null; end;
end $$;
-- Switching the learner language changes the preference only: saved meanings and Review stay.
insert into public.vocabulary_entries(id, danish, translation) values ('20000000-0000-4000-8000-000000000001', 'gulv', 'пол');
do $$
declare
  entry jsonb;
  card jsonb;
begin
  select to_jsonb(v) into entry from public.vocabulary_entries v;
  select to_jsonb(c) into card from public.review_cards c;
  update public.profiles set default_translation_language = 'ru';
  update public.profiles set default_translation_language = 'en';
  if (select to_jsonb(v) from public.vocabulary_entries v) <> entry then raise exception 'A language switch rewrote a saved meaning'; end if;
  if (select to_jsonb(c) from public.review_cards c) <> card then raise exception 'A language switch touched Review'; end if;
end $$;
reset role;
do $$ begin
  if (select text from public.word_catalog_sense where lemma = 'gulv' and lang = 'en') <> 'floor' then raise exception 'A learner changed the catalog'; end if;
end $$;
rollback;
