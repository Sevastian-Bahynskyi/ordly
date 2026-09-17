-- Synonym edges record the meaning they are about.
--
-- Discovery used to compare two entries as bags of meanings, so a single overlapping word was
-- enough to join them: `kun` ("только") became a synonym of `lige`, whose third sense is
-- "только что". Nothing on the row said which meaning justified the edge, so neither the
-- learner nor a later reader could tell the claim was wrong.
--
-- `concept` is the shared meaning the model had to name in order for the edge to be written at
-- all. An edge that cannot be explained in one phrase is no longer stored.

alter table public.entry_links add column if not exists concept text;

comment on column public.entry_links.concept is
  'The shared meaning this edge is about, in the owner''s translation language, as the discovery model named it. Null on edges the learner created by hand and on rows written before discovery became sense-aware. Displayed on the chip and the graph so the claim can be judged.';

-- Every AI edge predates sense-aware discovery and carries no concept, so each one is a claim
-- nobody can check. They are deleted rather than backfilled: re-running discovery is one cheap
-- call per entry and produces an edge that had to justify itself.
--
-- Only `source = 'ai'` rows go. A `source = 'user'` row is the learner's own judgement — both a
-- confirmed edge and a dismissal tombstone — and confirming a chip rewrites source to 'user',
-- so nothing the learner has ruled on is touched here.
delete from public.entry_links where source = 'ai';
