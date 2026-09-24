update public.vocabulary_entries
set danish = 'yndlings-',
    example_sentence = 'Hvad er din yndlingsfarve?',
    senses = (
      select jsonb_agg(jsonb_set(sense, '{pos}', 'null'::jsonb) order by ordinal)
      from jsonb_array_elements(senses) with ordinality as items(sense, ordinal)
    )
where danish = 'yndlings'
  and entry_kind = 'word'
  and catalog_lemma is null;
