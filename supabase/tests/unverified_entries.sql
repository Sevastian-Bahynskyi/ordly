-- Run only against an isolated test database with every Ordly migration applied.
-- Issue #25: `unverified` is decided by the database, never by the client.
begin;
insert into auth.users(id, email) values ('10000000-0000-4000-8000-000000000025', 'unverified-fixture@example.invalid');
insert into public.word_catalog(lemma, kind) values ('gulv', 'word');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000025', true);

do $$
declare
  row public.vocabulary_entries;
begin
  -- A catalog word is verified.
  insert into public.vocabulary_entries(id, danish, translation, catalog_lemma)
  values ('25000000-0000-4000-8000-000000000001', 'gulv', 'пол', 'gulv')
  returning * into row;
  if row.unverified then raise exception 'A catalog word was marked unverified'; end if;

  -- A word the catalog does not hold is unverified, and the client cannot say otherwise.
  insert into public.vocabulary_entries(id, danish, translation, unverified)
  values ('25000000-0000-4000-8000-000000000002', 'yndlings', 'любимый', false)
  returning * into row;
  if not row.unverified then raise exception 'A manual word was accepted as verified'; end if;

  -- A catalog lemma that names no catalog row does not verify anything.
  insert into public.vocabulary_entries(id, danish, translation, catalog_lemma)
  values ('25000000-0000-4000-8000-000000000003', 'tinker', 'лудить', 'tinker')
  returning * into row;
  if not row.unverified then raise exception 'A forged catalog lemma verified an entry'; end if;

  -- Nothing clears the flag: not a direct write, not adopting a catalog lemma.
  update public.vocabulary_entries set unverified = false, catalog_lemma = 'gulv'
  where id = '25000000-0000-4000-8000-000000000002'
  returning * into row;
  if not row.unverified then raise exception 'An unverified entry was cleared'; end if;

  -- An update that keeps the Danish keeps the flag (Review writes learning_status like this).
  update public.vocabulary_entries set learning_status = 'learning'
  where id = '25000000-0000-4000-8000-000000000001'
  returning * into row;
  if row.unverified then raise exception 'A status write marked a catalog word unverified'; end if;

  -- A real lemma on text that is not that word verifies nothing.
  insert into public.vocabulary_entries(id, danish, translation, catalog_lemma)
  values ('25000000-0000-4000-8000-000000000004', 'loft', 'потолок', 'gulv')
  returning * into row;
  if not row.unverified then raise exception 'A lemma verified text that is not its word'; end if;

  -- Changing a catalog word's Danish makes it manual, even when a writer leaves the lemma behind.
  update public.vocabulary_entries set danish = 'gulvtæppe'
  where id = '25000000-0000-4000-8000-000000000001'
  returning * into row;
  if not row.unverified then raise exception 'Edited Danish kept the entry verified'; end if;
end;
$$;

-- Existing rows keep `false`: the column default is what they received.
do $$
begin
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'vocabulary_entries' and column_name = 'unverified') <> 'false' then
    raise exception 'unverified must default to false for rows that already existed';
  end if;
end;
$$;

rollback;
