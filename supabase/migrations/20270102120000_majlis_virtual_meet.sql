-- Virtual majlis. Google Meet link is stored on the event and revealed like the venue address.
-- Signed-in host, staff, or a registered RSVP can see it. It is hidden after the event ends
-- and when the majlis is cancelled, except for staff. No guest list is added to Google.
-- Slot 20270102120000. Not applied here.

alter table public.majlis_events
  add column if not exists format text not null default 'in_person';

alter table public.majlis_events
  add column if not exists google_event_id text;

alter table public.majlis_events
  add column if not exists google_meet_url text;

alter table public.majlis_events
  add column if not exists meet_fallback_url text;

alter table public.majlis_events
  add column if not exists meet_sync_status text not null default 'skipped';

alter table public.majlis_events
  add column if not exists meet_sync_detail text;

alter table public.majlis_events drop constraint if exists majlis_events_format_check;
alter table public.majlis_events
  add constraint majlis_events_format_check
  check (format in ('in_person', 'virtual'));

alter table public.majlis_events drop constraint if exists majlis_events_meet_sync_status_check;
alter table public.majlis_events
  add constraint majlis_events_meet_sync_status_check
  check (meet_sync_status in ('skipped', 'not_connected', 'synced', 'failed', 'cancelled'));

alter table public.majlis_events drop constraint if exists majlis_events_venue_address_len;
alter table public.majlis_events
  add constraint majlis_events_venue_address_len
  check (
    char_length(venue_address) <= 500
    and (
      (format = 'in_person' and char_length(trim(venue_address)) between 1 and 500)
      or (format = 'virtual' and char_length(trim(venue_address)) <= 500)
    )
  );

comment on column public.majlis_events.google_meet_url is
  'Meet link from Google. Member views reveal it only with the venue address gate.';

comment on column public.majlis_events.meet_fallback_url is
  'Staff fallback link used only when Google sync has not stored a link.';

create or replace function private.majlis_virtual_member_cap(p_host uuid)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_host is null then 149 else 148 end;
$$;

revoke all on function private.majlis_virtual_member_cap(uuid) from public, anon, authenticated;

comment on function private.majlis_virtual_member_cap(uuid) is
  'RSVP seats so members, the host, and the organizer stay within 150. One seat is the organizer. A member host takes another.';

create or replace function private.majlis_events_guard_virtual()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.format = 'virtual' and new.capacity > private.majlis_virtual_member_cap(new.host_member_id) then
    raise exception 'virtual_cap' using errcode = '23514';
  end if;
  if new.google_meet_url is not null and new.google_meet_url !~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then
    raise exception 'meet_url' using errcode = '23514';
  end if;
  if new.meet_fallback_url is not null and new.meet_fallback_url !~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then
    raise exception 'meet_url' using errcode = '23514';
  end if;
  if new.meet_sync_detail is not null and char_length(new.meet_sync_detail) > 200 then
    raise exception 'meet_detail' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.majlis_events_guard_virtual() from public, anon, authenticated;

drop trigger if exists majlis_events_guard_virtual on public.majlis_events;
create trigger majlis_events_guard_virtual
  before insert or update on public.majlis_events
  for each row execute function private.majlis_events_guard_virtual();

create or replace function private.majlis_events_guard_client_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending_approval'
      or new.approved_by is not null
      or new.approved_at is not null
      or new.rejection_feedback is not null
      or new.admin_note is not null
      or new.host_member_id is distinct from auth.uid()
      or new.created_by_staff is not null
      or new.rsvp_opens_at is not null
      or new.founding_priority_ends_at is not null
      or new.featured is true
      or new.sponsor_label is not null
      or new.cancelled_at is not null
      or new.cancel_reason is not null
      or new.format is distinct from 'in_person'
      or new.google_event_id is not null
      or new.google_meet_url is not null
      or new.meet_fallback_url is not null
      or new.meet_sync_status is distinct from 'skipped'
      or new.meet_sync_detail is not null then
      raise exception 'host_cannot_publish' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'host_cannot_publish' using errcode = '42501';
end;
$$;

revoke all on function private.majlis_events_guard_client_write() from public, anon, authenticated;

alter table public.majlis_decisions drop constraint if exists majlis_decisions_action_check;
alter table public.majlis_decisions
  add constraint majlis_decisions_action_check
  check (action in (
    'accept',
    'reject',
    'hide',
    'unhide',
    'cancel',
    'update',
    'sponsor',
    'promote',
    'feature',
    'create',
    'sync'
  ));

