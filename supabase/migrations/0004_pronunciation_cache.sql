create table public.pronunciation_cache (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  normalized_text text not null,
  pipeline_version integer not null default 1,
  pronunciation text not null,
  ipa text not null,
  source text not null check (source in ('ddo', 'wiktionary', 'groq')),
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  ddo_ipa text[] not null default '{}',
  wiktionary_ipa text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, normalized_text, pipeline_version)
);

create index pronunciation_cache_text_idx on public.pronunciation_cache(normalized_text, pipeline_version);

alter table public.pronunciation_cache enable row level security;

create policy pronunciation_cache_select_own on public.pronunciation_cache
for select to authenticated using (user_id = auth.uid());

create policy pronunciation_cache_insert_own on public.pronunciation_cache
for insert to authenticated with check (user_id = auth.uid());

create policy pronunciation_cache_update_own on public.pronunciation_cache
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy pronunciation_cache_delete_own on public.pronunciation_cache
for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.pronunciation_cache to authenticated;
