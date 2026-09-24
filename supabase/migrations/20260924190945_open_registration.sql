-- Ordly accepts any number of learners. Every personal table is owner-scoped by RLS, so a new
-- account only needs its own profile; the first-account lock is removed.
create or replace function private.create_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth, private
as $$
begin
  insert into public.profiles(id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_ordly on auth.users;
create trigger on_auth_user_created_ordly
after insert on auth.users
for each row execute function private.create_profile();

drop function if exists private.claim_first_account();
