-- Word and phrase recordings now come from Azure Speech (issue #16).
--
-- The DDO website recordings were copied to `word-audio/legacy/ddo/` and are no longer used: no
-- rights check was ever recorded for them. New recordings are synthesized for every catalog word
-- and phrase and every saved word or phrase (scripts/synthesize-audio.ts) under
-- `words/<slug>-<digest>-azure.mp3`, which the existing path format already admits, and rows are
-- pointed at them by the load that follows this migration.
alter table public.vocabulary_entries drop constraint vocabulary_entries_audio_source_check;
alter table public.vocabulary_entries add constraint vocabulary_entries_audio_source_check
  check (audio_source in ('azure', 'ddo'));

comment on column public.vocabulary_entries.audio_path is
  'Private word-audio bucket object path: an Azure Speech recording copied from the catalog or synthesized for the saved word.';
comment on column public.vocabulary_entries.audio_source is
  'azure: Azure Speech recording. ddo: a retired DDO website recording (legacy/ddo), kept only until the row is moved.';
comment on column public.word_catalog.audio_path is
  'Object path in the private word-audio bucket: an Azure Speech recording of the headword or phrase.';
