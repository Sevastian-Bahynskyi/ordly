-- A group keeps separately reviewed entries under one manually chosen headword.
-- Existing entries remain roots until the learner links them.
alter table public.vocabulary_entries
  add column canonical_entry_id uuid,
  add constraint vocabulary_entries_not_own_canonical check (canonical_entry_id is distinct from id),
  add constraint vocabulary_entries_owner_id_unique unique (user_id, id),
  add constraint vocabulary_entries_canonical_owner_fkey
    foreign key (user_id, canonical_entry_id)
    references public.vocabulary_entries(user_id, id)
    on delete set null (canonical_entry_id);

create index vocabulary_entries_canonical_idx
  on public.vocabulary_entries(user_id, canonical_entry_id)
  where canonical_entry_id is not null;

create function private.check_canonical_entry()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.canonical_entry_id is null then
    if exists (
      select 1 from public.vocabulary_entries child
      where child.canonical_entry_id = new.id
    ) and new.entry_kind <> 'word' then
      raise exception 'A canonical entry with linked words must remain a word';
    end if;
    return new;
  end if;

  if new.entry_kind <> 'word' or not exists (
    select 1 from public.vocabulary_entries parent
    where parent.id = new.canonical_entry_id
      and parent.user_id = new.user_id
      and parent.entry_kind = 'word'
      and parent.canonical_entry_id is null
  ) then
    raise exception 'Canonical entry must be an unlinked word owned by this user';
  end if;
  if exists (
    select 1 from public.vocabulary_entries child
    where child.canonical_entry_id = new.id
  ) then
    raise exception 'Move linked words before changing their canonical entry';
  end if;
  return new;
end;
$$;
revoke all on function private.check_canonical_entry() from public, anon, authenticated;

create trigger vocabulary_check_canonical_entry
before insert or update of canonical_entry_id, entry_kind on public.vocabulary_entries
for each row execute function private.check_canonical_entry();

-- Forms are spelling facts attached to an entry. They do not mint review cards or senses.
create table public.word_forms (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entry_id uuid not null,
  form_key text not null check (form_key in (
    'positive', 'comparative', 'superlative',
    'infinitive', 'present', 'past', 'past_participle', 'imperative',
    'indefinite_singular', 'definite_singular', 'indefinite_plural', 'definite_plural'
  )),
  form_text text not null check (length(btrim(form_text)) between 1 and 200),
  audio_path text check (audio_path is null or audio_path ~ '^words/[a-z0-9-]+\.mp3$'),
  updated_at timestamptz not null default now(),
  primary key (entry_id, form_key),
  foreign key (user_id, entry_id)
    references public.vocabulary_entries(user_id, id) on delete cascade
);

create index word_forms_user_entry_idx on public.word_forms(user_id, entry_id);
create trigger word_forms_touch_updated_at
before update on public.word_forms
for each row execute function private.touch_updated_at();

alter table public.word_forms enable row level security;
revoke all on public.word_forms from anon;
grant select, insert, update, delete on public.word_forms to authenticated;

create policy "owner reads word forms" on public.word_forms for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "owner inserts word forms" on public.word_forms for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "owner updates word forms" on public.word_forms for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "owner deletes word forms" on public.word_forms for delete to authenticated
  using ((select auth.uid()) = user_id);
