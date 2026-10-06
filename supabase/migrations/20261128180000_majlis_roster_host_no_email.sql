-- Host roster privacy.
-- A non-staff host receives name, RSVP status, and waitlist position, and no attendee email.
-- aal2 staff keep email through private.is_staff().
-- Another member, a sponsor, and aal1 staff receive no rows. Anon has no select or execute grant.
-- Independent of Security 4: this file does not change other private functions, search_path repairs, or a master admin guard.
-- It can be applied before or after Security 4, and before or after 20261128120000.
-- Sorts after 20261128120000.

drop view if exists public.majlis_roster;
drop function if exists private.majlis_roster_rows();

create function private.majlis_roster_rows()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
select
  jsonb_build_object(
    'id', r.id,
    'event_id', r.event_id,
    'member_id', r.member_id,
    'status', r.status,
    'waitlist_position', r.waitlist_position,
    'registered_at', r.registered_at,
    'cancelled_at', r.cancelled_at,
    'full_name', p.full_name,
    'avatar_style', coalesce(p.avatar_style, 'male')::text,
    'avatar_path', p.avatar_path
  )
  || case
    when private.is_staff() then jsonb_build_object('email', m.email)
    else '{}'::jsonb
  end
from public.majlis_rsvps r
join public.majlis_events e on e.id = r.event_id
join public.members m on m.user_id = r.member_id
left join public.profiles p on p.user_id = r.member_id
where
  private.is_staff()
  or (
    e.host_member_id = auth.uid()
    and not exists (
      select 1
      from public.staff_users s
      where s.user_id = auth.uid()
    )
    and not exists (
      select 1
      from public.members viewer
      where viewer.user_id = auth.uid()
        and viewer.seat = 'sponsor'
    )
  )
$fn$;

revoke all on function private.majlis_roster_rows() from public, anon;
grant execute on function private.majlis_roster_rows() to authenticated, service_role;

create view public.majlis_roster
with (security_barrier = true, security_invoker = true)
as
select
  (row_data->>'id')::uuid as id,
  (row_data->>'event_id')::uuid as event_id,
  (row_data->>'member_id')::uuid as member_id,
  row_data->>'status' as status,
  nullif(row_data->>'waitlist_position', '')::integer as waitlist_position,
  (row_data->>'registered_at')::timestamptz as registered_at,
  (row_data->>'cancelled_at')::timestamptz as cancelled_at,
  row_data->>'email' as email,
  row_data->>'full_name' as full_name,
  row_data->>'avatar_style' as avatar_style,
  row_data->>'avatar_path' as avatar_path
from private.majlis_roster_rows() as row_data;

revoke all on table public.majlis_roster from public, anon, authenticated;
grant select on table public.majlis_roster to authenticated;

comment on function private.majlis_roster_rows() is
  'Attendee roster. aal2 staff receive an email key. A non-staff host receives the same rows with no email key. Another member, a sponsor, and aal1 staff receive no rows.';
