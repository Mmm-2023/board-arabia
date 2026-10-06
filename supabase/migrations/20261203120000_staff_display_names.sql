-- Staff display names for the access log.
-- Staff accounts have no member row and no profile row. Do not create either.
-- This file does not alter public.staff_users or the master guard trigger.
-- Clients have no table grant. aal2 staff read and write only auth.uid() through the RPCs.
-- Apply after Security 4. Independent of 20261202120000.

create table public.staff_display_names (
  user_id uuid primary key references public.staff_users (user_id) on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now(),
  constraint staff_display_names_name_len check (char_length(btrim(display_name)) between 1 and 80),
  constraint staff_display_names_no_at check (position('@' in display_name) = 0)
);

alter table public.staff_display_names enable row level security;
alter table public.staff_display_names force row level security;

revoke all on table public.staff_display_names from public, anon, authenticated;

comment on table public.staff_display_names is
  'Name a staff member sets for the access log. One row per staff user. No client access.';

create or replace function public.staff_get_own_display_name()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select case
    when position('@' in btrim(d.display_name)) > 0 then null
    else nullif(btrim(d.display_name), '')
  end
    into v_name
  from public.staff_display_names d
  where d.user_id = auth.uid();
  return v_name;
end;
$$;

revoke all on function public.staff_get_own_display_name() from public, anon;
grant execute on function public.staff_get_own_display_name() to authenticated;

create or replace function public.staff_set_own_display_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1
     or char_length(v_name) > 80
     or position('@' in coalesce(p_name, '')) > 0
     or position('@' in v_name) > 0 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  insert into public.staff_display_names (user_id, display_name, updated_at)
  values (auth.uid(), v_name, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = excluded.updated_at;
  return v_name;
end;
$$;

revoke all on function public.staff_set_own_display_name(text) from public, anon;
grant execute on function public.staff_set_own_display_name(text) to authenticated;

create or replace function public.staff_list_access_log(p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_member_id is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'object_type', l.object_type,
      'object_id', l.object_id,
      'action', l.action,
      'at', l.created_at,
      'actor_name', coalesce(
        case
          when d.display_name is null then null
          when position('@' in btrim(d.display_name)) > 0 then null
          else nullif(btrim(d.display_name), '')
        end,
        case
          when p.full_name is null then null
          when position('@' in btrim(p.full_name)) > 0 then null
          else nullif(btrim(p.full_name), '')
        end
      ),
      'actor_role', case s.role
        when 'master' then 'Master'
        when 'staff' then 'Admin'
        else null
      end
    ) order by l.created_at desc)
    from (
      select id, staff_user_id, object_type, object_id, action, created_at
      from public.staff_access_log
      where member_id = p_member_id
      order by created_at desc
      limit 200
    ) l
    left join public.staff_users s on s.user_id = l.staff_user_id
    left join public.staff_display_names d on d.user_id = l.staff_user_id
    left join public.profiles p on p.user_id = l.staff_user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_access_log(uuid) from public, anon;
grant execute on function public.staff_list_access_log(uuid) to authenticated;
