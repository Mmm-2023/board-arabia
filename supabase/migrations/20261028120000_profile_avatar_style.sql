-- Default illustrated picture when a member has no uploaded photo.
-- male or female. Existing rows and new rows default to male.
-- profiles_update_own already limits updates to the signed-in member.
-- This migration does not replace that policy. The column grant is what
-- lets that member read and write avatar_style.
-- Privileges go to authenticated. Anon is not included.

alter table public.profiles
  add column if not exists avatar_style text not null default 'male';

alter table public.profiles drop constraint if exists profiles_avatar_style_check;
alter table public.profiles
  add constraint profiles_avatar_style_check
  check (avatar_style in ('male', 'female'));

revoke select (avatar_style), update (avatar_style) on table public.profiles from public, anon;
grant select (avatar_style) on table public.profiles to authenticated;
grant update (avatar_style) on table public.profiles to authenticated;

create or replace function public.staff_set_avatar_style(p_user_id uuid, p_style text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_style is distinct from 'male' and p_style is distinct from 'female' then
    raise exception 'invalid_style' using errcode = '22023';
  end if;

  if p_user_id is null or not exists (
    select 1 from public.members m where m.user_id = p_user_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set avatar_style = p_style
  where user_id = p_user_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.staff_set_avatar_style(uuid, text) from public, anon;
grant execute on function public.staff_set_avatar_style(uuid, text) to authenticated;


create or replace function public.list_directory()
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
  from public.members m
  where m.is_demo = false
    and m.status in ('invited', 'active')
    and m.seat in ('ksa', 'intl');

  show_demo := private.demo_rows_visible('directory', real_n);

  return coalesce((
    select jsonb_agg(payload order by demo_flag, sort_order, sort_name)
    from (
      select
        false as demo_flag,
        0 as sort_order,
        lower(coalesce(p.full_name, '')) as sort_name,
        jsonb_build_object(
          'id', m.user_id,
          'is_demo', false,
          'full_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'headline', coalesce(p.headline, ''),
          'company', coalesce(p.company, ''),
          'location', coalesce(p.location, ''),
          'sector', coalesce(p.sector_tags[1], ''),
          'sectors', coalesce(to_jsonb(p.sector_tags), '[]'::jsonb),
          'vision_themes', coalesce(to_jsonb(p.vision_themes), '[]'::jsonb),
          'availability', p.availability,
          'seat', m.seat,
          'preferred_partner', (m.seat = 'sponsor'),
          'portrait_asset', null,
          'avatar_path', p.avatar_path,
          'avatar_style', coalesce(p.avatar_style, 'male')
        ) as payload
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl', 'sponsor')
      union all
      select
        true,
        d.sort_order,
        lower(d.full_name),
        jsonb_build_object(
          'id', d.id,
          'is_demo', true,
          'full_name', d.full_name,
          'headline', d.headline,
          'company', d.company,
          'location', d.location,
          'sector', d.sector,
          'sectors', jsonb_build_array(d.sector),
          'vision_themes', coalesce(to_jsonb(d.vision_themes), '[]'::jsonb),
          'availability', d.availability,
          'seat', d.seat,
          'preferred_partner', false,
          'portrait_asset', d.portrait_asset,
          'avatar_path', null,
          'avatar_style', 'male'
        )
      from public.directory_entries d
      where d.is_demo
        and show_demo
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_directory() from public, anon;
grant execute on function public.list_directory() to authenticated;

create or replace function public.list_my_intros()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(payload order by sort_at desc)
    from (
      select
        i.requested_at as sort_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'member',
          'direction', case when i.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
          'status', i.status,
          'title', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'detail', concat_ws(
            ' · ',
            nullif(trim(p.headline), ''),
            nullif(trim(p.company), ''),
            nullif(trim(p.location), '')
          ),
          'reason', i.reason,
          'is_demo', private.sample_subject(i.requester_id) or private.sample_subject(i.target_id),
          'subject_id', case when i.requester_id = auth.uid() then i.target_id else i.requester_id end,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
          'created_at', i.requested_at
        ) as payload
      from public.member_intros i
      join public.profiles p
        on p.user_id = case
          when i.requester_id = auth.uid() then i.target_id
          else i.requester_id
        end
      where i.requester_id = auth.uid()
         or i.target_id = auth.uid()

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'mandate',
          'direction', 'outgoing',
          'status', i.status,
          'title', m.sector || ' · ' || m.deal_type,
          'detail', m.geography,
          'reason', '',
          'is_demo', m.is_demo,
          'subject_id', m.id,
          'created_at', i.requested_at
        )
      from public.mandate_intros i
      join public.mandates m on m.id = i.mandate_id
      where i.member_id = auth.uid()

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'real_estate',
          'direction', 'outgoing',
          'status', i.status,
          'title', o.sector || ' · ' || o.city,
          'detail', o.asset_class,
          'reason', '',
          'is_demo', o.is_demo,
          'subject_id', o.id,
          'created_at', i.requested_at
        )
      from public.re_opportunity_intros i
      join public.re_opportunities o on o.id = i.opportunity_id
      where i.member_id = auth.uid()

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'partner',
          'direction', 'outgoing',
          'status', i.status,
          'title', t.name,
          'detail', t.city,
          'reason', '',
          'is_demo', t.is_demo,
          'subject_id', t.id,
          'created_at', i.requested_at
        )
      from public.re_partner_intros i
      join public.re_partners t on t.id = i.partner_id
      where i.member_id = auth.uid()
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_intros() from public, anon;
grant execute on function public.list_my_intros() to authenticated;

create or replace function public.staff_list_all_intros()
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
    select jsonb_agg(payload order by sort_at desc)
    from (
      select
        i.requested_at as sort_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'member',
          'direction', 'outgoing',
          'status', i.status,
          'title', coalesce(nullif(trim(target_profile.full_name), ''), 'Member'),
          'detail', '',
          'requester_name', coalesce(nullif(trim(requester_profile.full_name), ''), 'Member'),
          'target_name', coalesce(nullif(trim(target_profile.full_name), ''), 'Member'),
          'reason', i.reason,
          'is_demo', private.sample_subject(i.requester_id) or private.sample_subject(i.target_id),
          'subject_id', i.target_id,
          'avatar_style', coalesce(target_profile.avatar_style, 'male'),
          'avatar_path', target_profile.avatar_path,
          'created_at', i.requested_at
        ) as payload
      from public.member_intros i
      left join public.profiles requester_profile on requester_profile.user_id = i.requester_id
      left join public.profiles target_profile on target_profile.user_id = i.target_id

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'mandate',
          'direction', 'outgoing',
          'status', i.status,
          'title', m.company_name,
          'detail', m.sector || ' · ' || m.deal_type,
          'requester_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', m.is_demo,
          'subject_id', m.id,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
          'created_at', i.requested_at
        )
      from public.mandate_intros i
      join public.mandates m on m.id = i.mandate_id
      left join public.profiles p on p.user_id = i.member_id

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'real_estate',
          'direction', 'outgoing',
          'status', i.status,
          'title', o.counterparty_name,
          'detail', o.sector || ' · ' || o.city,
          'requester_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', o.is_demo,
          'subject_id', o.id,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
          'created_at', i.requested_at
        )
      from public.re_opportunity_intros i
      join public.re_opportunities o on o.id = i.opportunity_id
      left join public.profiles p on p.user_id = i.member_id

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'partner',
          'direction', 'outgoing',
          'status', i.status,
          'title', t.name,
          'detail', t.city,
          'requester_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', t.is_demo,
          'subject_id', t.id,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
          'created_at', i.requested_at
        )
      from public.re_partner_intros i
      join public.re_partners t on t.id = i.partner_id
      left join public.profiles p on p.user_id = i.member_id
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_all_intros() from public, anon;
grant execute on function public.staff_list_all_intros() to authenticated;


