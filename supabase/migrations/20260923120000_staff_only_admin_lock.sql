-- Staff lock. Admin reads and writes require a staff_users role of staff or master.
-- Do not insert michael@smemarketer.com. That account is a member only.
-- Master remains michael@nammco.com.
--
-- staff_users_claim_first allowed INSERT when the caller could not see any
-- existing row. Own-row SELECT hides other staff, so NOT EXISTS was true for
-- every new session and any member could promote themselves. Drop it.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users s
    where s.user_id = auth.uid()
      and s.role in ('staff', 'master')
  );
$$;

revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated, service_role;

create or replace function private.block_staff_users_api_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.block_staff_users_api_write() from public, anon, authenticated;

drop trigger if exists staff_users_block_api_write on public.staff_users;
create trigger staff_users_block_api_write
  before insert or update or delete on public.staff_users
  for each row execute function private.block_staff_users_api_write();

drop policy if exists staff_users_claim_first on public.staff_users;

revoke insert, update, delete, truncate on table public.staff_users from anon, authenticated;

alter table public.staff_users enable row level security;
alter table public.staff_users force row level security;

drop policy if exists applications_select_staff on public.applications;
create policy applications_select_staff on public.applications
  for select to authenticated
  using (private.is_staff());

drop policy if exists email_events_select_staff on public.email_events;
create policy email_events_select_staff on public.email_events
  for select to authenticated
  using (private.is_staff());

drop policy if exists member_invites_select_staff on public.member_invites;
create policy member_invites_select_staff on public.member_invites
  for select to authenticated
  using (private.is_staff());

drop policy if exists members_select_staff on public.members;
create policy members_select_staff on public.members
  for select to authenticated
  using (private.is_staff());

drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (private.is_staff());

create or replace function private.founding_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    if auth.uid() is null
       or (
         not exists (
           select 1 from public.members m
           where m.user_id = auth.uid()
             and m.status in ('invited', 'active')
         )
         and not private.is_staff()
       ) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  end if;

  return (
    select jsonb_build_object(
      'ksa', count(*) filter (where seat = 'ksa' and status in ('invited', 'active')),
      'intl', count(*) filter (where seat = 'intl' and status in ('invited', 'active')),
      'ksa_cap', 50,
      'intl_cap', 50,
      'total_cap', 100
    )
    from public.members
  );
end;
$$;

revoke all on function private.founding_counts() from public, anon;
grant execute on function private.founding_counts() to authenticated, service_role;

create or replace function public.founding_capacity()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) and not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return private.founding_counts();
end;
$$;

revoke all on function public.founding_capacity() from public, anon;
grant execute on function public.founding_capacity() to authenticated;

create or replace function public.list_staff_directory()
returns table (email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
  select s.email, s.role, s.created_at
  from public.staff_users s
  order by s.created_at asc;
end;
$$;

revoke all on function public.list_staff_directory() from public, anon;
grant execute on function public.list_staff_directory() to authenticated;

create or replace function public.staff_set_member_capacity(
  p_user_id uuid,
  p_investable_capacity_usd numeric,
  p_fo_aum_usd numeric,
  p_turnover_usd numeric,
  p_include_in_public_aggregates boolean,
  p_capacity_verified boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1 from public.members m where m.user_id = p_user_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set
    investable_capacity_usd = private.assert_capacity_amount(p_investable_capacity_usd),
    fo_aum_usd = private.assert_capacity_amount(p_fo_aum_usd),
    turnover_usd = private.assert_capacity_amount(p_turnover_usd),
    capacity_currency = 'USD',
    include_in_public_aggregates = coalesce(p_include_in_public_aggregates, true),
    capacity_verified = coalesce(p_capacity_verified, false)
  where user_id = p_user_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.staff_set_member_capacity(uuid, numeric, numeric, numeric, boolean, boolean)
  from public, anon;
grant execute on function public.staff_set_member_capacity(uuid, numeric, numeric, numeric, boolean, boolean)
  to authenticated;
