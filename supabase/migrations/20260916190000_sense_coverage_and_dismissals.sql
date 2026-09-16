-- Meaning model review fixes. See docs/meaning-model-plan.md D9, D17, D18.
--
-- 1. Sense coverage is written, and can never be rolled back by a stale writer.
-- 2. A dismissed synonym suggestion is a tombstone, not a deleted row, so discovery does not
--    propose the same pair again on the next save.

-- Coverage is monotone: counts only grow and last_seen only moves forward. Taking the larger
-- value per sense id on every senses write means the entry editor, which saves its whole sense
-- array, cannot erase coverage that practice recorded while the editor was open.
create or replace function private.carry_sense_coverage(next_senses jsonb, previous_senses jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           case
             when previous.value is null then element.value
             else jsonb_set(element.value, '{coverage}', jsonb_build_object(
               'recognized', greatest(
                 coalesce((element.value #>> '{coverage,recognized}')::numeric, 0),
                 coalesce((previous.value #>> '{coverage,recognized}')::numeric, 0)),
               'produced', greatest(
                 coalesce((element.value #>> '{coverage,produced}')::numeric, 0),
                 coalesce((previous.value #>> '{coverage,produced}')::numeric, 0)),
               -- ISO-8601 UTC strings order lexicographically; greatest() ignores nulls.
               'last_seen', greatest(
                 element.value #>> '{coverage,last_seen}',
                 previous.value #>> '{coverage,last_seen}')
             ))
           end
           order by element.ordinality), '[]'::jsonb)
  from jsonb_array_elements(next_senses) with ordinality as element(value, ordinality)
  left join lateral (
    select old_element.value
    from jsonb_array_elements(
           case when jsonb_typeof(previous_senses) = 'array' then previous_senses else '[]'::jsonb end
         ) as old_element(value)
    where old_element.value ->> 'id' = element.value ->> 'id'
      and jsonb_typeof(old_element.value -> 'coverage') = 'object'
    limit 1
  ) as previous on true
$$;
revoke all on function private.carry_sense_coverage(jsonb, jsonb) from public, anon, authenticated;

-- Same trigger as 20260916094500, plus the coverage carry on UPDATE.
create or replace function private.sync_entry_senses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.senses is not null and jsonb_typeof(new.senses) <> 'array' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if jsonb_array_length(coalesce(new.senses, '[]'::jsonb)) = 0 and new.translation is not null then
      new.senses := private.senses_from_translation(new.translation, new.entry_kind);
    end if;
  else
    if new.senses is distinct from old.senses then
      new.senses := private.carry_sense_coverage(new.senses, old.senses);
    elsif new.translation is distinct from old.translation then
      new.senses := private.senses_from_translation(new.translation, new.entry_kind);
    end if;
  end if;

  new.translation := private.translation_from_senses(new.senses);
  return new;
end;
$$;
revoke all on function private.sync_entry_senses() from public, anon, authenticated;

-- One atomic coverage write per graded exposure (D9, D18). Reading the senses in the app and
-- writing them back would race the entry editor and the practice example fill; this updates the
-- matching sense objects in place inside one statement.
--
-- outcome: 'seen' only stamps last_seen; 'recognized' and 'produced' also count a success.
-- SECURITY INVOKER: the update runs under the caller's own RLS on vocabulary_entries.
create or replace function public.record_sense_coverage(target_entry_id uuid, sense_ids text[], outcome text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if outcome not in ('seen', 'recognized', 'produced') then
    raise exception 'Invalid coverage outcome' using errcode = '22023';
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
revoke all on function public.record_sense_coverage(uuid, text[], text) from public, anon;
grant execute on function public.record_sense_coverage(uuid, text[], text) to authenticated;

-- Dismissal tombstones. A dismissed edge is written by the learner (`source = 'user'`), so D17
-- demotion leaves it alone and discovery treats the pair as already ruled on. Every reader that
-- shows, grades or teaches from edges filters `dismissed_at is null`.
alter table public.entry_links add column if not exists dismissed_at timestamptz;

alter table public.entry_links drop constraint if exists entry_links_dismissed_unconfirmed;
alter table public.entry_links
  add constraint entry_links_dismissed_unconfirmed check (dismissed_at is null or not confirmed);

comment on column public.entry_links.dismissed_at is
  'Set when the learner dismisses a suggested edge. The row is kept so discovery never proposes the pair again; readers that display, grade or teach must filter dismissed_at is null.';
