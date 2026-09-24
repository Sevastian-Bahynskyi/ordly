alter table public.word_catalog_form add column source text not null default 'cor' check (source in ('cor', 'ddo'));
alter table public.word_catalog_form add column gloss text check (char_length(gloss) <= 500);

insert into public.word_catalog_form (lemma, kind, form_key, form_text, gender, source, gloss)
select c.lemma, c.kind, supplement.form_key, supplement.form_text, '', 'ddo', supplement.gloss
from (values
  ('lille', 'comparative', 'mindre', 'меньше, менее'),
  ('lille', 'superlative', 'mindst', 'самый маленький, меньше всего'),
  ('megen', 'comparative', 'mere', 'больше, ещё'),
  ('megen', 'superlative', 'mest', 'больше всего, наиболее')
) as supplement(lemma, form_key, form_text, gloss)
join public.word_catalog c on c.lemma = supplement.lemma and c.kind = 'word'
on conflict (lemma, kind, form_key, form_text, gender) do update
set source = excluded.source, gloss = excluded.gloss;

create or replace function private.copy_catalog_forms()
returns trigger language plpgsql set search_path = '' as $$
declare
  lookup_lemma text;
begin
  if tg_op = 'UPDATE' and (new.danish is distinct from old.danish or new.catalog_lemma is distinct from old.catalog_lemma) then
    delete from public.word_forms where entry_id = new.id and source in ('cor', 'ddo');
  end if;
  if new.entry_kind = 'word' then
    lookup_lemma := coalesce(new.catalog_lemma, new.danish);
    insert into public.word_forms (user_id, entry_id, form_key, form_text, gender, source, gloss)
    select new.user_id, new.id, f.form_key, f.form_text, f.gender, f.source, f.gloss
    from public.word_catalog_form f
    where f.lemma = lookup_lemma and f.kind = 'word'
    on conflict (entry_id, form_key, form_text, gender) do nothing;
  end if;
  return new;
end;
$$;
