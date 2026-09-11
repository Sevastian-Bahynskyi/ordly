-- Run only against an isolated test database with the Ordly migrations applied.
begin;
insert into auth.users(id, email) values ('10000000-0000-4000-8000-000000000001', 'practice-fixture@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.vocabulary_entries(id, danish, translation) values ('20000000-0000-4000-8000-000000000001', 'svært', 'difficult');
do $$
declare
  snapshot jsonb;
  card public.review_cards;
  patch jsonb;
  event jsonb;
  change jsonb;
begin
  snapshot := public.commit_practice(0, '{"version":1,"queue":[]}', '{}');
  if snapshot->>'revision' <> '1' then raise exception 'Initial save failed'; end if;
  select * into card from public.review_cards limit 1;
  patch := to_jsonb(card) || jsonb_build_object('due', now() + interval '10 minutes', 'last_review', now(), 'reps', 1, 'state', 1, 'stability', 1, 'difficulty', 5);
  event := jsonb_build_object('id', '30000000-0000-4000-8000-000000000001', 'sessionId', '40000000-0000-4000-8000-000000000001', 'entryId', card.entry_id, 'targetKey', card.entry_id, 'rating', 3, 'result', 'correct', 'at', now());
  change := jsonb_build_object('id', card.id, 'expectedReps', 0, 'expectedLastReview', null, 'card', patch);
  snapshot := public.commit_practice(1, '{"version":1,"queue":[]}', '{}', event, change);
  if snapshot->>'revision' <> '2' or (select count(*) from public.review_logs) <> 1 then raise exception 'Atomic rating failed'; end if;
  snapshot := public.commit_practice(1, null, '{}', event, change);
  if snapshot->>'revision' <> '2' or (select count(*) from public.review_logs) <> 1 then raise exception 'Duplicate rating was written'; end if;
  begin
    perform public.commit_practice(1, null, '{}');
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null; end;
  event := event || jsonb_build_object('id', '30000000-0000-4000-8000-000000000002');
  begin
    perform public.commit_practice(2, null, '{}', event, change);
    raise exception 'Stale review card was accepted';
  exception when serialization_failure then null; end;
  if (select count(*) from public.practice_attempts) <> 1 then raise exception 'Conflict wrote an attempt'; end if;
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
  if has_function_privilege('anon', 'public.commit_practice(integer,jsonb,jsonb,jsonb,jsonb)', 'execute') then raise exception 'Anonymous RPC access'; end if;
end $$;
rollback;
