-- Accepted gap answers for sentence-family variants (issue #16).
--
-- The pilot audit found that a gap is often fitted by a second word as well as the target (`for`
-- "because" beside `fordi`). Rather than mark that learner wrong, a variant lists the other words
-- that fill its gap correctly, and the grader accepts them alongside the target.
alter table public.catalog_sentence_variant add column if not exists accepted text[] not null default '{}';
comment on column public.catalog_sentence_variant.accepted is
  'Other words that fill the gap correctly given the translation shown (issue #16). Graded as correct alongside target.';
