-- Master staff role, staff read paths for admin, and a guard against demoting the root master.

alter table public.staff_users
  add column if not exists role text not null default 'staff';

alter table public.staff_users drop constraint if exists staff_users_role_check;
alter table public.staff_users
  add constraint staff_users_role_check check (role in ('staff', 'master'));

create or replace function private.protect_master_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_masters int;
begin
  if tg_op = 'DELETE' then
    if lower(old.email) = 'michael@nammco.com' then
      raise exception 'cannot_demote_master' using errcode = '42501';
    end if;
    if old.role = 'master' then
      select count(*) into other_masters
      from public.staff_users
      where role = 'master' and user_id <> old.user_id;
      if other_masters = 0 then
        raise exception 'cannot_demote_master' using errcode = '42501';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'master' and new.role is distinct from 'master' then
    if lower(old.email) = 'michael@nammco.com' then
      raise exception 'cannot_demote_master' using errcode = '42501';
    end if;
    select count(*) into other_masters
    from public.staff_users
    where role = 'master' and user_id <> old.user_id;
    if other_masters = 0 then
      raise exception 'cannot_demote_master' using errcode = '42501';
    end if;
  end if;

  if lower(old.email) = 'michael@nammco.com'
     and lower(new.email) is distinct from 'michael@nammco.com' then
    raise exception 'cannot_demote_master' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_master_staff() from public, anon, authenticated;
grant execute on function private.protect_master_staff() to service_role;

drop trigger if exists staff_users_protect_master on public.staff_users;
create trigger staff_users_protect_master
  before update or delete on public.staff_users
  for each row execute function private.protect_master_staff();

drop policy if exists members_select_staff on public.members;
create policy members_select_staff on public.members
  for select to authenticated
  using (exists (select 1 from public.staff_users s where s.user_id = auth.uid()));

revoke all on table public.email_events from anon, authenticated;
grant select (id, created_at, kind, recipient, subject, status)
  on table public.email_events to authenticated;

drop policy if exists email_events_select_staff on public.email_events;
create policy email_events_select_staff on public.email_events
  for select to authenticated
  using (exists (select 1 from public.staff_users s where s.user_id = auth.uid()));

create or replace function public.list_staff_directory()
returns table (email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_users s where s.user_id = auth.uid()
  ) then
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
