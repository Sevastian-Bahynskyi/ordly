-- Repair the pronunciations that mix Latin letters into Cyrillic (issue #5 §2).
--
-- 13% of the sampled values carried a homoglyph nobody could see: `фоклaa` with a Latin `a`
-- (U+0061), `хoнклэл` with a Latin `o` (U+006F), `áф-хаенге` with a Latin `á` (U+00E1). They read
-- as words on screen and break search, sort and every comparison. `lib/pronunciation.ts` now
-- refuses such a value on write and treats a cached one as a miss, so this is the one-off cleanup
-- of what was written before that check existed.
--
-- Two passes, in this order, both deterministic and neither of them calling a model:
--
-- 1. Where `pronunciation_cache` already holds a clean reading for the same word, take it. That
--    is the pipeline's own current answer; the entry is carrying a stale, corrupted copy.
-- 2. Whatever is left has no cached reading at all, so the homoglyph is replaced by the Cyrillic
--    letter it was imitating and nothing else about the value is touched.
--
-- `[a-zA-Zà-ÿÀ-ß]` is Postgres's approximation of the app's `\p{Script=Latin}`: it covers every
-- character that actually appears in these rows (`a`, `o`, `á`). The app's check is the strict
-- one, and it is what keeps new values clean; this file only had to clean up the known rows, and
-- it raises rather than finishing quietly if anything is left over.

update public.vocabulary_entries v
set pronunciation = (
  select c.pronunciation
  from public.pronunciation_cache c
  where c.normalized_text = lower(trim(v.danish))
    and c.pronunciation !~ '[a-zA-Zà-ÿÀ-ß]'
  order by c.pipeline_version desc, c.updated_at desc
  limit 1
)
where v.pronunciation ~ '[a-zA-Zà-ÿÀ-ß]'
  and exists (
    select 1
    from public.pronunciation_cache c
    where c.normalized_text = lower(trim(v.danish))
      and c.pronunciation !~ '[a-zA-Zà-ÿÀ-ß]'
  );

update public.vocabulary_entries
set pronunciation = translate(replace(pronunciation, 'á', 'а́'), 'aoe', 'аое')
where pronunciation ~ '[a-zA-Zà-ÿÀ-ß]';

-- Nothing may survive both passes: the app would now reject any of it on write.
do $$
begin
  if exists (select 1 from public.vocabulary_entries where pronunciation ~ '[a-zA-Zà-ÿÀ-ß]') then
    raise exception 'a pronunciation still mixes Latin letters into Cyrillic';
  end if;
end $$;
