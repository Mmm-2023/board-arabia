-- Majlis RSVP, geotag, founding window, and sponsor-safe read models.
-- Does not edit or re-apply 20260925150000_majlis_events.sql.
-- No guest seed rows. Region centroids are reference data, not people.

alter table public.majlis_events
  add column if not exists map_lat numeric(8, 4),
  add column if not exists map_lng numeric(8, 4),
  add column if not exists rsvp_opens_at timestamptz,
  add column if not exists founding_priority_ends_at timestamptz,
  add column if not exists featured boolean not null default false,
  add column if not exists sponsor_label text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

alter table public.majlis_events drop constraint if exists majlis_events_status_check;
alter table public.majlis_events
  add constraint majlis_events_status_check
  check (status in ('pending_approval', 'published', 'rejected', 'cancelled', 'hidden'));

alter table public.majlis_events drop constraint if exists majlis_events_geo_check;
alter table public.majlis_events
  add constraint majlis_events_geo_check
  check (
    (map_lat is null and map_lng is null)
    or (
      map_lat between 16 and 33
      and map_lng between 34 and 56
    )
  );

alter table public.majlis_events drop constraint if exists majlis_events_founding_window_check;
alter table public.majlis_events
  add constraint majlis_events_founding_window_check
  check (
    founding_priority_ends_at is null
    or rsvp_opens_at is null
    or (
      founding_priority_ends_at >= rsvp_opens_at + interval '48 hours' - interval '1 second'
      and founding_priority_ends_at <= rsvp_opens_at + interval '48 hours' + interval '1 second'
    )
  );

alter table public.majlis_events drop constraint if exists majlis_events_cancel_check;
alter table public.majlis_events
  add constraint majlis_events_cancel_check
  check (
    status <> 'cancelled'
    or (
      cancelled_at is not null
      and cancel_reason is not null
      and char_length(trim(cancel_reason)) between 1 and 2000
    )
  );

alter table public.majlis_events drop constraint if exists majlis_events_sponsor_label_len;
alter table public.majlis_events
  add constraint majlis_events_sponsor_label_len
  check (
    sponsor_label is null
    or char_length(trim(sponsor_label)) between 1 and 120
  );

create table if not exists public.majlis_region_geotag (
  region text primary key,
  map_lat numeric(8, 4) not null,
  map_lng numeric(8, 4) not null,
  constraint majlis_region_geotag_region_check check (
    region in (
      'Riyadh',
      'Makkah',
      'Madinah',
      'Eastern Province',
      'Asir',
      'Tabuk',
      'Hail',
      'Northern Borders',
      'Jazan',
      'Najran',
      'Al Bahah',
      'Al Jawf',
      'Qassim'
    )
  ),
  constraint majlis_region_geotag_geo_check check (
    map_lat between 16 and 33
    and map_lng between 34 and 56
  )
);

insert into public.majlis_region_geotag (region, map_lat, map_lng)
values
  ('Riyadh', 24.7136, 46.6753),
  ('Makkah', 21.3891, 39.8579),
  ('Madinah', 24.5247, 39.5692),
  ('Eastern Province', 26.4207, 50.0888),
  ('Asir', 18.2465, 42.5117),
  ('Tabuk', 28.3838, 36.5550),
  ('Hail', 27.5114, 41.7208),
  ('Northern Borders', 30.9753, 41.0381),
  ('Jazan', 16.8892, 42.5611),
  ('Najran', 17.5656, 44.2289),
  ('Al Bahah', 20.0129, 41.4677),
  ('Al Jawf', 29.8874, 39.3206),
  ('Qassim', 26.3260, 43.9750)
on conflict (region) do update
  set map_lat = excluded.map_lat,
      map_lng = excluded.map_lng;

alter table public.majlis_region_geotag enable row level security;
alter table public.majlis_region_geotag force row level security;
revoke all on table public.majlis_region_geotag from public, anon, authenticated;

create index if not exists majlis_events_published_region_idx
  on public.majlis_events (region)
  where status = 'published';

create or replace function private.majlis_events_guard_client_write()
returns trigger
language plpgsql
set search_path = public
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
      or new.rsvp_opens_at is not null
      or new.founding_priority_ends_at is not null
      or new.featured is true
      or new.sponsor_label is not null
      or new.cancelled_at is not null
      or new.cancel_reason is not null then
      raise exception 'host_cannot_publish' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'host_cannot_publish' using errcode = '42501';
end;
$$;

revoke all on function private.majlis_events_guard_client_write() from public, anon, authenticated;

drop policy if exists majlis_events_insert_own_pending on public.majlis_events;
create policy majlis_events_insert_own_pending on public.majlis_events
  for insert to authenticated
  with check (
    host_member_id = auth.uid()
    and status = 'pending_approval'
    and approved_by is null
    and approved_at is null
    and rejection_feedback is null
    and admin_note is null
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
        and m.seat <> 'sponsor'
    )
  );

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
    'feature'
  ));

