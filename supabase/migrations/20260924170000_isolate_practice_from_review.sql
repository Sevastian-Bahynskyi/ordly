-- Practice no longer writes Review (issue #13, ADR 0002).
--
-- Review is the sole measure of retention. Before this migration `commit_practice` could move a
-- Review card, append a Review log, set `learning_status` and advance the Review streak, and
-- `record_sense_coverage` accepted a write from any caller. Both are closed here, in the database,
-- so neither routine can be used for a Practice write by an old client or an old deployed server.
-- (Direct owner writes to `vocabulary_entries` stay allowed: the entry editor needs them.)
--
-- Nothing existing is rewritten: Review cards, Review logs (with their `previous_card`
-- snapshots), saved senses and practice attempts are left exactly as they are. Historical
-- practice-originated Review rows are not identified or deleted.

-- 1. Session payloads are versioned. Version 2 is the AI-free session contract. NOT VALID keeps a
--    stored version-1 row as it is (the app reports it as retired) while every new write, through
--    the routine or directly, must be version 2.
alter table public.practice_state drop constraint if exists practice_state_session_check;
alter table public.practice_state add constraint practice_state_session_check
  check (session is null or (jsonb_typeof(session) = 'object' and session->>'version' = '2')) not valid;

-- 2. The Practice commit routine. Same signature, so an older caller gets a clear refusal rather
--    than a missing-function error; `next_objectives` and `legacy_change` are retired:
--    - a non-null `legacy_change` (the old Review-card write) is refused outright;
--    - `next_objectives` (the old practice FSRS schedule) is ignored and the stored value kept;
--    - an attempt no longer touches the streak on `profiles`.
create or replace function public.commit_practice(
  expected_revision integer,
  next_session jsonb,
  next_objectives jsonb,
  attempt jsonb default null,
  legacy_change jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  saved public.practice_state;
begin
  if auth.uid() is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if legacy_change is not null then
    raise exception 'Practice cannot change Review' using errcode = '42501';
  end if;
  if next_session is not null and next_session->>'version' is distinct from '2' then
    raise exception 'Retired practice session version' using errcode = '22023';
  end if;
  insert into public.practice_state(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into saved from public.practice_state where user_id = auth.uid() for update;
  if attempt is not null and exists (select 1 from public.practice_attempts where id = (attempt->>'id')::uuid and user_id = auth.uid()) then
    return jsonb_build_object('revision', saved.revision, 'session', saved.session, 'objectives', saved.objectives);
  end if;
  if saved.revision <> expected_revision then raise exception 'Practice changed on another screen' using errcode = '40001'; end if;
  if attempt is not null then
    insert into public.practice_attempts(id, user_id, session_id, target_key, entry_id, payload)
    values ((attempt->>'id')::uuid, auth.uid(), (attempt->>'sessionId')::uuid, attempt->>'targetKey', (attempt->>'entryId')::uuid, attempt);
  end if;
  update public.practice_state set session = next_session, revision = revision + 1, updated_at = now()
  where user_id = auth.uid() returning * into saved;
  return jsonb_build_object('revision', saved.revision, 'session', saved.session, 'objectives', saved.objectives);
end;
$$;
revoke all on function public.commit_practice(integer, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.commit_practice(integer, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- 3. Shared sense coverage is Review evidence, so it is now recorded against a Review log: the
--    caller names the log of the rating it just made, and the entry is taken from that log. It must
--    be the caller's own, from the last ten minutes, and a success unless only `seen` is recorded.
--    Practice never creates a Review log, so it cannot satisfy this. The old signature, which took
--    any entry id, is dropped.
drop function if exists public.record_sense_coverage(uuid, text[], text);
create function public.record_sense_coverage(review_log_id bigint, sense_ids text[], outcome text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  target_entry_id uuid;
begin
  if outcome not in ('seen', 'recognized', 'produced') then
    raise exception 'Invalid coverage outcome' using errcode = '22023';
  end if;
  select log.entry_id into target_entry_id
  from public.review_logs log
  where log.id = review_log_id
    and log.user_id = (select auth.uid())
    and log.reviewed_at >= now() - interval '10 minutes'
    and (outcome = 'seen' or log.rating > 1);
  if target_entry_id is null then
    raise exception 'Coverage requires a Review rating' using errcode = '42501';
  end if;
  if sense_ids is null or cardinality(sense_ids) = 0 then
    return;
  end if;

  update public.vocabulary_entries entry
  set senses = (
    select coalesce(jsonb_agg(
             case
               when element.value ->> 'id' = any(sense_ids) then jsonb_set(element.value, '{coverage}', jsonb_build_object(
                 'recognized', coalesce((element.value #>> '{coverage,recognized}')::numeric, 0)
                   + case when outcome = 'recognized' then 1 else 0 end,
                 'produced', coalesce((element.value #>> '{coverage,produced}')::numeric, 0)
                   + case when outcome = 'produced' then 1 else 0 end,
                 'last_seen', stamp
               ))
               else element.value
             end
             order by element.ordinality), '[]'::jsonb)
    from jsonb_array_elements(entry.senses) with ordinality as element(value, ordinality)
  )
  where entry.id = target_entry_id
    and entry.user_id = (select auth.uid())
    and exists (
      select 1 from jsonb_array_elements(entry.senses) as match(value)
      where match.value ->> 'id' = any(sense_ids)
    );
end;
$$;
revoke all on function public.record_sense_coverage(bigint, text[], text) from public, anon;
grant execute on function public.record_sense_coverage(bigint, text[], text) to authenticated;
