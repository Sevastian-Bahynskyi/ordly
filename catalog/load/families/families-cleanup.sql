-- run after every chunk; expected = sum of "families" reported by the chunks
with loaded as (
  select count(*) as n from public.catalog_sentence_family where source ->> 'snapshot' = 'e5c2ac5e223047a6'
),
removed as (
  delete from public.catalog_sentence_family
  where source ->> 'snapshot' is distinct from 'e5c2ac5e223047a6' and (select n from loaded) = 289
  returning 1
)
select (select n from loaded) as loaded, case when (select n from loaded) = 289 then (select count(*) from removed) else -1 end as removed;
