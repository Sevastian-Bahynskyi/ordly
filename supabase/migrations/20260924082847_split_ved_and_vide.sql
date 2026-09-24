do $$
declare
  original public.vocabulary_entries%rowtype;
  verb_sense jsonb;
  preposition_sense jsonb;
  verb_catalog public.word_catalog%rowtype;
  preposition_catalog public.word_catalog%rowtype;
begin
  select * into original
  from public.vocabulary_entries
  where danish = 'ved' and catalog_lemma is null
    and senses @> '[{"pos":"verb","text":"знать"}]'::jsonb
    and senses @> '[{"pos":"preposition","text":"около"}]'::jsonb
  limit 1;
  if not found then return; end if;

  select value into verb_sense from jsonb_array_elements(original.senses) where value->>'pos' = 'verb' and value->>'text' = 'знать' limit 1;
  select value into preposition_sense from jsonb_array_elements(original.senses) where value->>'pos' = 'preposition' and value->>'text' = 'около' limit 1;
  select * into verb_catalog from public.word_catalog where lemma = 'vide' and kind = 'word';
  select * into preposition_catalog from public.word_catalog where lemma = 'ved' and kind = 'word';
  if verb_catalog.audio_path is null or preposition_catalog.audio_path is null then
    raise exception 'DDO recordings for vide and ved are required';
  end if;

  update public.vocabulary_entries
  set danish = 'vide',
      pronunciation = verb_catalog.pronunciation,
      translation = 'знать',
      senses = jsonb_build_array(verb_sense),
      catalog_lemma = 'vide',
      audio_path = verb_catalog.audio_path,
      audio_source = 'ddo'
  where id = original.id;

  insert into public.vocabulary_entries (
    user_id, danish, pronunciation, translation, example_sentence, example_translation,
    entry_kind, senses, catalog_lemma, audio_path, audio_source, ai_enriched
  ) values (
    original.user_id, 'ved', preposition_catalog.pronunciation, 'около',
    preposition_catalog.example_sentence, preposition_catalog.example_translation,
    'word', jsonb_build_array(preposition_sense), 'ved', preposition_catalog.audio_path, 'ddo', true
  );

  insert into public.word_forms (user_id, entry_id, form_key, form_text, gender, source, gloss)
  select original.user_id, original.id, f.form_key, f.form_text, f.gender, f.source, f.gloss
  from public.word_catalog_form f
  where f.lemma = 'vide' and f.kind = 'word'
  on conflict (entry_id, form_key, form_text, gender) do nothing;
end $$;
