-- Run only against an isolated test database with the Ordly migrations applied.
-- The database half of issue #13: Practice records its own attempts and nothing else. It cannot
-- move a Review card, append a Review log, change learning status, the streak or shared sense
-- coverage — including when a legacy client sends the retired `legacy_change` payload or an old
-- version-1 session.
begin;
insert into auth.users(id, email) values ('10000000-0000-4000-8000-000000000001', 'practice-fixture@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.vocabulary_entries(id, danish, translation) values ('20000000-0000-4000-8000-000000000001', 'svært', 'difficult');
do $$
declare
  snapshot jsonb;
  card public.review_cards;
  before_card jsonb;
  before_entry jsonb;
  before_profile jsonb;
  patch jsonb;
  event jsonb;
  change jsonb;
  log_id bigint;
  session jsonb := '{"version":2,"queue":[]}';
begin
  select * into card from public.review_cards limit 1;
  before_card := to_jsonb(card);
  select to_jsonb(v) - 'updated_at' into before_entry from public.vocabulary_entries v where id = card.entry_id;
  select jsonb_build_object('current', current_streak, 'longest', longest_streak, 'last', last_study_date) into before_profile from public.profiles;

  snapshot := public.commit_practice(0, session, '{}');
  if snapshot->>'revision' <> '1' then raise exception 'Initial save failed'; end if;

  -- An internal attempt is recorded; the retired objectives argument is ignored.
  event := jsonb_build_object('id', '30000000-0000-4000-8000-000000000001', 'sessionId', '40000000-0000-4000-8000-000000000001', 'entryId', card.entry_id, 'targetKey', card.entry_id, 'result', 'correct', 'at', now());
  snapshot := public.commit_practice(1, session, '{"smuggled":{"card":{}}}', event);
  if snapshot->>'revision' <> '2' or (select count(*) from public.practice_attempts) <> 1 then raise exception 'Attempt was not recorded'; end if;
  if snapshot->'objectives' <> '{}'::jsonb then raise exception 'Practice objectives were written'; end if;
  snapshot := public.commit_practice(1, session, '{}', event);
  if snapshot->>'revision' <> '2' or (select count(*) from public.practice_attempts) <> 1 then raise exception 'Duplicate attempt was written'; end if;

  -- Legacy client: the old Review-card write is refused and writes nothing at all.
  patch := to_jsonb(card) || jsonb_build_object('due', now() + interval '10 days', 'last_review', now(), 'reps', 1, 'state', 2, 'stability', 30, 'difficulty', 5);
  change := jsonb_build_object('id', card.id, 'expectedReps', 0, 'expectedLastReview', null, 'card', patch);
  event := event || jsonb_build_object('id', '30000000-0000-4000-8000-000000000002', 'rating', 3);
  begin
    perform public.commit_practice(2, session, '{}', event, change);
    raise exception 'Legacy Review change was accepted';
  exception when insufficient_privilege then null; end;
  -- An old saved session payload is refused too.
  begin
    perform public.commit_practice(2, '{"version":1,"queue":[],"aiEnabled":true}', '{}', event);
    raise exception 'Version-1 session was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.commit_practice(1, session, '{}');
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null; end;

  if (select count(*) from public.practice_attempts) <> 1 then raise exception 'A refused commit wrote an attempt'; end if;
  if (select to_jsonb(c) from public.review_cards c where id = card.id) <> before_card then raise exception 'Practice changed the Review card'; end if;
  if exists (select 1 from public.review_logs) then raise exception 'Practice wrote a Review log'; end if;
  if (select to_jsonb(v) - 'updated_at' from public.vocabulary_entries v where id = card.entry_id) <> before_entry then raise exception 'Practice changed the entry'; end if;
  if (select jsonb_build_object('current', current_streak, 'longest', longest_streak, 'last', last_study_date) from public.profiles) <> before_profile then raise exception 'Practice changed the Review streak'; end if;

  -- Shared sense coverage is Review evidence only: it needs the caller's own recent, successful Review log.
  begin
    perform public.record_sense_coverage(0, array[(before_entry #>> '{senses,0,id}')], 'produced');
    raise exception 'Coverage was written without a Review rating';
  exception when insufficient_privilege then null; end;
  if (select to_jsonb(v) - 'updated_at' from public.vocabulary_entries v where id = card.entry_id) <> before_entry then raise exception 'Coverage leaked into the entry'; end if;
  insert into public.review_logs(card_id, entry_id, rating, previous_state, stability, difficulty, scheduled_days, study_date, reviewed_at)
  values (card.id, card.entry_id, 1, 0, 1, 5, 0, current_date, now()) returning id into log_id;
  begin
    perform public.record_sense_coverage(log_id, array[(before_entry #>> '{senses,0,id}')], 'recognized');
    raise exception 'An Again rating credited coverage';
  exception when insufficient_privilege then null; end;
  insert into public.review_logs(card_id, entry_id, rating, previous_state, stability, difficulty, scheduled_days, study_date, reviewed_at)
  values (card.id, card.entry_id, 3, 0, 1, 5, 0, current_date, now() - interval '1 hour') returning id into log_id;
  begin
    perform public.record_sense_coverage(log_id, array[(before_entry #>> '{senses,0,id}')], 'recognized');
    raise exception 'A stale Review log credited coverage';
  exception when insufficient_privilege then null; end;
  insert into public.review_logs(card_id, entry_id, rating, previous_state, stability, difficulty, scheduled_days, study_date, reviewed_at)
  values (card.id, card.entry_id, 3, 0, 1, 5, 0, current_date, now()) returning id into log_id;
  perform public.record_sense_coverage(log_id, array[(before_entry #>> '{senses,0,id}')], 'recognized');
  if (select (senses #>> '{0,coverage,recognized}')::int from public.vocabulary_entries where id = card.entry_id) <> 1 then raise exception 'Review coverage was not written'; end if;

  begin
    insert into public.practice_state(user_id) values ('10000000-0000-4000-8000-000000000002');
    raise exception 'Cross-owner write was accepted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists(select 1 from public.practice_state) or exists(select 1 from public.practice_attempts) then raise exception 'Cross-owner read leaked data'; end if;
end $$;
reset role;
do $$ begin
  -- A version-1 session can no longer be written, even directly to the table.
  begin
    update public.practice_state set session = '{"version":1,"queue":[]}' where user_id = '10000000-0000-4000-8000-000000000001';
    raise exception 'A version-1 session was written';
  exception when check_violation then null; end;
  if has_function_privilege('anon', 'public.commit_practice(integer,jsonb,jsonb,jsonb,jsonb)', 'execute') then raise exception 'Anonymous RPC access'; end if;
  if has_function_privilege('anon', 'public.record_sense_coverage(bigint,text[],text)', 'execute') then raise exception 'Anonymous coverage access'; end if;
end $$;
rollback;
