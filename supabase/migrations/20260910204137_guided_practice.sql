create table public.practice_state (
  user_id uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  revision integer not null default 0 check (revision >= 0),
  session jsonb,
  objectives jsonb not null default '{}'::jsonb check (jsonb_typeof(objectives) = 'object'),
  updated_at timestamptz not null default now(),
  check (session is null or (jsonb_typeof(session) = 'object' and session->>'version' = '1')),
  check (octet_length(coalesce(session::text, '')) < 300000),
  check (octet_length(objectives::text) < 2000000)
);

create table public.practice_attempts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  session_id uuid not null,
  target_key text not null check (length(target_key) between 1 and 100),
  entry_id uuid references public.vocabulary_entries(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) < 12000),
  created_at timestamptz not null default now()
);
create index practice_attempts_owner_time on public.practice_attempts(user_id, created_at desc);
create index practice_attempts_entry on public.practice_attempts(entry_id);

create table public.practice_packs (
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  cache_key text not null check (length(cache_key) <= 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) < 16000),
  created_at timestamptz not null default now(),
  primary key(user_id, cache_key)
);

alter table public.practice_state enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.practice_packs enable row level security;
revoke all on public.practice_state, public.practice_attempts, public.practice_packs from anon;
grant select, insert, update on public.practice_state to authenticated;
grant select, insert on public.practice_attempts, public.practice_packs to authenticated;
create policy "practice state owner read" on public.practice_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "practice state owner insert" on public.practice_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "practice state owner update" on public.practice_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "practice attempts owner read" on public.practice_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "practice attempts owner insert" on public.practice_attempts for insert to authenticated with check (
  (select auth.uid()) = user_id and (entry_id is null or exists (select 1 from public.vocabulary_entries v where v.id = entry_id and v.user_id = (select auth.uid())))
);
create policy "practice packs owner read" on public.practice_packs for select to authenticated using ((select auth.uid()) = user_id);
create policy "practice packs owner insert" on public.practice_packs for insert to authenticated with check ((select auth.uid()) = user_id);

create function public.commit_practice(
  expected_revision integer,
  next_session jsonb,
  next_objectives jsonb,
  attempt jsonb default null,
  legacy_change jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  saved public.practice_state;
  old_card public.review_cards;
  patch jsonb;
  today date := (now() at time zone 'Europe/Copenhagen')::date;
begin
  if auth.uid() is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  insert into public.practice_state(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into saved from public.practice_state where user_id = auth.uid() for update;
  if attempt is not null and exists (select 1 from public.practice_attempts where id = (attempt->>'id')::uuid and user_id = auth.uid()) then
    return jsonb_build_object('revision', saved.revision, 'session', saved.session, 'objectives', saved.objectives);
  end if;
  if saved.revision <> expected_revision then raise exception 'Practice changed on another screen' using errcode = '40001'; end if;
  if legacy_change is not null then
    select * into old_card from public.review_cards where id = (legacy_change->>'id')::uuid and user_id = auth.uid() for update;
    if not found or old_card.reps <> (legacy_change->>'expectedReps')::integer or old_card.last_review is distinct from (legacy_change->>'expectedLastReview')::timestamptz then
      raise exception 'Review card changed' using errcode = '40001';
    end if;
    patch := legacy_change->'card';
    update public.review_cards set
      due = (patch->>'due')::timestamptz, stability = (patch->>'stability')::float8,
      difficulty = (patch->>'difficulty')::float8, elapsed_days = (patch->>'elapsed_days')::integer,
      scheduled_days = (patch->>'scheduled_days')::integer, reps = (patch->>'reps')::integer,
      lapses = (patch->>'lapses')::integer, learning_steps = (patch->>'learning_steps')::integer,
      state = (patch->>'state')::integer, last_review = (patch->>'last_review')::timestamptz
    where id = old_card.id and user_id = auth.uid();
    insert into public.review_logs(user_id, card_id, entry_id, rating, answer_result, previous_state, stability, difficulty, scheduled_days, reviewed_at, study_date, previous_card)
    values (auth.uid(), old_card.id, old_card.entry_id, (attempt->>'rating')::integer,
      nullif(attempt->>'result', 'ungraded'), old_card.state, (patch->>'stability')::float8,
      (patch->>'difficulty')::float8, (patch->>'scheduled_days')::integer, (attempt->>'at')::timestamptz, today, to_jsonb(old_card));
    update public.vocabulary_entries set learning_status = case when (patch->>'reps')::integer >= 5 and (patch->>'stability')::float8 >= 21 then 'mastered' else 'learning' end where id = old_card.entry_id and user_id = auth.uid();
  end if;
  if attempt is not null then
    insert into public.practice_attempts(id, user_id, session_id, target_key, entry_id, payload)
    values ((attempt->>'id')::uuid, auth.uid(), (attempt->>'sessionId')::uuid, attempt->>'targetKey', (attempt->>'entryId')::uuid, attempt);
    update public.profiles set
      current_streak = case when last_study_date = today then current_streak when last_study_date = today - 1 then current_streak + 1 else 1 end,
      longest_streak = greatest(longest_streak, case when last_study_date = today then current_streak when last_study_date = today - 1 then current_streak + 1 else 1 end),
      last_study_date = today
    where id = auth.uid();
  end if;
  update public.practice_state set session = next_session, objectives = next_objectives, revision = revision + 1, updated_at = now()
  where user_id = auth.uid() returning * into saved;
  return jsonb_build_object('revision', saved.revision, 'session', saved.session, 'objectives', saved.objectives);
end;
$$;
revoke all on function public.commit_practice(integer, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.commit_practice(integer, jsonb, jsonb, jsonb, jsonb) to authenticated;