create table if not exists public.majlis_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.majlis_events(id) on delete cascade,
  member_id uuid not null references public.members(user_id) on delete cascade,
  status text not null,
  waitlist_position int,
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  calendar_sent_at timestamptz,
  reminder_t7_sent_at timestamptz,
  reminder_t1_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint majlis_rsvps_status_check check (status in ('registered', 'waitlist', 'cancelled')),
  constraint majlis_rsvps_waitlist_check check (
    (status = 'waitlist' and waitlist_position is not null and waitlist_position > 0)
    or (status <> 'waitlist' and waitlist_position is null)
  ),
  constraint majlis_rsvps_cancel_check check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  ),
  constraint majlis_rsvps_event_member_uid unique (event_id, member_id)
);

create index if not exists majlis_rsvps_event_status_idx
  on public.majlis_rsvps (event_id, status, waitlist_position);

drop trigger if exists majlis_rsvps_set_updated_at on public.majlis_rsvps;
create trigger majlis_rsvps_set_updated_at
  before update on public.majlis_rsvps
  for each row execute function public.set_updated_at();

alter table public.majlis_rsvps enable row level security;
alter table public.majlis_rsvps force row level security;
revoke all on table public.majlis_rsvps from public, anon, authenticated;

create table if not exists public.majlis_rsvp_limits (
  member_id uuid primary key references public.members(user_id) on delete cascade,
  window_start timestamptz not null default now(),
  hit_count int not null default 0
);

alter table public.majlis_rsvp_limits enable row level security;
alter table public.majlis_rsvp_limits force row level security;
revoke all on table public.majlis_rsvp_limits from public, anon, authenticated;

