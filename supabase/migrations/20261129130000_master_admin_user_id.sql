-- Master admin guard uses the staff row, not an address.
-- When exactly one staff_users row has role master, that user id is copied here.
-- No address and no user id is written in this file. Safe to run again.
-- private.is_master() requires aal2, the same bar as private.is_staff().

create table if not exists private.root_master (
  user_id uuid primary key
);

alter table private.root_master enable row level security;
alter table private.root_master force row level security;

revoke all on table private.root_master from public, anon, authenticated;

insert into private.root_master (user_id)
select s.user_id
from public.staff_users s
where s.role = 'master'
  and (
    select count(*)::integer
    from public.staff_users counted
    where counted.role = 'master'
  ) = 1
on conflict (user_id) do nothing;

create or replace function private.is_master()
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

revoke all on function private.is_master() from public, anon;
grant execute on function private.is_master() to authenticated, service_role;

create or replace function private.protect_master_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_masters integer;
  root boolean;
begin
  root := exists (
    select 1
    from private.root_master r
    where r.user_id = old.user_id
  );

  if tg_op = 'DELETE' then
    if root then
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
    if root then
      raise exception 'cannot_demote_master' using errcode = '42501';
    end if;
    select count(*) into other_masters
    from public.staff_users
    where role = 'master' and user_id <> old.user_id;
    if other_masters = 0 then
      raise exception 'cannot_demote_master' using errcode = '42501';
    end if;
  end if;

  if root and lower(new.email) is distinct from lower(old.email) then
    raise exception 'cannot_demote_master' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_master_staff() from public, anon, authenticated;
grant execute on function private.protect_master_staff() to service_role;
