alter table public.vocabulary_entries drop constraint vocabulary_entries_audio_source_check;
alter table public.vocabulary_entries add constraint vocabulary_entries_audio_source_check check (audio_source = 'ddo');
alter table public.word_forms drop column audio_path;
