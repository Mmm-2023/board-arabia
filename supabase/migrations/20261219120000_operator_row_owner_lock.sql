-- OP-1. Clear the live AI report operator row and close the owner demote race.
-- The entity becomes Board Arabia. The registration field is cleared to empty.
-- staff_set_role and staff_remove lock owner rows before the last-owner count.
-- Search path stays empty. Functions stay security definer.
-- Grants stay as they are: anon has no execute. Staff checks use private.is_staff().
-- Row level security on the operator table stays forced.
-- This file is not applied here. Do not run db push. No Edge deploy.

alter table public.ai_report_operator
  drop constraint if exists ai_report_operator_cr_not_blank;

update public.ai_report_operator
set entity = 'Board Arabia',
    cr = ''
where id = 1;

do $check$
begin
  if (
    select count(*)
    from public.ai_report_operator
    where id = 1
      and entity = 'Board Arabia'
      and cr = ''
  ) <> 1 then
    raise exception 'operator_row_not_cleared';
  end if;
end
$check$;

alter table public.ai_report_operator force row level security;

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
  v_lock uuid;
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
    for v_lock in
      select s.user_id
      from public.staff_users s
      where s.role = 'master'
      order by s.user_id
      for update
    loop
      null;
    end loop;
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
  'Owner sets an existing staff role to staff or master. The last owner and the pinned owner stay. Owner rows are locked before the last-owner count.';

create or replace function public.staff_remove(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text;
  v_others integer;
  v_lock uuid;
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
    for v_lock in
      select s.user_id
      from public.staff_users s
      where s.role = 'master'
      order by s.user_id
      for update
    loop
      null;
    end loop;
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
  'Owner removes a staff row. Does not change members. The last owner and the pinned owner stay. Owner rows are locked before the last-owner count.';
