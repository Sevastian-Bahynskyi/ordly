alter table public.profiles
  add column if not exists due_notifications_enabled boolean not null default true,
  add column if not exists word_challenge_notifications_enabled boolean not null default true,
  add column if not exists notification_timezone text not null default 'Europe/Copenhagen',
  add column if not exists notification_schedule jsonb not null default '{"mon":null,"tue":null,"wed":null,"thu":null,"fri":null,"sat":null,"sun":null}'::jsonb,
  add column if not exists last_due_notification_at timestamptz,
  add column if not exists last_word_challenge_at timestamptz;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy "push subscriptions owner select" on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "push subscriptions owner insert" on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "push subscriptions owner update" on public.push_subscriptions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push subscriptions owner delete" on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.notification_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('mandatory','due','challenge')),
  delivery_key text not null,
  sent_at timestamptz not null default now(),
  unique(user_id, kind, delivery_key)
);

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
