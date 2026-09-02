create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  default_translation_language text not null default 'ru' check (default_translation_language in ('ru','en','uk')),
  danish_level text not null default 'A1' check (danish_level in ('A1','A2','B1','B2','C1')),
  daily_new_limit integer not null default 10 check (daily_new_limit between 1 and 50),
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_study_date date,
  created_at timestamptz not null default now()
);

create table public.vocabulary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  danish text not null check (length(trim(danish)) between 1 and 200),
  pronunciation text,
  translation text,
  example_sentence text,
  example_translation text,
  learning_status text not null default 'new' check (learning_status in ('new','learning','mastered')),
  familiarity integer not null default 0 check (familiarity between 0 and 2),
  ai_enriched boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vocabulary_entries_user_created_idx on public.vocabulary_entries(user_id, created_at desc);
create index vocabulary_entries_user_status_idx on public.vocabulary_entries(user_id, learning_status);
create index vocabulary_entries_user_danish_lower_idx on public.vocabulary_entries(user_id, lower(danish));

create table public.review_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entry_id uuid not null unique references public.vocabulary_entries(id) on delete cascade,
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  learning_steps integer not null default 0,
  state integer not null default 0 check (state between 0 and 3),
  last_review timestamptz
);
create index review_cards_user_due_idx on public.review_cards(user_id, due);

create table public.review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  card_id uuid not null references public.review_cards(id) on delete cascade,
  entry_id uuid not null references public.vocabulary_entries(id) on delete cascade,
  rating integer not null check (rating between 1 and 4),
  answer_result text check (answer_result in ('correct','mostly','incorrect')),
  previous_state integer not null,
  stability double precision not null,
  difficulty double precision not null,
  scheduled_days integer not null,
  reviewed_at timestamptz not null default now(),
  study_date date not null
);
create index review_logs_user_study_date_idx on public.review_logs(user_id, study_date);
create index review_logs_card_id_idx on public.review_logs(card_id);
create index review_logs_entry_id_idx on public.review_logs(entry_id);

create table public.review_sentence_cache (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.vocabulary_entries(id) on delete cascade,
  cycle integer not null check (cycle >= 0),
  sentence text not null,
  translation text not null,
  created_at timestamptz not null default now(),
  unique(entry_id, cycle)
);
create index review_sentence_cache_user_id_idx on public.review_sentence_cache(user_id);

create or replace function private.claim_first_account()
returns trigger
language plpgsql
security definer
set search_path = public, auth, private
as $$
begin
  if exists (select 1 from public.profiles limit 1) then
    raise exception 'This Ordly instance already has an owner.';
  end if;
  insert into public.profiles(id, email) values (new.id, new.email);
  return new;
end;
$$;
revoke all on function private.claim_first_account() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_ordly on auth.users;
create trigger on_auth_user_created_ordly
after insert on auth.users
for each row execute function private.claim_first_account();

create or replace function private.create_review_card()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.review_cards(user_id, entry_id, due) values (new.user_id, new.id, now());
  return new;
end;
$$;
revoke all on function private.create_review_card() from public, anon, authenticated;

create trigger vocabulary_create_review_card
after insert on public.vocabulary_entries
for each row execute function private.create_review_card();

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = public, private as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
create trigger vocabulary_touch_updated_at before update on public.vocabulary_entries for each row execute function private.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.vocabulary_entries enable row level security;
alter table public.review_cards enable row level security;
alter table public.review_logs enable row level security;
alter table public.review_sentence_cache enable row level security;

create policy "owner reads profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "owner updates profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "owner reads vocabulary" on public.vocabulary_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts vocabulary" on public.vocabulary_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner updates vocabulary" on public.vocabulary_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner deletes vocabulary" on public.vocabulary_entries for delete to authenticated using ((select auth.uid()) = user_id);

create policy "owner reads cards" on public.review_cards for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner updates cards" on public.review_cards for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "owner reads logs" on public.review_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts logs" on public.review_logs for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "owner reads sentence cache" on public.review_sentence_cache for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner inserts sentence cache" on public.review_sentence_cache for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.vocabulary_entries, public.review_cards, public.review_logs, public.review_sentence_cache from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.vocabulary_entries to authenticated;
grant select, update on public.review_cards to authenticated;
grant select, insert on public.review_logs to authenticated;
grant select, insert on public.review_sentence_cache to authenticated;
grant usage, select on sequence public.review_logs_id_seq to authenticated;
grant usage, select on sequence public.review_sentence_cache_id_seq to authenticated;
