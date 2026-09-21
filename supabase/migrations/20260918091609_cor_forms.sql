-- COR — Det Centrale Ordregister — as a lookup table (issue #5 §1).
--
-- `en` or `et` is a recorded fact, published CC0-1.0 by the people who define Danish
-- orthography. Ordly used to ask a model to have an opinion about it, and only when the learner
-- pressed Grammar. This table is that fact, so gender stops being a guess.
--
-- Source: https://ordregister.dk/files/cor1.5.1.0.tsv — v1.5.1.0 (2025-12-16), CC0-1.0,
-- 31,206,228 bytes, tab-separated, no header, 535,774 rows, six fields. Loaded by
-- `scripts/import-cor.ts`; the research behind every number is in docs/free-data-sources.md.
--
-- A table rather than a bundled file on purpose: 19 MB parsed per cold start is exactly the
-- critical-path cost AGENTS.md §16 warns about. One indexed lookup on `form` is not.
--
-- Only normering `N` is imported — the normed, currently-correct spellings. That drops 423,726
-- forms to 247,527 (−42%) and costs exactly one word of the real vocabulary (`yndlings`). The
-- published README documents field 6 as `1`/`0`; the shipped file contains `N`/`K`/`U`. The file
-- is what is trusted here.

create table public.cor_form (
  -- The inflected form, lowercased: this is the lookup key, and it is why `gulvet` resolves to
  -- `gulv` and `dovne` to `doven` without lemmatising anything first.
  form text not null,
  lemma text not null,
  -- COR's grammatical tag, e.g. `sb.itk.sg.ubest`. Gender lives here: `sb.fk.*` is `en`,
  -- `sb.itk.*` is `et`. Read only through lib/cor.ts, never parsed at a call site.
  tag text not null,
  normering text not null check (normering in ('N', 'K', 'U')),
  -- The primary key leads with `form`, so it is also the index every lookup uses; a separate
  -- index on `form` would only be a second copy of the same prefix.
  primary key (form, lemma, tag)
);

comment on table public.cor_form is
  'Det Centrale Ordregister v1.5.1.0 (CC0-1.0), normering N only: inflected form -> lemma + grammatical tag. Reference data, identical for every account, so it carries no user_id and is read-only to the app. A bare form lookup is ambiguous for 35% of forms — `ved` is both "knows" and the noun "wood" — so callers must filter candidates by the sense''s part of speech before reading gender. lib/cor.ts is the only place that knows the tag format.';

alter table public.cor_form enable row level security;

-- Reference data: readable by any signed-in session, writable by nobody through the API. The
-- import runs with the service role, which bypasses RLS.
revoke all on public.cor_form from anon;
grant select on public.cor_form to authenticated;

create policy "signed-in sessions read the word register" on public.cor_form for select to authenticated
  using (true);