create or replace function public.majlis_place_rsvp(
  p_event uuid,
  p_member uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.majlis_events%rowtype;
  mem public.members%rowtype;
  existing public.majlis_rsvps%rowtype;
  has_row boolean := false;
  registered_n int;
  waitlist_n int;
  seat_cap int;
  next_pos int;
  promoted uuid;
  prev text;
  opens_at timestamptz;
  priority_ends timestamptz;
  next_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('register', 'cancel', 'promote', 'maybe', 'decline') then
    raise exception 'bad_action' using errcode = '22023';
  end if;

  select * into ev
  from public.majlis_events
  where id = p_event
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if ev.status is distinct from 'published' then
    raise exception 'not_published' using errcode = '42501';
  end if;

  select * into mem from public.members where user_id = p_member;
  if not found or mem.status not in ('invited', 'active') then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if mem.seat = 'sponsor' then
    raise exception 'sponsor_cannot_rsvp' using errcode = '42501';
  end if;

  select * into existing
  from public.majlis_rsvps
  where event_id = p_event and member_id = p_member
  for update;
  has_row := found;

  opens_at := coalesce(ev.rsvp_opens_at, ev.approved_at);
  priority_ends := coalesce(ev.founding_priority_ends_at, ev.approved_at + interval '48 hours');
  prev := case when has_row then existing.status else null end;

  seat_cap := ev.capacity;
  if ev.format = 'virtual' then
    seat_cap := least(ev.capacity, private.majlis_virtual_member_cap(ev.host_member_id));
  end if;

  select count(*) into registered_n
  from public.majlis_rsvps
  where event_id = p_event and status = 'registered';

  if p_action = 'promote' then
    if not has_row or existing.status is distinct from 'waitlist' then
      raise exception 'not_waitlist' using errcode = '42501';
    end if;
    if registered_n >= seat_cap then
      raise exception 'full' using errcode = '42501';
    end if;
    update public.majlis_rsvps
      set status = 'registered',
          waitlist_position = null,
          cancelled_at = null
      where id = existing.id;
    next_status := 'registered';
  elsif p_action = 'cancel' then
    if not has_row or existing.status = 'cancelled' then
      return jsonb_build_object(
        'status', 'cancelled',
        'waitlist_position', null,
        'changed', false,
        'previous_status', prev,
        'promoted_member_id', null
      );
    end if;
    update public.majlis_rsvps
      set status = 'cancelled',
          cancelled_at = now(),
          waitlist_position = null
      where id = existing.id;
    next_status := 'cancelled';
  elsif p_action in ('maybe', 'decline') then
    if ev.host_member_id = p_member then
      raise exception 'host_cannot_rsvp' using errcode = '42501';
    end if;
    if opens_at is null or now() < opens_at then
      raise exception 'not_open' using errcode = '42501';
    end if;
    next_status := case when p_action = 'decline' then 'declined' else 'maybe' end;
    if has_row and existing.status = next_status then
      null;
    elsif not has_row then
      insert into public.majlis_rsvps (event_id, member_id, status, registered_at)
      values (p_event, p_member, next_status, now());
    else
      update public.majlis_rsvps
        set status = next_status,
            waitlist_position = null,
            cancelled_at = null
        where id = existing.id;
    end if;
  else
    if ev.host_member_id = p_member then
      raise exception 'host_cannot_rsvp' using errcode = '42501';
    end if;
    if opens_at is null or now() < opens_at then
      raise exception 'not_open' using errcode = '42501';
    end if;
    if mem.seat not in ('ksa', 'intl') then
      if priority_ends is null or now() < priority_ends then
        raise exception 'founding_window' using errcode = '42501';
      end if;
    end if;
    if has_row and existing.status = 'registered' then
      next_status := 'registered';
    elsif registered_n < seat_cap then
      next_status := 'registered';
      if not has_row then
        insert into public.majlis_rsvps (event_id, member_id, status, registered_at)
        values (p_event, p_member, 'registered', now());
      else
        update public.majlis_rsvps
          set status = 'registered',
              waitlist_position = null,
              cancelled_at = null
          where id = existing.id;
      end if;
    elsif has_row and existing.status = 'waitlist' then
      next_status := 'waitlist';
    else
      select coalesce(max(waitlist_position), 0) + 1 into next_pos
      from public.majlis_rsvps
      where event_id = p_event and status = 'waitlist';
      next_status := 'waitlist';
      if not has_row then
        insert into public.majlis_rsvps (event_id, member_id, status, waitlist_position, registered_at)
        values (p_event, p_member, 'waitlist', next_pos, now());
      else
        update public.majlis_rsvps
          set status = 'waitlist',
              waitlist_position = next_pos,
              cancelled_at = null
          where id = existing.id;
      end if;
    end if;
  end if;

  if prev = 'registered' and next_status is distinct from 'registered' then
    select r.member_id into promoted
    from public.majlis_rsvps r
    where r.event_id = p_event
      and r.status = 'waitlist'
    order by r.waitlist_position asc, r.registered_at asc
    limit 1
    for update;
    if promoted is not null then
      update public.majlis_rsvps
        set status = 'registered',
            waitlist_position = null,
            cancelled_at = null
        where event_id = p_event and member_id = promoted;
    end if;
  end if;

  select
    count(*) filter (where status = 'registered'),
    count(*) filter (where status = 'waitlist')
  into registered_n, waitlist_n
  from public.majlis_rsvps
  where event_id = p_event;

  return jsonb_build_object(
    'status', next_status,
    'waitlist_position', (
      select r.waitlist_position
      from public.majlis_rsvps r
      where r.event_id = p_event and r.member_id = p_member
    ),
    'changed', prev is distinct from next_status,
    'previous_status', prev,
    'promoted_member_id', promoted,
    'registered_count', registered_n,
    'waitlist_count', waitlist_n
  );
end;
$$;

revoke all on function public.majlis_place_rsvp(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.majlis_place_rsvp(uuid, uuid, text) to service_role;


revoke all on function public.majlis_place_rsvp(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.majlis_place_rsvp(uuid, uuid, text) to service_role;

comment on function public.majlis_place_rsvp(uuid, uuid, text) is
  'Service role only. Yes uses capacity and the founding window. Virtual majlis seats stay within 150 people. Maybe and No do not take a seat.';

drop view if exists public.majlis_events_member;
drop function if exists private.majlis_events_member_rows();

create function private.majlis_events_member_rows()
returns table (
  id uuid,
  host_member_id uuid,
  title text,
  description text,
  region text,
  focus_tags text[],
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  capacity integer,
  venue_name text,
  venue_address text,
  venue_visibility text,
  status text,
  rejection_feedback text,
  admin_note text,
  approved_at timestamptz,
  created_at timestamptz,
  map_lat numeric,
  map_lng numeric,
  rsvp_opens_at timestamptz,
  founding_priority_ends_at timestamptz,
  featured boolean,
  sponsor_label text,
  cancelled_at timestamptz,
  cancel_reason text,
  registered_count integer,
  waitlist_count integer,
  my_rsvp_status text,
  my_waitlist_position integer,
  host_avatar_style text,
  host_avatar_path text,
  host_full_name text,
  maybe_count integer,
  format text,
  meet_url text,
  meet_sync_status text,
  meet_sync_detail text,
  meet_fallback_url text
)
language sql
stable
security definer
set search_path = ''
as $fn$
select
  e.id,
  e.host_member_id,
  e.title,
  e.description,
  e.region,
  e.focus_tags,
  e.starts_at,
  e.ends_at,
  e.timezone,
  e.capacity,
  e.venue_name,
  case
    when e.ends_at <= now() and not private.is_staff() then null
    when e.host_member_id = auth.uid()
      or private.is_staff()
      then e.venue_address
    when e.venue_visibility = 'members_always'
      and e.status = 'published'
      and exists (
        select 1
        from public.members m
        where m.user_id = auth.uid()
          and m.status in ('invited', 'active')
          and m.seat <> 'sponsor'
      )
      then e.venue_address
    when e.venue_visibility = 'members_on_rsvp'
      and exists (
        select 1
        from public.majlis_rsvps r
        where r.event_id = e.id
          and r.member_id = auth.uid()
          and r.status = 'registered'
      )
      then e.venue_address
    else null
  end as venue_address,
  e.venue_visibility,
  e.status,
  case
    when e.host_member_id = auth.uid()
      or private.is_staff()
      then e.rejection_feedback
    else null
  end as rejection_feedback,
  case
    when private.is_staff()
      then e.admin_note
    else null
  end as admin_note,
  case
    when private.is_staff()
      then e.approved_at
    else null
  end as approved_at,
  e.created_at,
  coalesce(e.map_lat, g.map_lat) as map_lat,
  coalesce(e.map_lng, g.map_lng) as map_lng,
  coalesce(e.rsvp_opens_at, e.approved_at) as rsvp_opens_at,
  coalesce(e.founding_priority_ends_at, e.approved_at + interval '48 hours') as founding_priority_ends_at,
  e.featured,
  e.sponsor_label,
  e.cancelled_at,
  case
    when e.host_member_id = auth.uid()
      or private.is_staff()
      then e.cancel_reason
    else null
  end as cancel_reason,
  (
    select count(*)::int
    from public.majlis_rsvps r
    where r.event_id = e.id and r.status = 'registered'
  ) as registered_count,
  (
    select count(*)::int
    from public.majlis_rsvps r
    where r.event_id = e.id and r.status = 'waitlist'
  ) as waitlist_count,
  (
    select r.status
    from public.majlis_rsvps r
    where r.event_id = e.id and r.member_id = auth.uid()
  ) as my_rsvp_status,
  (
    select r.waitlist_position
    from public.majlis_rsvps r
    where r.event_id = e.id and r.member_id = auth.uid()
  ) as my_waitlist_position,
  case
    when e.host_member_id is null then null
    else coalesce(host_profile.avatar_style, 'male')::text
  end as host_avatar_style,
  case
    when e.host_member_id is null then null
    else host_profile.avatar_path
  end as host_avatar_path,
  host_profile.full_name as host_full_name,
  case
    when private.is_staff() or e.host_member_id = auth.uid() then (
      select count(*)::int
      from public.majlis_rsvps r
      where r.event_id = e.id and r.status = 'maybe'
    )
    else null
  end as maybe_count,

  e.format,
  case
    when e.format is distinct from 'virtual' then null
    when (e.ends_at <= now() or e.status = 'cancelled') and not private.is_staff() then null
    when e.host_member_id = auth.uid()
      or private.is_staff()
      then coalesce(nullif(btrim(e.google_meet_url), ''), nullif(btrim(e.meet_fallback_url), ''))
    when exists (
      select 1
      from public.majlis_rsvps r
      where r.event_id = e.id
        and r.member_id = auth.uid()
        and r.status = 'registered'
    )
      then coalesce(nullif(btrim(e.google_meet_url), ''), nullif(btrim(e.meet_fallback_url), ''))
    else null
  end as meet_url,
  case when private.is_staff() then e.meet_sync_status else null end as meet_sync_status,
  case when private.is_staff() then e.meet_sync_detail else null end as meet_sync_detail,
  case when private.is_staff() then e.meet_fallback_url else null end as meet_fallback_url
from public.majlis_events e
left join public.majlis_region_geotag g on g.region = e.region
left join public.profiles host_profile on host_profile.user_id = e.host_member_id
where
  private.is_staff()
  or (
    e.host_member_id = auth.uid()
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
        and m.seat <> 'sponsor'
    )
  )
  or (
    e.status = 'published'
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
        and m.seat <> 'sponsor'
    )
  )
$fn$;


revoke all on function private.majlis_events_member_rows() from public, anon;
grant execute on function private.majlis_events_member_rows() to authenticated, service_role;

create view public.majlis_events_member
with (security_barrier = true, security_invoker = true)
as
select
  id,
  host_member_id,
  title,
  description,
  region,
  focus_tags,
  starts_at,
  ends_at,
  timezone,
  capacity,
  venue_name,
  venue_address,
  venue_visibility,
  status,
  rejection_feedback,
  admin_note,
  approved_at,
  created_at,
  map_lat,
  map_lng,
  rsvp_opens_at,
  founding_priority_ends_at,
  featured,
  sponsor_label,
  cancelled_at,
  cancel_reason,
  registered_count,
  waitlist_count,
  my_rsvp_status,
  my_waitlist_position,
  host_avatar_style,
  host_avatar_path,
  host_full_name,
  maybe_count,
  format,
  meet_url,
  meet_sync_status,
  meet_sync_detail,
  meet_fallback_url
from private.majlis_events_member_rows();


revoke all on table public.majlis_events_member from public, anon, authenticated;
grant select on table public.majlis_events_member to authenticated;

create table if not exists public.majlis_google_calendar (
  id integer primary key default 1,
  calendar_id text not null,
  updated_at timestamptz not null default now(),
  constraint majlis_google_calendar_singleton check (id = 1)
);

alter table public.majlis_google_calendar enable row level security;
alter table public.majlis_google_calendar force row level security;

revoke all on table public.majlis_google_calendar from public, anon, authenticated;
grant select, insert, update on table public.majlis_google_calendar to service_role;

comment on table public.majlis_google_calendar is
  'Calendar id created by the app. No member policy. The refresh token stays in Edge secrets.';
