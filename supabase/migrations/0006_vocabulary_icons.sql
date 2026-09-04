alter table public.vocabulary_entries
add column if not exists icon_name text;

comment on column public.vocabulary_entries.icon_name is
'Iconify icon identifier selected as a visual mnemonic for a word or phrase, for example ph:heart.';
