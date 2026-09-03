alter table public.review_logs add column if not exists previous_card jsonb;
alter table public.review_logs add column if not exists answer_text text;

drop policy if exists "owner updates logs" on public.review_logs;
create policy "owner updates logs" on public.review_logs
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant update on public.review_logs to authenticated;
