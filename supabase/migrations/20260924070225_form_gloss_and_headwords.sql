alter table public.word_forms add column gloss text check (char_length(gloss) <= 500);

update public.word_forms f set gloss = 'некоторые, несколько'
from public.vocabulary_entries parent
where f.entry_id = parent.id and parent.danish = 'nogen'
  and f.form_key = 'pronoun_plural' and f.form_text = 'nogle';
update public.word_forms f set gloss = 'маленькие'
from public.vocabulary_entries parent
where f.entry_id = parent.id and parent.danish = 'lille'
  and f.form_key = 'plural' and f.form_text = 'små';

-- Fold two verified inflected cards into their saved dictionary words.
-- Their review cards and histories follow the existing FK cascade.
delete from public.vocabulary_entries child
using public.vocabulary_entries parent
where child.user_id = parent.user_id
  and ((child.danish = 'nogle' and child.translation = 'некоторые, несколько'
      and parent.danish = 'nogen' and child.canonical_entry_id = parent.id)
    or (child.danish = 'små' and child.translation = 'маленькие'
      and parent.danish = 'lille'))
  and exists (select 1 from public.word_forms f where f.entry_id = parent.id
      and f.form_text = child.danish and f.gloss = child.translation);

update public.vocabulary_entries set audio_path = null, audio_source = null
where audio_source = 'device_voice';
update public.word_forms set audio_path = null where audio_path is not null;
