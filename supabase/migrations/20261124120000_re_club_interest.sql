-- RE9 club interest to a Deal Room.
-- One row per member per opportunity. A repeat insert does nothing.
-- The first insert calls private.note_re_intro_admin_alert. That marker sends no mail.
-- The request-re-intro Edge function sends the admin alert on that first insert only.
-- Staff list the set and create or link a member deal room.
-- Interest does not open a message thread. Names stay off the member card.
-- Invites use room_participants with invite_status invited, the same gate as live deal rooms.
-- This file does not send invite mail. deal-room-invite still does that, and it does not wait.
-- Apply on the live project later. This change does not apply the migration and does not deploy.
-- Edge redeploy: request-re-intro (new interest target). No new Edge function.
--
-- Order: after 20261123120000_re_board_roles.sql.

create table if not exists public.re_club_interest (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.re_opportunities (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint re_club_interest_once unique (opportunity_id, member_id)
);

create index if not exists re_club_interest_member_idx
  on public.re_club_interest (member_id);

create table if not exists public.re_club_rooms (
  opportunity_id uuid primary key references public.re_opportunities (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  linked_by uuid,
  linked_at timestamptz not null default now()
);

alter table public.re_club_interest enable row level security;
alter table public.re_club_interest force row level security;
revoke all on table public.re_club_interest from public, anon, authenticated;

alter table public.re_club_rooms enable row level security;
alter table public.re_club_rooms force row level security;
revoke all on table public.re_club_rooms from public, anon, authenticated;

grant select, insert, update, delete on table public.re_club_interest to service_role;
grant select, insert, update, delete on table public.re_club_rooms to service_role;

create or replace function private.assert_re_club_member()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.seat in ('ksa', 'intl')
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_re_club_member() from public, anon, authenticated;

create or replace function private.place_re_club_invites(
  p_room_id uuid,
  p_opportunity_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  invitee uuid;
  existing public.room_participants%rowtype;
  saw_row boolean;
  taken int;
  added int := 0;
begin
  for invitee in
    select c.member_id
    from public.re_club_interest c
    join public.members m on m.user_id = c.member_id
    where c.opportunity_id = p_opportunity_id
      and m.status = 'active'
      and m.seat in ('ksa', 'intl')
    order by c.created_at
  loop
    select * into existing
    from public.room_participants
    where room_id = p_room_id
      and member_id = invitee;
    saw_row := found;

    if saw_row and (existing.role = 'owner' or existing.invite_status in ('invited', 'accepted')) then
      continue;
    end if;

    select count(*)::int into taken
    from public.room_participants
    where room_id = p_room_id
      and invite_status in ('invited', 'accepted');
    if taken >= 50 then
      raise exception 'room_full' using errcode = '23514';
    end if;

    if saw_row then
      update public.room_participants
      set role = 'member',
          invite_status = 'invited',
          invited_at = now(),
          accepted_at = null,
          declined_at = null,
          removed_at = null,
          updated_at = now()
      where id = existing.id;
    else
      insert into public.room_participants (
        room_id, member_id, role, invite_status, invited_at
      ) values (
        p_room_id, invitee, 'member', 'invited', now()
      );
    end if;
    added := added + 1;
  end loop;

  return added;
end;
$$;

revoke all on function private.place_re_club_invites(uuid, uuid) from public, anon, authenticated;

create or replace function public.express_re_club_interest(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_flag boolean;
  new_id uuid;
begin
  perform private.assert_re_club_member();

  select o.is_demo into demo_flag
  from public.re_opportunities o
  where o.id = p_opportunity_id
    and o.published
    and (
      o.is_demo = false
      or private.demo_rows_visible(
        're_opportunities',
        (
          select count(*)::int
          from public.re_opportunities live
          where live.is_demo = false
            and live.published = true
        )
      )
    );

  if demo_flag is null or demo_flag then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.re_club_interest (opportunity_id, member_id)
  values (p_opportunity_id, auth.uid())
  on conflict (opportunity_id, member_id) do nothing
  returning id into new_id;

  if new_id is not null then
    perform private.note_re_intro_admin_alert(new_id);
  end if;

  return jsonb_build_object('status', 'recorded', 'fresh', new_id is not null);
end;
$$;

revoke all on function public.express_re_club_interest(uuid) from public, anon;
grant execute on function public.express_re_club_interest(uuid) to authenticated;

create or replace function public.my_re_club_interest()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.assert_re_club_member();

  return coalesce((
    select jsonb_agg(c.opportunity_id order by c.created_at)
    from public.re_club_interest c
    where c.member_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_re_club_interest() from public, anon;
grant execute on function public.my_re_club_interest() to authenticated;

create or replace function public.staff_list_re_club_interest()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(listed.row_json order by listed.latest desc)
    from (
      select
        max(c.created_at) as latest,
        jsonb_build_object(
          'opportunity_id', o.id,
          'sector', o.sector,
          'city', o.city,
          'asset_class', o.asset_class,
          'one_liner', o.one_liner,
          'room_id', r.id,
          'room_name', r.name,
          'room_status', r.status,
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'member_id', c2.member_id,
                'member_name', left(coalesce(nullif(trim(p.full_name), ''), 'Member'), 200)
              )
              order by c2.created_at
            )
            from public.re_club_interest c2
            left join public.profiles p on p.user_id = c2.member_id
            where c2.opportunity_id = o.id
          ), '[]'::jsonb)
        ) as row_json
      from public.re_club_interest c
      join public.re_opportunities o on o.id = c.opportunity_id
      left join public.re_club_rooms link on link.opportunity_id = o.id
      left join public.rooms r on r.id = link.room_id
      where o.is_demo = false
      group by o.id, o.sector, o.city, o.asset_class, o.one_liner, r.id, r.name, r.status
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_re_club_interest() from public, anon;
grant execute on function public.staff_list_re_club_interest() to authenticated;

create or replace function private.re_club_live_opportunity(p_opportunity_id uuid)
returns public.re_opportunities
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found_row public.re_opportunities%rowtype;
begin
  select * into found_row
  from public.re_opportunities
  where id = p_opportunity_id
    and is_demo = false;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.re_club_interest c
    where c.opportunity_id = p_opportunity_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return found_row;
end;
$$;

revoke all on function private.re_club_live_opportunity(uuid) from public, anon, authenticated;

create or replace function public.staff_open_re_club_room(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  opp public.re_opportunities%rowtype;
  linked uuid;
  owner_id uuid;
  host_name text;
  room_name text;
  room_purpose text;
  new_id uuid;
  linked_room public.rooms%rowtype;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  opp := private.re_club_live_opportunity(p_opportunity_id);

  select link.room_id into linked
  from public.re_club_rooms link
  where link.opportunity_id = p_opportunity_id;

  if linked is not null then
    select * into linked_room from public.rooms where id = linked;
    if not found or linked_room.status is distinct from 'open' or linked_room.is_demo then
      raise exception 'room_closed' using errcode = '23514';
    end if;
    perform private.place_re_club_invites(linked, p_opportunity_id);
    perform private.sync_deal_room_count(linked);
    return jsonb_build_object(
      'ok', true,
      'room_id', linked,
      'room_name', linked_room.name,
      'created', false
    );
  end if;

  select c.member_id into owner_id
  from public.re_club_interest c
  join public.members m on m.user_id = c.member_id
  where c.opportunity_id = p_opportunity_id
    and m.status = 'active'
    and m.seat in ('ksa', 'intl')
  order by c.created_at
  limit 1;

  if owner_id is null then
    raise exception 'no_active_member' using errcode = '22023';
  end if;

  select left(coalesce(private.clean_room_line(full_name), 'Member'), 200)
  into host_name
  from public.profiles
  where user_id = owner_id;
  if host_name is null or host_name = '' then
    host_name := 'Member';
  end if;

  room_purpose := 'Club co-invest. The desk opened this room for members who expressed interest. It is not a message thread.';
  room_name := private.clean_room_line(left('Co-invest, ' || opp.sector || ', ' || opp.city, 160));
  if room_name is null then
    room_name := 'Co-invest club';
  end if;

  insert into public.rooms (
    is_demo,
    status,
    name,
    summary,
    sector,
    stage,
    member_count,
    host_name,
    mandate_id,
    re_opportunity_id,
    purpose,
    owner_member_id,
    opened_by
  ) values (
    false,
    'open',
    room_name,
    room_purpose,
    left(opp.sector, 120),
    'Open',
    1,
    host_name,
    null,
    opp.id,
    room_purpose,
    owner_id,
    'member'
  )
  returning id into new_id;

  insert into public.room_participants (
    room_id, member_id, role, invite_status, invited_at, accepted_at
  ) values (
    new_id, owner_id, 'owner', 'accepted', now(), now()
  );

  insert into public.re_club_rooms (opportunity_id, room_id, linked_by)
  values (p_opportunity_id, new_id, auth.uid());

  perform private.place_re_club_invites(new_id, p_opportunity_id);
  perform private.sync_deal_room_count(new_id);

  return jsonb_build_object(
    'ok', true,
    'room_id', new_id,
    'room_name', room_name,
    'created', true
  );
end;
$$;

revoke all on function public.staff_open_re_club_room(uuid) from public, anon;
grant execute on function public.staff_open_re_club_room(uuid) to authenticated;

create or replace function public.staff_link_re_club_room(
  p_opportunity_id uuid,
  p_room_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  opp public.re_opportunities%rowtype;
  found_room public.rooms%rowtype;
  linked uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  opp := private.re_club_live_opportunity(p_opportunity_id);

  select link.room_id into linked
  from public.re_club_rooms link
  where link.opportunity_id = p_opportunity_id;
  if linked is not null and linked is distinct from p_room_id then
    raise exception 'already_linked' using errcode = '23505';
  end if;

  select * into found_room from public.rooms where id = p_room_id;
  if not found
     or found_room.opened_by is distinct from 'member'
     or found_room.owner_member_id is null
     or found_room.is_demo then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if found_room.status is distinct from 'open' then
    raise exception 'room_closed' using errcode = '23514';
  end if;
  if found_room.mandate_id is not null
     or (
       found_room.re_opportunity_id is not null
       and found_room.re_opportunity_id is distinct from opp.id
     ) then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;

  if found_room.re_opportunity_id is null then
    update public.rooms
    set re_opportunity_id = opp.id
    where id = found_room.id
      and re_opportunity_id is null
      and mandate_id is null;
  end if;

  if linked is null then
    insert into public.re_club_rooms (opportunity_id, room_id, linked_by)
    values (p_opportunity_id, found_room.id, auth.uid());
  end if;

  perform private.place_re_club_invites(found_room.id, p_opportunity_id);
  perform private.sync_deal_room_count(found_room.id);

  return jsonb_build_object(
    'ok', true,
    'room_id', found_room.id,
    'room_name', found_room.name,
    'created', false
  );
end;
$$;

revoke all on function public.staff_link_re_club_room(uuid, uuid) from public, anon;
grant execute on function public.staff_link_re_club_room(uuid, uuid) to authenticated;
