-- Member-created deal rooms.
-- Admin rooms stay owner_member_id null and opened_by admin, so list_member_rooms
-- still returns the same open admin cards, including the demo threshold.
-- There is no member id on those rows, so the owner is not backfilled.
-- A room may link to a mandate or a real estate opportunity, and not to both.
-- A room and its participants are visible to participants (invited or accepted) and staff.
-- Anon has no grant. Writes go through service-role functions that check the actor.

alter table public.rooms drop constraint if exists rooms_status;
alter table public.rooms
  add constraint rooms_status check (status in ('open', 'closed', 'archived'));

alter table public.rooms
  add column if not exists owner_member_id uuid,
  add column if not exists purpose text,
  add column if not exists re_opportunity_id uuid,
  add column if not exists opened_by text;

update public.rooms
set opened_by = 'admin'
where opened_by is null;

alter table public.rooms
  alter column opened_by set default 'admin',
  alter column opened_by set not null,
  alter column id set default gen_random_uuid();

alter table public.rooms drop constraint if exists rooms_owner_member_fkey;
alter table public.rooms
  add constraint rooms_owner_member_fkey
  foreign key (owner_member_id) references public.members (user_id) on delete set null;

alter table public.rooms drop constraint if exists rooms_re_opportunity_fkey;
alter table public.rooms
  add constraint rooms_re_opportunity_fkey
  foreign key (re_opportunity_id) references public.re_opportunities (id) on delete set null;

alter table public.rooms drop constraint if exists rooms_opened_by;
alter table public.rooms
  add constraint rooms_opened_by check (opened_by in ('admin', 'member'));

alter table public.rooms drop constraint if exists rooms_purpose_len;
alter table public.rooms
  add constraint rooms_purpose_len check (
    purpose is null or char_length(purpose) between 1 and 400
  );

alter table public.rooms drop constraint if exists rooms_member_purpose;
alter table public.rooms
  add constraint rooms_member_purpose check (
    opened_by = 'admin' or purpose is not null
  );

alter table public.rooms drop constraint if exists rooms_one_subject;
alter table public.rooms
  add constraint rooms_one_subject check (
    mandate_id is null or re_opportunity_id is null
  );

create index if not exists rooms_owner_member_idx
  on public.rooms (owner_member_id);

create index if not exists rooms_re_opportunity_idx
  on public.rooms (re_opportunity_id);

create or replace function private.guard_room_opened_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.opened_by = 'member'
     and new.opened_by is distinct from 'member' then
    raise exception 'room_origin_locked' using errcode = '23514';
  end if;
  if new.opened_by = 'admin' and new.owner_member_id is not null then
    raise exception 'admin_room_has_owner' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_room_opened_by() from public, anon, authenticated;

drop trigger if exists rooms_guard_opened_by on public.rooms;
create trigger rooms_guard_opened_by
  before insert or update on public.rooms
  for each row execute function private.guard_room_opened_by();

create table if not exists public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  role text not null,
  invite_status text not null,
  invited_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_participants_role check (role in ('owner', 'member')),
  constraint room_participants_invite_status check (
    invite_status in ('invited', 'accepted', 'declined', 'removed')
  ),
  constraint room_participants_room_member unique (room_id, member_id),
  constraint room_participants_owner_accepted check (
    role <> 'owner' or invite_status = 'accepted'
  )
);

create unique index if not exists room_participants_one_owner
  on public.room_participants (room_id)
  where role = 'owner';

create index if not exists room_participants_member_idx
  on public.room_participants (member_id);

alter table public.rooms enable row level security;
alter table public.rooms force row level security;
alter table public.room_participants enable row level security;
alter table public.room_participants force row level security;

revoke all on table public.rooms from public, anon, authenticated;
revoke all on table public.room_participants from public, anon, authenticated;

grant select on table public.rooms to authenticated;
grant select on table public.room_participants to authenticated;
grant select, insert, update, delete on table public.rooms to service_role;
grant select, insert, update, delete on table public.room_participants to service_role;

