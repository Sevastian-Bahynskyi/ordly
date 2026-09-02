alter table public.vocabulary_entries
  add column if not exists entry_kind text not null default 'word'
  check (entry_kind in ('word', 'sentence'));

comment on column public.vocabulary_entries.entry_kind is
  'Whether the saved Danish text is a lexical word/phrase or a complete sentence/expression reviewed as a sentence.';
