-- Owner gate for staff. Only an owner can add, change, or remove staff.
-- private.is_owner() is the master role at aal2, the same bar as private.is_master().
-- The product calls that role Owner. The stored role value stays master.
-- Last owner cannot be demoted or removed. The pinned root owner stays in place.
-- Writes are logged. Members are not changed.
-- This file is not applied here. Do not run db push.

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_users s
    where s.user_id = auth.uid()
      and s.role = 'master'
  )
  and (auth.jwt() ->> 'aal') = 'aal2';
$$;

revoke all on function private.is_owner() from public, anon;
grant execute on function private.is_owner() to authenticated, service_role;

comment on function private.is_owner() is
  'True when the caller is staff role master and the session is aal2.';

-- Authenticated sessions cannot write staff_users directly.
-- Owner RPCs set ba.staff_role_write for the statement that follows the owner check.
-- Table grants stay revoked, so a session cannot write the table itself.

create or replace function private.block_staff_users_api_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and coalesce(pg_catalog.current_setting('ba.staff_role_write', true), '') is distinct from 'on' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.block_staff_users_api_write() from public, anon, authenticated;

create table public.staff_role_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_id uuid not null,
  action text not null,
  previous_role text,
  next_role text,
  created_at timestamptz not null default now(),
  constraint staff_role_log_action_check check (action in ('set_role', 'remove')),
  constraint staff_role_log_previous_role_check check (
    previous_role is null or previous_role in ('staff', 'master')
  ),
  constraint staff_role_log_next_role_check check (
    next_role is null or next_role in ('staff', 'master')
  )
);

alter table public.staff_role_log enable row level security;
alter table public.staff_role_log force row level security;

revoke all on table public.staff_role_log from public, anon, authenticated;

comment on table public.staff_role_log is
  'Owner changes to a staff role, and staff removals. No client access. No address.';

create or replace function public.staff_set_role(p_user uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text;
  v_role text;
  v_others integer;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not private.is_owner() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_role := pg_catalog.lower(pg_catalog.btrim(coalesce(p_role, '')));
  if v_role not in ('staff', 'master') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select s.role into v_prev
  from public.staff_users s
  where s.user_id = p_user;
  if v_prev is null or v_prev not in ('staff', 'master') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_prev = v_role then
    return pg_catalog.jsonb_build_object('ok', true, 'role', v_role);
  end if;

  if v_prev = 'master' and v_role is distinct from 'master' then
    if exists (select 1 from private.root_master r where r.user_id = p_user) then
      raise exception 'owner_stays' using errcode = '42501';
    end if;
    select count(*) into v_others
    from public.staff_users s
    where s.role = 'master' and s.user_id <> p_user;
    if v_others = 0 then
      raise exception 'last_owner' using errcode = '42501';
    end if;
  end if;

  begin
    perform pg_catalog.set_config('ba.staff_role_write', 'on', true);
    update public.staff_users
    set role = v_role
    where user_id = p_user;
    if not found then
      perform pg_catalog.set_config('ba.staff_role_write', '', true);
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    perform pg_catalog.set_config('ba.staff_role_write', '', true);
  exception
    when others then
      perform pg_catalog.set_config('ba.staff_role_write', '', true);
      raise;
  end;

  insert into public.staff_role_log (actor_id, target_id, action, previous_role, next_role)
  values (auth.uid(), p_user, 'set_role', v_prev, v_role);

  return pg_catalog.jsonb_build_object('ok', true, 'role', v_role);
end;
$$;

revoke all on function public.staff_set_role(uuid, text) from public, anon;
grant execute on function public.staff_set_role(uuid, text) to authenticated;

comment on function public.staff_set_role(uuid, text) is
  'Owner sets an existing staff role to staff or master. The last owner and the pinned owner stay.';

create or replace function public.staff_remove(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text;
  v_others integer;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not private.is_owner() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select s.role into v_prev
  from public.staff_users s
  where s.user_id = p_user;
  if v_prev is null or v_prev not in ('staff', 'master') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from private.root_master r where r.user_id = p_user) then
    raise exception 'owner_stays' using errcode = '42501';
  end if;
  if v_prev = 'master' then
    select count(*) into v_others
    from public.staff_users s
    where s.role = 'master' and s.user_id <> p_user;
    if v_others = 0 then
      raise exception 'last_owner' using errcode = '42501';
    end if;
  end if;

  begin
    perform pg_catalog.set_config('ba.staff_role_write', 'on', true);
    delete from public.staff_users
    where user_id = p_user;
    if not found then
      perform pg_catalog.set_config('ba.staff_role_write', '', true);
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    perform pg_catalog.set_config('ba.staff_role_write', '', true);
  exception
    when others then
      perform pg_catalog.set_config('ba.staff_role_write', '', true);
      raise;
  end;

  insert into public.staff_role_log (actor_id, target_id, action, previous_role, next_role)
  values (auth.uid(), p_user, 'remove', v_prev, null);

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_remove(uuid) from public, anon;
grant execute on function public.staff_remove(uuid) to authenticated;

comment on function public.staff_remove(uuid) is
  'Owner removes a staff row. Does not change members. The last owner and the pinned owner stay.';

drop function if exists public.list_staff_directory();

create or replace function public.list_staff_directory()
returns table (
  email text,
  role text,
  created_at timestamptz,
  user_id uuid,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
  select
    s.email,
    s.role,
    s.created_at,
    s.user_id,
    case
      when d.display_name is null then null
      when position('@' in btrim(d.display_name)) > 0 then null
      else nullif(btrim(d.display_name), '')
    end
  from public.staff_users s
  left join public.staff_display_names d on d.user_id = s.user_id
  order by s.created_at asc;
end;
$$;

revoke all on function public.list_staff_directory() from public, anon;
grant execute on function public.list_staff_directory() to authenticated;

comment on function public.list_staff_directory() is
  'aal2 staff list. Includes the user id and display name used by the staff section.';