create or replace function public.majlis_consume_rsvp_slot(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  slot public.majlis_rsvp_limits%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.majlis_rsvp_limits (member_id, window_start, hit_count)
  values (p_member, now(), 1)
  on conflict (member_id) do update
    set
      window_start = case
        when majlis_rsvp_limits.window_start < now() - interval '1 hour' then now()
        else majlis_rsvp_limits.window_start
      end,
      hit_count = case
        when majlis_rsvp_limits.window_start < now() - interval '1 hour' then 1
        else majlis_rsvp_limits.hit_count + 1
      end
  returning * into slot;

  if slot.hit_count > 30 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
end;
$$;

revoke all on function public.majlis_consume_rsvp_slot(uuid) from public, anon, authenticated;
grant execute on function public.majlis_consume_rsvp_slot(uuid) to service_role;

-- Race-safe Register, Waitlist, Cancel, and staff Promote.
-- Locks the event row. Founding seats (ksa, intl) may register from open.
-- Any other non-sponsor member waits until founding_priority_ends_at.
-- Sponsors and hosts cannot take a seat. Capacity is counted inside the lock.
create or replace function public.majlis_place_rsvp(
  p_event uuid,
  p_member uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.majlis_events%rowtype;
  mem public.members%rowtype;
  existing public.majlis_rsvps%rowtype;
  has_row boolean := false;
  registered_n int;
  waitlist_n int;
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
  if p_action not in ('register', 'cancel', 'promote') then
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

  select count(*) into registered_n
  from public.majlis_rsvps
  where event_id = p_event and status = 'registered';

  if p_action = 'promote' then
    if not has_row or existing.status is distinct from 'waitlist' then
      raise exception 'not_waitlist' using errcode = '42501';
    end if;
    if registered_n >= ev.capacity then
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
    if prev = 'registered' then
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
    elsif registered_n < ev.capacity then
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

-- Hourly Edge path: POST /functions/v1/majlis-reminders with header x-majlis-cron.
-- The secret lives in the MAJLIS_CRON_SECRET Edge secret. Do not store it here.
comment on function public.majlis_place_rsvp(uuid, uuid, text) is
  'Service role only. Enforces capacity, one row per member, and the fixed 48 hour founding window.';

create or replace function public.majlis_due_reminders()
returns table (
  rsvp_id uuid,
  kind text,
  event_id uuid,
  member_id uuid,
  email text,
  full_name text,
  title text,
  region text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  venue_address text,
  venue_visibility text,
  capacity int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select *
  from (
    select
      r.id,
      't7'::text,
      e.id,
      r.member_id,
      m.email,
      p.full_name,
      e.title,
      e.region,
      e.starts_at,
      e.ends_at,
      e.venue_name,
      e.venue_address,
      e.venue_visibility,
      e.capacity
    from public.majlis_rsvps r
    join public.majlis_events e on e.id = r.event_id
    join public.members m on m.user_id = r.member_id
    left join public.profiles p on p.user_id = r.member_id
    where r.status = 'registered'
      and e.status = 'published'
      and r.reminder_t7_sent_at is null
      and e.starts_at > now() + interval '1 day'
      and e.starts_at <= now() + interval '7 days'
    union all
    select
      r.id,
      't1'::text,
      e.id,
      r.member_id,
      m.email,
      p.full_name,
      e.title,
      e.region,
      e.starts_at,
      e.ends_at,
      e.venue_name,
      e.venue_address,
      e.venue_visibility,
      e.capacity
    from public.majlis_rsvps r
    join public.majlis_events e on e.id = r.event_id
    join public.members m on m.user_id = r.member_id
    left join public.profiles p on p.user_id = r.member_id
    where r.status = 'registered'
      and e.status = 'published'
      and r.reminder_t1_sent_at is null
      and e.starts_at > now()
      and e.starts_at <= now() + interval '1 day'
  ) due
  limit 80;
end;
$$;

revoke all on function public.majlis_due_reminders() from public, anon, authenticated;
grant execute on function public.majlis_due_reminders() to service_role;

comment on function public.majlis_due_reminders() is
  'Service role only. T-7 is the window from 7 days out until 1 day out. T-1 is the next day until start. Invoke majlis-reminders hourly with MAJLIS_CRON_SECRET.';

create or replace function public.majlis_claim_reminder(p_rsvp uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind = 't7' then
    update public.majlis_rsvps
      set reminder_t7_sent_at = now()
      where id = p_rsvp
        and status = 'registered'
        and reminder_t7_sent_at is null
      returning id into claimed;
  elsif p_kind = 't1' then
    update public.majlis_rsvps
      set reminder_t1_sent_at = now()
      where id = p_rsvp
        and status = 'registered'
        and reminder_t1_sent_at is null
      returning id into claimed;
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  return claimed is not null;
end;
$$;

revoke all on function public.majlis_claim_reminder(uuid, text) from public, anon, authenticated;
grant execute on function public.majlis_claim_reminder(uuid, text) to service_role;

create or replace function public.majlis_release_reminder(p_rsvp uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind = 't7' then
    update public.majlis_rsvps set reminder_t7_sent_at = null where id = p_rsvp;
  elsif p_kind = 't1' then
    update public.majlis_rsvps set reminder_t1_sent_at = null where id = p_rsvp;
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.majlis_release_reminder(uuid, text) from public, anon, authenticated;
grant execute on function public.majlis_release_reminder(uuid, text) to service_role;

create or replace view public.majlis_events_member
with (security_barrier = true, security_invoker = false)
as
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
    when e.host_member_id = auth.uid()
      or exists (select 1 from public.staff_users s where s.user_id = auth.uid())
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
      or exists (select 1 from public.staff_users s where s.user_id = auth.uid())
      then e.rejection_feedback
    else null
  end as rejection_feedback,
  case
    when exists (select 1 from public.staff_users s where s.user_id = auth.uid())
      then e.admin_note
    else null
  end as admin_note,
  case
    when exists (select 1 from public.staff_users s where s.user_id = auth.uid())
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
      or exists (select 1 from public.staff_users s where s.user_id = auth.uid())
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
  ) as my_waitlist_position
from public.majlis_events e
left join public.majlis_region_geotag g on g.region = e.region
where
  exists (select 1 from public.staff_users s where s.user_id = auth.uid())
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
  );

revoke all on table public.majlis_events_member from public, anon, authenticated;
grant select on table public.majlis_events_member to authenticated;

-- Sponsors see published regional activity only. No address, host id, or guest identity.
create or replace view public.majlis_events_sponsor
with (security_barrier = true, security_invoker = false)
as
select
  e.id,
  e.title,
  e.description,
  e.region,
  e.focus_tags,
  e.starts_at,
  e.ends_at,
  e.timezone,
  e.capacity,
  e.venue_name,
  e.status,
  coalesce(e.map_lat, g.map_lat) as map_lat,
  coalesce(e.map_lng, g.map_lng) as map_lng,
  coalesce(e.rsvp_opens_at, e.approved_at) as rsvp_opens_at,
  coalesce(e.founding_priority_ends_at, e.approved_at + interval '48 hours') as founding_priority_ends_at,
  e.featured,
  e.sponsor_label,
  (
    select count(*)::int
    from public.majlis_rsvps r
    where r.event_id = e.id and r.status = 'registered'
  ) as registered_count,
  (
    select count(*)::int
    from public.majlis_rsvps r
    where r.event_id = e.id and r.status = 'waitlist'
  ) as waitlist_count
from public.majlis_events e
left join public.majlis_region_geotag g on g.region = e.region
where e.status = 'published'
  and exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
      and m.seat = 'sponsor'
  );

revoke all on table public.majlis_events_sponsor from public, anon, authenticated;
grant select on table public.majlis_events_sponsor to authenticated;

-- Host and staff roster. A member sees only their own row. Sponsors match nothing here.
create or replace view public.majlis_roster
with (security_barrier = true, security_invoker = false)
as
select
  r.id,
  r.event_id,
  r.member_id,
  r.status,
  r.waitlist_position,
  r.registered_at,
  r.cancelled_at,
  m.email,
  p.full_name
from public.majlis_rsvps r
join public.majlis_events e on e.id = r.event_id
join public.members m on m.user_id = r.member_id
left join public.profiles p on p.user_id = r.member_id
where
  exists (select 1 from public.staff_users s where s.user_id = auth.uid())
  or e.host_member_id = auth.uid()
  or r.member_id = auth.uid();

revoke all on table public.majlis_roster from public, anon, authenticated;
grant select on table public.majlis_roster to authenticated;
