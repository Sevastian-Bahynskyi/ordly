-- Run only against an isolated test database with every Ordly migration applied.
-- Covers the meaning-model silent-failure risks that only the real SQL can prove (plan §7).
begin;
insert into auth.users(id, email) values ('10000000-0000-4000-8000-000000000001', 'meaning-fixture@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
declare
  row public.vocabulary_entries;
  sense_id text;
  log_id bigint;
begin
  -- Sentence guard: a sentence translation is never comma-split.
  insert into public.vocabulary_entries(id, danish, translation, entry_kind)
  values ('20000000-0000-4000-8000-000000000001', 'Jeg synes, det er svært.', 'Я думаю, это трудно.', 'sentence')
  returning * into row;
  if jsonb_array_length(row.senses) <> 1 or row.senses -> 0 ->> 'text' <> 'Я думаю, это трудно.' then
    raise exception 'Sentence translation was split: %', row.senses;
  end if;

  -- Words are split, and the translation is rebuilt from the senses.
  insert into public.vocabulary_entries(id, danish, translation)
  values ('20000000-0000-4000-8000-000000000002', 'svært', 'трудно; сложно')
  returning * into row;
  if jsonb_array_length(row.senses) <> 2 or row.translation <> 'трудно, сложно' then
    raise exception 'Word translation was not split: % / %', row.senses, row.translation;
  end if;

  -- Bulk add: a null translation leaves senses empty.
  insert into public.vocabulary_entries(id, danish) values ('20000000-0000-4000-8000-000000000003', 'hus')
  returning * into row;
  if jsonb_array_length(row.senses) <> 0 or row.translation is not null then
    raise exception 'Bulk add gained senses';
  end if;

  -- Coverage is recorded atomically and only on the named sense, after a Review rating.
  insert into public.review_logs(card_id, entry_id, rating, previous_state, stability, difficulty, scheduled_days, study_date)
  select id, entry_id, 3, 0, 1, 5, 0, current_date from public.review_cards where entry_id = '20000000-0000-4000-8000-000000000002'
  returning id into log_id;
  perform set_config('test.log_id', log_id::text, true);
  select senses -> 1 ->> 'id' into sense_id from public.vocabulary_entries where id = '20000000-0000-4000-8000-000000000002';
  perform set_config('test.sense_id', sense_id, true);
  perform public.record_sense_coverage(log_id, array[sense_id], 'recognized');
  perform public.record_sense_coverage(log_id, array[sense_id], 'produced');
  select * into row from public.vocabulary_entries where id = '20000000-0000-4000-8000-000000000002';
  if (row.senses -> 1 #>> '{coverage,recognized}')::int <> 1
    or (row.senses -> 1 #>> '{coverage,produced}')::int <> 1
    or row.senses -> 1 #>> '{coverage,last_seen}' is null
    or row.senses -> 0 #>> '{coverage,last_seen}' is not null then
    raise exception 'Coverage write was wrong: %', row.senses;
  end if;
  if row.translation <> 'трудно, сложно' then raise exception 'Coverage write changed the translation'; end if;

  -- A stale writer (the entry editor) saving zeroed coverage cannot roll it back.
  update public.vocabulary_entries
  set senses = jsonb_set(senses, '{1,coverage}', '{"recognized":0,"produced":0,"last_seen":null}')
  where id = '20000000-0000-4000-8000-000000000002'
  returning * into row;
  if (row.senses -> 1 #>> '{coverage,recognized}')::int <> 1 or row.senses -> 1 #>> '{coverage,last_seen}' is null then
    raise exception 'Stale save rolled coverage back: %', row.senses;
  end if;

  begin
    perform public.record_sense_coverage(log_id, array[sense_id], 'mastered');
    raise exception 'Invalid outcome was accepted';
  exception when invalid_parameter_value then null; end;

  -- Dismissal tombstones cannot also be confirmed.
  insert into public.entry_links(a_id, b_id, kind, source, confirmed, dismissed_at)
  values ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'synonym', 'user', false, now());
  begin
    update public.entry_links set confirmed = true where a_id = '20000000-0000-4000-8000-000000000002';
    raise exception 'A dismissed edge was confirmed';
  exception when check_violation then null; end;
end $$;

-- Another account (never allowed to register, so only a forged claim) can neither see nor bump this learner's coverage.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.record_sense_coverage(current_setting('test.log_id')::bigint, array[current_setting('test.sense_id')], 'produced');
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.vocabulary_entries) then raise exception 'Cross-owner read leaked data'; end if;
end $$;
reset role;
do $$
declare
  produced int;
begin
  select (senses -> 1 #>> '{coverage,produced}')::int into produced from public.vocabulary_entries where id = '20000000-0000-4000-8000-000000000002';
  if produced <> 1 then raise exception 'Cross-owner coverage write landed'; end if;
  if has_function_privilege('anon', 'public.record_sense_coverage(bigint,text[],text)', 'execute') then raise exception 'Anonymous coverage RPC access'; end if;
end $$;
rollback;