create or replace function private.deal_room_visible(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_staff()
    or exists (
      select 1
      from public.room_participants rp
      where rp.room_id = p_room
        and rp.member_id = auth.uid()
        and rp.invite_status in ('invited', 'accepted')
    );
$$;

revoke all on function private.deal_room_visible(uuid) from public, anon;
grant execute on function private.deal_room_visible(uuid) to authenticated, service_role;

drop policy if exists rooms_select_participant_or_staff on public.rooms;
create policy rooms_select_participant_or_staff on public.rooms
  for select
  to authenticated
  using (private.deal_room_visible(id));

drop policy if exists room_participants_select_participant_or_staff on public.room_participants;
create policy room_participants_select_participant_or_staff on public.room_participants
  for select
  to authenticated
  using (private.deal_room_visible(room_id));

create or replace function private.actor_is_staff(p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users s
    where s.user_id = p_actor
      and s.role in ('staff', 'master')
  );
$$;

revoke all on function private.actor_is_staff(uuid) from public, anon, authenticated;

create or replace function private.assert_service_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_service_role() from public, anon, authenticated;

create or replace function private.active_member(p_actor uuid)
returns public.members
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found_row public.members%rowtype;
begin
  if p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into found_row
  from public.members
  where user_id = p_actor;
  if not found
     or found_row.status is distinct from 'active'
     or found_row.seat not in ('ksa', 'intl', 'sponsor') then
    raise exception 'not_active_member' using errcode = '42501';
  end if;
  return found_row;
end;
$$;

revoke all on function private.active_member(uuid) from public, anon, authenticated;

create or replace function private.sync_deal_room_count(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count int;
begin
  select count(*)::int into next_count
  from public.room_participants
  where room_id = p_room
    and invite_status = 'accepted';
  if next_count > 50 then
    raise exception 'room_full' using errcode = '23514';
  end if;
  update public.rooms
  set member_count = next_count
  where id = p_room
    and opened_by = 'member';
end;
$$;

revoke all on function private.sync_deal_room_count(uuid) from public, anon, authenticated;

create or replace function private.clean_room_line(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(trim(coalesce(p_value, '')), '[[:space:]]+', ' ', 'g'),
    ''
  );
$$;

revoke all on function private.clean_room_line(text) from public, anon, authenticated;

create or replace function private.require_member_room(p_room_id uuid, p_actor uuid)
returns public.rooms
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found_room public.rooms%rowtype;
begin
  select * into found_room
  from public.rooms
  where id = p_room_id
    and opened_by = 'member';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if found_room.owner_member_id is distinct from p_actor then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.room_participants rp
    where rp.room_id = found_room.id
      and rp.member_id = p_actor
      and rp.role = 'owner'
      and rp.invite_status = 'accepted'
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  return found_room;
end;
$$;

revoke all on function private.require_member_room(uuid, uuid) from public, anon, authenticated;

create or replace function private.place_deal_invite(
  p_actor uuid,
  p_room_id uuid,
  p_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_room public.rooms%rowtype;
  target public.members%rowtype;
  existing public.room_participants%rowtype;
  taken int;
  invitee_email text;
  owner_name text;
begin
  perform private.active_member(p_actor);
  found_room := private.require_member_room(p_room_id, p_actor);

  if found_room.status = 'archived' then
    raise exception 'room_archived' using errcode = '23514';
  end if;
  if found_room.status is distinct from 'open' then
    raise exception 'room_closed' using errcode = '23514';
  end if;
  if p_member_id is not distinct from p_actor then
    raise exception 'cannot_invite_self' using errcode = '22023';
  end if;

  select * into target
  from public.members
  where user_id = p_member_id;
  if not found
     or target.status is distinct from 'active'
     or target.seat not in ('ksa', 'intl', 'sponsor') then
    raise exception 'not_invitable' using errcode = '42501';
  end if;

  select * into existing
  from public.room_participants
  where room_id = p_room_id
    and member_id = p_member_id;
  if found and existing.invite_status in ('invited', 'accepted') then
    raise exception 'already_participant' using errcode = '23505';
  end if;

  select count(*)::int into taken
  from public.room_participants
  where room_id = p_room_id
    and invite_status in ('invited', 'accepted');
  if taken >= 50 then
    raise exception 'room_full' using errcode = '23514';
  end if;

  if existing.id is not null then
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
      p_room_id, p_member_id, 'member', 'invited', now()
    );
  end if;

  invitee_email := trim(target.email);
  select left(private.clean_room_line(full_name), 200) into owner_name
  from public.profiles
  where user_id = p_actor;
  if owner_name is null then
    owner_name := 'A Board Arabia member';
  end if;

  return jsonb_build_object(
    'ok', true,
    'invite_status', 'invited',
    'room_id', found_room.id,
    'room_name', found_room.name,
    'purpose', found_room.purpose,
    'owner_name', owner_name,
    'invitee_email', invitee_email
  );
end;
$$;

revoke all on function private.place_deal_invite(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.create_member_deal_room(
  p_actor uuid,
  p_name text,
  p_purpose text,
  p_mandate_id uuid,
  p_re_opportunity_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.members%rowtype;
  room_name text;
  room_purpose text;
  host_name text;
  new_id uuid;
begin
  perform private.assert_service_role();
  actor := private.active_member(p_actor);

  room_name := private.clean_room_line(p_name);
  room_purpose := private.clean_room_line(p_purpose);
  if room_name is null or char_length(room_name) < 1 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if room_purpose is null or char_length(room_purpose) < 1 or char_length(room_purpose) > 400 then
    raise exception 'invalid_purpose' using errcode = '22023';
  end if;
  if char_length(room_name) > 160 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_mandate_id is not null and p_re_opportunity_id is not null then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;
  if p_mandate_id is not null and not exists (
    select 1 from public.mandates where id = p_mandate_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_re_opportunity_id is not null and not exists (
    select 1 from public.re_opportunities where id = p_re_opportunity_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select left(private.clean_room_line(full_name), 200) into host_name
  from public.profiles
  where user_id = actor.user_id;
  if host_name is null then
    host_name := 'Member';
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
    'Private',
    'Open',
    1,
    host_name,
    p_mandate_id,
    p_re_opportunity_id,
    room_purpose,
    actor.user_id,
    'member'
  )
  returning id into new_id;

  insert into public.room_participants (
    room_id, member_id, role, invite_status, invited_at, accepted_at
  ) values (
    new_id, actor.user_id, 'owner', 'accepted', now(), now()
  );

  return jsonb_build_object(
    'ok', true,
    'room_id', new_id,
    'status', 'open'
  );
end;
$$;

revoke all on function public.create_member_deal_room(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_member_deal_room(uuid, text, text, uuid, uuid) to service_role;

create or replace function public.invite_member_deal_room(
  p_actor uuid,
  p_room_id uuid,
  p_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.assert_service_role();
  return private.place_deal_invite(p_actor, p_room_id, p_member_id);
end;
$$;

revoke all on function public.invite_member_deal_room(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.invite_member_deal_room(uuid, uuid, uuid) to service_role;

create or replace function public.respond_member_deal_room(
  p_actor uuid,
  p_room_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_room public.rooms%rowtype;
  existing public.room_participants%rowtype;
begin
  perform private.assert_service_role();
  perform private.active_member(p_actor);
  if p_decision not in ('accept', 'decline') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select * into found_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if found_room.status = 'archived' then
    raise exception 'room_archived' using errcode = '23514';
  end if;
  if p_decision = 'accept' and found_room.status is distinct from 'open' then
    raise exception 'room_closed' using errcode = '23514';
  end if;

  select * into existing
  from public.room_participants
  where room_id = p_room_id
    and member_id = p_actor
    and invite_status = 'invited';
  if not found then
    raise exception 'not_invitee' using errcode = '42501';
  end if;

  if p_decision = 'accept' then
    update public.room_participants
    set invite_status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    where id = existing.id;
    perform private.sync_deal_room_count(p_room_id);
    return jsonb_build_object('ok', true, 'room_id', p_room_id, 'invite_status', 'accepted');
  end if;

  update public.room_participants
  set invite_status = 'declined',
      declined_at = now(),
      updated_at = now()
  where id = existing.id;
  return jsonb_build_object('ok', true, 'room_id', p_room_id, 'invite_status', 'declined');
end;
$$;

revoke all on function public.respond_member_deal_room(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.respond_member_deal_room(uuid, uuid, text) to service_role;

create or replace function public.manage_member_deal_room(
  p_actor uuid,
  p_room_id uuid,
  p_action text,
  p_name text,
  p_purpose text,
  p_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_room public.rooms%rowtype;
  existing public.room_participants%rowtype;
  room_name text;
  room_purpose text;
begin
  perform private.assert_service_role();
  perform private.active_member(p_actor);
  if p_action = 'add' then
    return private.place_deal_invite(p_actor, p_room_id, p_member_id);
  end if;

  found_room := private.require_member_room(p_room_id, p_actor);

  if p_action = 'rename' then
    if found_room.status = 'archived' then
      raise exception 'room_archived' using errcode = '23514';
    end if;
    room_name := private.clean_room_line(p_name);
    if room_name is null or char_length(room_name) < 1 or char_length(room_name) > 160 then
      raise exception 'invalid_name' using errcode = '22023';
    end if;
    if p_purpose is null then
      room_purpose := found_room.purpose;
    else
      room_purpose := private.clean_room_line(p_purpose);
      if room_purpose is null or char_length(room_purpose) < 1 or char_length(room_purpose) > 400 then
        raise exception 'invalid_purpose' using errcode = '22023';
      end if;
    end if;
    update public.rooms
    set name = room_name,
        purpose = room_purpose,
        summary = room_purpose
    where id = found_room.id;
    return jsonb_build_object(
      'ok', true,
      'room_id', found_room.id,
      'name', room_name,
      'purpose', room_purpose
    );
  end if;

  if p_action = 'remove' then
    if found_room.status = 'archived' then
      raise exception 'room_archived' using errcode = '23514';
    end if;
    if p_member_id is not distinct from p_actor then
      raise exception 'cannot_remove_owner' using errcode = '22023';
    end if;
    select * into existing
    from public.room_participants
    where room_id = p_room_id
      and member_id = p_member_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if existing.role = 'owner' then
      raise exception 'cannot_remove_owner' using errcode = '22023';
    end if;
    if existing.invite_status = 'removed' then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    update public.room_participants
    set invite_status = 'removed',
        removed_at = now(),
        updated_at = now()
    where id = existing.id;
    perform private.sync_deal_room_count(p_room_id);
    return jsonb_build_object('ok', true, 'room_id', p_room_id, 'invite_status', 'removed');
  end if;

  if p_action = 'close' then
    if found_room.status is distinct from 'open' then
      raise exception 'not_open' using errcode = '23514';
    end if;
    update public.rooms
    set status = 'closed'
    where id = found_room.id
      and status = 'open';
    return jsonb_build_object('ok', true, 'room_id', found_room.id, 'status', 'closed');
  end if;

  if p_action = 'archive' then
    if found_room.status = 'archived' then
      raise exception 'room_archived' using errcode = '23514';
    end if;
    update public.rooms
    set status = 'archived'
    where id = found_room.id
      and status in ('open', 'closed');
    return jsonb_build_object('ok', true, 'room_id', found_room.id, 'status', 'archived');
  end if;

  raise exception 'invalid_action' using errcode = '22023';
end;
$$;

revoke all on function public.manage_member_deal_room(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.manage_member_deal_room(uuid, uuid, text, text, text, uuid) to service_role;

create or replace function public.list_all_deal_rooms(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.assert_service_role();
  if p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.actor_is_staff(p_actor) then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'rooms', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'opened_by', r.opened_by,
          'status', r.status,
          'name', r.name,
          'purpose', r.purpose,
          'owner_member_id', r.owner_member_id,
          'mandate_id', r.mandate_id,
          're_opportunity_id', r.re_opportunity_id,
          'created_at', r.created_at,
          'participants', coalesce((
            select jsonb_agg(
              jsonb_build_object(
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

revoke all on function public.list_all_deal_rooms(uuid) from public, anon, authenticated;
grant execute on function public.list_all_deal_rooms(uuid) to service_role;

create or replace function public.close_any_deal_room(p_actor uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  set status = 'closed'
  where id = found_room.id
    and status = 'open';

  return jsonb_build_object('ok', true, 'room_id', found_room.id, 'status', 'closed');
end;
$$;

revoke all on function public.close_any_deal_room(uuid, uuid) from public, anon, authenticated;
grant execute on function public.close_any_deal_room(uuid, uuid) to service_role;

create or replace function public.list_member_rooms()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  real_n int;
  show_demo boolean;
begin
  if not private.can_read_member_room() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(*)::int into real_n
  from public.rooms
  where is_demo = false
    and status = 'open'
    and opened_by = 'admin';

  show_demo := private.demo_rows_visible('rooms', real_n);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'is_demo', r.is_demo,
      'name', r.name,
      'summary', r.summary,
      'sector', r.sector,
      'stage', r.stage,
      'member_count', r.member_count,
      'host_name', r.host_name
    ) order by r.is_demo, r.sort_order, r.name)
    from public.rooms r
    where r.status = 'open'
      and r.opened_by = 'admin'
      and (r.is_demo = false or show_demo)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_member_rooms() from public, anon;
grant execute on function public.list_member_rooms() to authenticated;
