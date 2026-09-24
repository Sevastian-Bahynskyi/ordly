alter table public.word_forms drop constraint word_forms_source_check;
alter table public.word_forms add constraint word_forms_source_check check (source in ('user', 'cor', 'ddo'));

-- DDO records these irregular comparisons, which COR's simple paradigm omits.
insert into public.word_forms (user_id, entry_id, form_key, form_text, gender, source, gloss)
select e.user_id, e.id, supplement.form_key, supplement.form_text, '', 'ddo', supplement.gloss
from public.vocabulary_entries e
join (values
  ('lille', 'comparative', 'mindre', 'меньше, менее'),
  ('lille', 'superlative', 'mindst', 'самый маленький, меньше всего'),
  ('megen', 'comparative', 'mere', 'больше, ещё'),
  ('megen', 'superlative', 'mest', 'больше всего, наиболее')
) as supplement(lemma, form_key, form_text, gloss) on e.danish = supplement.lemma
where e.entry_kind = 'word'
on conflict (entry_id, form_key, form_text, gender) do nothing;

update public.vocabulary_entries e set audio_source = 'ddo'
where e.audio_path is not null and e.audio_source is null
  and exists (select 1 from storage.objects o where o.bucket_id = 'word-audio' and o.name = e.audio_path);