-- Extend the invoker wrappers. The row filters stay in the private definer
-- functions. These views stay security invoker. Anon is not granted.

drop view if exists public.majlis_events_member;
drop view if exists public.majlis_roster;
drop function if exists private.majlis_events_member_rows();
drop function if exists private.majlis_roster_rows();

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
  my_waitlist_position integer,
  host_avatar_style text,
  host_avatar_path text
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
  ) as my_waitlist_position,
  coalesce(host_profile.avatar_style, 'male')::text as host_avatar_style,
  host_profile.avatar_path as host_avatar_path
from public.majlis_events e
left join public.majlis_region_geotag g on g.region = e.region
left join public.profiles host_profile on host_profile.user_id = e.host_member_id
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
  full_name text,
  avatar_style text,
  avatar_path text
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
  p.full_name,
  coalesce(p.avatar_style, 'male')::text as avatar_style,
  p.avatar_path
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
  host_avatar_path
from private.majlis_events_member_rows();

revoke all on table public.majlis_events_member from public, anon, authenticated;
grant select on table public.majlis_events_member to authenticated;

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
  full_name,
  avatar_style,
  avatar_path
from private.majlis_roster_rows();

revoke all on table public.majlis_roster from public, anon, authenticated;
grant select on table public.majlis_roster to authenticated;
