-- Keep the recording with the learner's copy of a word. Catalog unlocks copy the path just like
-- pronunciation and meanings; older AI-created entries are backfilled from matching catalog rows
-- and the remaining recordings are populated by the DDO audio script.
alter table public.vocabulary_entries
  add column audio_path text,
  add constraint vocabulary_entries_audio_path_format
    check (audio_path is null or audio_path ~ '^words/[a-z0-9-]+\.mp3$');

comment on column public.vocabulary_entries.audio_path is
  'Private word-audio bucket object path copied from the catalog or populated by the DDO audio backfill.';

update public.vocabulary_entries as entry
set audio_path = catalog.audio_path
from public.word_catalog as catalog
where entry.audio_path is null
  and entry.entry_kind = 'word'
  and catalog.kind = 'word'
  and catalog.audio_path is not null
  and lower(btrim(catalog.lemma)) = lower(btrim(entry.danish));

alter table public.profiles
  add column autoplay_audio boolean not null default false;

comment on column public.profiles.autoplay_audio is
  'Whether Review should play a word recording as soon as the Danish word becomes visible.';
