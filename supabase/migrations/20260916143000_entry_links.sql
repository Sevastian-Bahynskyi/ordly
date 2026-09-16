-- Meaning model, step 4: synonym edges between saved entries.
-- See docs/meaning-model-plan.md §3.3 and decisions D4, D12, D17.
--
-- Edges only ever join two entries the same person owns. Symmetric kinds are stored once,
-- in canonical (a_id < b_id) order, so "svært <-> besværligt" cannot exist twice with the
-- ends swapped. `inflection_of` is the one directional kind and is exempt from that check:
-- a_id is the inflected form, b_id the base form.

create table public.entry_links (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  a_id uuid not null references public.vocabulary_entries(id) on delete cascade,
  b_id uuid not null references public.vocabulary_entries(id) on delete cascade,
  kind text not null check (kind in ('synonym','antonym','related','inflection_of')),
  source text not null check (source in ('ai','user')),
  confidence real check (confidence between 0 and 1),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (a_id, b_id, kind),
  check (a_id <> b_id),
  -- symmetric kinds are stored once, in canonical order;
  -- inflection_of is directional: a_id is the inflected form, b_id the base
  check (kind = 'inflection_of' or a_id < b_id)
);

comment on table public.entry_links is
  'Typed edges between two vocabulary entries of the same owner. Deletion of either entry cascades (D17). `confirmed` separates an edge the learner has accepted from one discovery merely proposed: unconfirmed edges may be shown as dismissible chips but must never be used to generate practice distractors.';

comment on column public.entry_links.confirmed is
  'False until the learner accepts the edge, or again after a material edit to either entry demoted it (D17). Practice distractor selection must filter on this.';

create index entry_links_user_a_idx on public.entry_links(user_id, a_id);
create index entry_links_user_b_idx on public.entry_links(user_id, b_id);

alter table public.entry_links enable row level security;
revoke all on public.entry_links from anon;
grant select, insert, update, delete on public.entry_links to authenticated;

create policy "owner reads entry links" on public.entry_links for select to authenticated
  using ((select auth.uid()) = user_id);

-- The one cross-row ownership check in this design. `user_id = auth.uid()` alone would let a
-- row point at somebody else's entry: the writer chooses a_id/b_id freely, and nothing else in
-- the schema ties them to the owner. Both ends are verified against vocabulary_entries, which
-- is itself owner-scoped, so an edge can never straddle two accounts.
create policy "owner inserts entry links" on public.entry_links for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.vocabulary_entries v where v.id = a_id and v.user_id = (select auth.uid()))
    and exists (select 1 from public.vocabulary_entries v where v.id = b_id and v.user_id = (select auth.uid()))
  );

-- Confirming or dismissing a chip updates this row, and a_id/b_id are part of the primary key,
-- so the same both-ends check has to hold after the update too.
create policy "owner updates entry links" on public.entry_links for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.vocabulary_entries v where v.id = a_id and v.user_id = (select auth.uid()))
    and exists (select 1 from public.vocabulary_entries v where v.id = b_id and v.user_id = (select auth.uid()))
  );

create policy "owner deletes entry links" on public.entry_links for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Comparison key for "is this the same Danish text". Mirrors the normalization in
-- lib/answer.ts: case, surrounding/inner whitespace and punctuation are cosmetic; anything else
-- is a different word and the edges that were inferred from the old one are no longer evidence.
create or replace function private.normalized_danish(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           -- `[` and `]` are backslash-escaped: in a Postgres bracket expression a literal `[`
           -- followed by `.` would start a collating element and the pattern would not compile.
           regexp_replace(lower(btrim(coalesce(value, ''))), '[.,!?;:"''()\[\]{}]', '', 'g'),
           '\s+', ' ', 'g')
$$;
revoke all on function private.normalized_danish(text) from public, anon, authenticated;

-- D17 demotion. Deleting an entry is already handled by the FK cascade above; this covers the
-- other half: a material edit to the Danish text invalidates what the AI inferred from it.
-- Only `source = 'ai'` edges are demoted. A `source = 'user'` edge is the learner's own
-- judgement about the pair and survives an edit untouched.
create or replace function private.demote_entry_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The "is this edit material" test lives in here rather than in the trigger's WHEN clause on
  -- purpose. A WHEN clause is evaluated as the *invoking* role, and private.normalized_danish is
  -- revoked from `authenticated`, so calling it from there would make every edit the app makes
  -- fail with "permission denied for function normalized_danish". Inside a SECURITY DEFINER body
  -- the call runs as the owner, so the helper can stay private.
  if private.normalized_danish(old.danish) is not distinct from private.normalized_danish(new.danish) then
    return null;
  end if;

  update public.entry_links
  set confirmed = false
  where source = 'ai'
    and confirmed
    and user_id = new.user_id
    and (a_id = new.id or b_id = new.id);
  return null;
end;
$$;
revoke all on function private.demote_entry_links() from public, anon, authenticated;

-- AFTER UPDATE OF danish, so it cannot interfere with the BEFORE trigger vocabulary_sync_senses
-- (step 2) that rewrites NEW.senses / NEW.translation in place. `of danish` keeps it off every
-- other write; the function itself then decides whether the edit was material.
create trigger vocabulary_demote_entry_links
after update of danish on public.vocabulary_entries
for each row
execute function private.demote_entry_links();
