with corrected as (
  select e.id, jsonb_agg(jsonb_set(s.value, '{pos}', '"adjective"'::jsonb) order by s.ordinality) as senses
  from public.vocabulary_entries e
  cross join lateral jsonb_array_elements(e.senses) with ordinality as s(value, ordinality)
  where e.danish in ('morsom', 'sjov') and e.translation = 'забавный, весёлый'
  group by e.id
)
update public.vocabulary_entries e set senses = corrected.senses
from corrected where e.id = corrected.id;

insert into public.word_forms (user_id, entry_id, form_key, form_text, gender, source)
select e.user_id, e.id, f.form_key, f.form_text, f.gender, 'cor'
from public.vocabulary_entries e
join public.word_catalog_form f on f.lemma = e.danish and f.kind = 'word'
where e.danish in ('morsom', 'sjov')
  and e.translation = 'забавный, весёлый'
  and f.form_key in ('positive', 'neuter', 'plural', 'definite', 'comparative', 'superlative', 'superlative_definite')
on conflict (entry_id, form_key, form_text, gender) do nothing;
