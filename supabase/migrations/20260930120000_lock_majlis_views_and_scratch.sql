-- Lock the three majlis read models and drop scratch tables that are not in this repo.
-- The live database already applied lock_scratch_tables_rls. This file makes the repo match:
-- drop public._edge_boot_staging, public._edge_boot_upload, and public._hex_scratch if they exist.
--
-- The member, sponsor, and roster views ran as their owner, so they bypassed row level
-- security. Turning them into plain invoker views over the base tables would
-- either return no rows (select is revoked on those tables) or, if new policies granted the
-- underlying columns, expose venue addresses, admin notes, and guest emails through the Data API.
-- Column redaction cannot be expressed as a row policy.
--
-- The previous select lists and filters now live in private security definer functions with an
-- empty search_path. The public views are security invoker wrappers, so the lint clears and
-- anon, member, sponsor, and staff still receive the same rows and columns. auth.uid() still
-- reads the caller JWT. No Edge function reads these views.

drop table if exists public._edge_boot_staging;
drop table if exists public._edge_boot_upload;
drop table if exists public._hex_scratch;

create or replace function private.majlis_events_member_rows()
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
  my_waitlist_position integer
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
  )
$fn$;

revoke all on function private.majlis_events_member_rows() from public, anon;
grant execute on function private.majlis_events_member_rows() to authenticated, service_role;

create or replace function private.majlis_events_sponsor_rows()
returns table (
  id uuid,
  title text,
  description text,
  region text,
  focus_tags text[],
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  capacity integer,
  venue_name text,
  status text,
  map_lat numeric,
  map_lng numeric,
  rsvp_opens_at timestamptz,
  founding_priority_ends_at timestamptz,
  featured boolean,
  sponsor_label text,
  registered_count integer,
  waitlist_count integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
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
  )
$fn$;

revoke all on function private.majlis_events_sponsor_rows() from public, anon;
grant execute on function private.majlis_events_sponsor_rows() to authenticated, service_role;

create or replace function private.majlis_roster_rows()
returns table (
  id uuid,
  event_id uuid,
  member_id uuid,
  status text,
  waitlist_position integer,
  registered_at timestamptz,
  cancelled_at timestamptz,
  email text,
  full_name text
)
language sql
stable
security definer
set search_path = ''
as $fn$
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
  or (
    not exists (
      select 1
      from public.members viewer
      where viewer.user_id = auth.uid()
        and viewer.seat = 'sponsor'
    )
    and (
      e.host_member_id = auth.uid()
      or r.member_id = auth.uid()
    )
  )
$fn$;

revoke all on function private.majlis_roster_rows() from public, anon;
grant execute on function private.majlis_roster_rows() to authenticated, service_role;

drop view if exists public.majlis_events_member;
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
  my_waitlist_position
from private.majlis_events_member_rows();

revoke all on table public.majlis_events_member from public, anon, authenticated;
grant select on table public.majlis_events_member to authenticated;

drop view if exists public.majlis_events_sponsor;
create view public.majlis_events_sponsor
with (security_barrier = true, security_invoker = true)
as
select
  id,
  title,
  description,
  region,
  focus_tags,
  starts_at,
  ends_at,
  timezone,
  capacity,
  venue_name,
  status,
  map_lat,
  map_lng,
  rsvp_opens_at,
  founding_priority_ends_at,
  featured,
  sponsor_label,
  registered_count,
  waitlist_count
from private.majlis_events_sponsor_rows();

revoke all on table public.majlis_events_sponsor from public, anon, authenticated;
grant select on table public.majlis_events_sponsor to authenticated;

-- Host and staff roster. A member sees only their own row.
-- A sponsor seat matches nothing here, including their own row. Staff keep the admin roster.
drop view if exists public.majlis_roster;
create view public.majlis_roster
with (security_barrier = true, security_invoker = true)
as
select
  id,
  event_id,
  member_id,
  status,
  waitlist_position,
  registered_at,
  cancelled_at,
  email,
  full_name
from private.majlis_roster_rows();

revoke all on table public.majlis_roster from public, anon, authenticated;
grant select on table public.majlis_roster to authenticated;

-- staff_* does not need anon. Re-assert execute grants. Each function already checks
-- staff membership in its body (private.is_staff). Bodies are unchanged.
revoke all on function public.staff_set_member_capacity(uuid, numeric, numeric, numeric, boolean, boolean) from public, anon;
grant execute on function public.staff_set_member_capacity(uuid, numeric, numeric, numeric, boolean, boolean) to authenticated;

revoke all on function public.staff_list_mandate_intros() from public, anon;
grant execute on function public.staff_list_mandate_intros() to authenticated;

revoke all on function public.staff_decide_mandate_intro(uuid, text) from public, anon;
grant execute on function public.staff_decide_mandate_intro(uuid, text) to authenticated;
