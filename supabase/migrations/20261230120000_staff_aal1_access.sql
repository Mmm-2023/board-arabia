-- Staff and admin sign-in no longer requires a second factor.
-- Recreates six definers with only the aal2 condition removed.
-- search_path stays empty. Grants and revokes stay as they were.
-- Policies that call these functions follow the new bodies.
-- This file is not applied here. Do not run db push.

create or replace function private.is_staff()
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
      and s.role in ('staff', 'master')
  );
$$;

revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated, service_role;

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
  );
$$;

revoke all on function private.is_master() from public, anon;
grant execute on function private.is_master() to authenticated, service_role;

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
  );
$$;

revoke all on function private.is_owner() from public, anon;
grant execute on function private.is_owner() to authenticated, service_role;

comment on function private.is_owner() is
  'True when the caller is staff role master.';

create or replace function private.actor_is_staff(p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_users s
    where s.user_id = p_actor
      and s.role in ('staff', 'master')
  )
  and coalesce(auth.role(), '') = 'service_role';
$$;

revoke all on function private.actor_is_staff(uuid) from public, anon, authenticated;

create or replace function public.close_any_deal_room(p_actor uuid, p_aal text, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_room public.rooms%rowtype;
begin
  perform private.assert_service_role();
  if p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.actor_is_staff(p_actor) then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  select * into found_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if found_room.status is distinct from 'open' then
    raise exception 'not_open' using errcode = '23514';
  end if;

  update public.rooms
  set status = 'closed',
      closed_at = coalesce(closed_at, pg_catalog.now())
  where id = found_room.id
    and status = 'open';

  perform private.revoke_room_document_access(found_room.id);

  return pg_catalog.jsonb_build_object('ok', true, 'room_id', found_room.id, 'status', 'closed');
end;
$$;

revoke all on function public.close_any_deal_room(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.close_any_deal_room(uuid, text, uuid) to service_role;

create or replace function public.list_all_deal_rooms(p_actor uuid, p_aal text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  if p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.actor_is_staff(p_actor) then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'rooms', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'opened_by', r.opened_by,
          'status', r.status,
          'name', r.name,
          'purpose', r.purpose,
          'owner_member_id', r.owner_member_id,
          'mandate_id', r.mandate_id,
          're_opportunity_id', r.re_opportunity_id,
          'created_at', r.created_at,
          'document_count', (
            select count(*)::integer
            from public.room_documents d
            where d.room_id = r.id
              and d.deleted_at is null
          ),
          'participants', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'member_id', p.member_id,
                'role', p.role,
                'invite_status', p.invite_status
              )
              order by p.created_at
            )
            from public.room_participants p
            where p.room_id = r.id
          ), '[]'::jsonb)
        )
        order by r.created_at desc, r.name
      )
      from public.rooms r
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_all_deal_rooms(uuid, text) from public, anon, authenticated;
grant execute on function public.list_all_deal_rooms(uuid, text) to service_role;
