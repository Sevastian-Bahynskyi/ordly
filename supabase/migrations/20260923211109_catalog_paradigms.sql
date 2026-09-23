create index cor_form_lemma_idx on public.cor_form (lemma, tag);
alter table public.vocabulary_entries add column audio_source text check (audio_source in ('ddo', 'device_voice'));

alter table public.word_forms drop constraint word_forms_form_key_check;
alter table public.word_forms add constraint word_forms_form_key_check check (form_key in (
  'positive', 'neuter', 'plural', 'definite', 'comparative', 'superlative', 'superlative_definite',
  'infinitive', 'present', 'past', 'past_participle', 'present_participle', 'imperative',
  'indefinite_singular', 'definite_singular', 'indefinite_plural', 'definite_plural'
  , 'pronoun_common', 'pronoun_neuter', 'pronoun_plural', 'pronoun_subject', 'pronoun_object'
));

create table public.word_catalog_form (
  lemma text not null,
  kind text not null default 'word' check (kind = 'word'),
  form_key text not null check (form_key in (
    'positive', 'neuter', 'plural', 'definite', 'comparative', 'superlative', 'superlative_definite',
    'infinitive', 'present', 'past', 'past_participle', 'present_participle', 'imperative',
    'indefinite_singular', 'definite_singular', 'indefinite_plural', 'definite_plural'
    , 'pronoun_common', 'pronoun_neuter', 'pronoun_plural', 'pronoun_subject', 'pronoun_object'
  )),
  form_text text not null check (length(btrim(form_text)) between 1 and 200),
  gender text not null default '' check (gender in ('', 'en', 'et')),
  primary key (lemma, kind, form_key, form_text, gender),
  foreign key (lemma, kind) references public.word_catalog(lemma, kind) on delete cascade
);
create index word_catalog_form_lookup_idx on public.word_catalog_form (lemma, kind);
alter table public.word_catalog_form enable row level security;
revoke all on public.word_catalog_form from anon;
grant select on public.word_catalog_form to authenticated;
create policy "signed-in sessions read catalog forms" on public.word_catalog_form
  for select to authenticated using (true);

alter table public.word_forms drop constraint word_forms_pkey;
alter table public.word_forms add column gender text not null default '' check (gender in ('', 'en', 'et'));
alter table public.word_forms add column source text not null default 'user' check (source in ('user', 'cor'));
alter table public.word_forms add primary key (entry_id, form_key, form_text, gender);

create function private.copy_catalog_forms()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.danish is distinct from old.danish or new.catalog_lemma is distinct from old.catalog_lemma) then
    delete from public.word_forms where entry_id = new.id and source = 'cor';
  end if;
  if new.catalog_lemma is not null and new.entry_kind = 'word' then
    insert into public.word_forms (user_id, entry_id, form_key, form_text, gender, source)
    select new.user_id, new.id, form_key, form_text, gender, 'cor'
    from public.word_catalog_form
    where lemma = new.catalog_lemma and kind = 'word'
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.copy_catalog_forms() from public, anon, authenticated;
create trigger vocabulary_copy_catalog_forms
after insert or update of danish, catalog_lemma on public.vocabulary_entries
for each row execute function private.copy_catalog_forms();
