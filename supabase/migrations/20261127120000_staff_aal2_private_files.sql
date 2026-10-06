-- Staff two-step sign-in and private member files.
-- Apply only after the master admin has enrolled TOTP and signed in at aal2.
-- Applying this file first locks admin out: private.is_staff() requires aal2.
-- Enrol and challenge screens use Auth MFA and do not need this migration.
-- Kept: ai_tool_consents_select_staff and member_avatars_select_staff.
-- Security 3 staff-read audit hook: private.note_staff_shared_read. No audit table here.

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users s
    where s.user_id = auth.uid()
      and s.role in ('staff', 'master')
  )
  and (auth.jwt() ->> 'aal') = 'aal2';
$$;

revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated, service_role;

-- Service-role Edge calls pass the actor after deal_room_session rejects aal1.
-- A direct session is staff only at aal2. list_all_deal_rooms and
-- close_any_deal_room also require p_aal = aal2.
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
  )
  and (
    coalesce(auth.role(), '') = 'service_role'
    or (auth.jwt() ->> 'aal') = 'aal2'
  );
$$;

revoke all on function private.actor_is_staff(uuid) from public, anon, authenticated;

create or replace function private.protect_profile_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if auth.uid() is distinct from old.user_id and private.is_staff() then
    return new;
  end if;

  new.investable_capacity_usd := old.investable_capacity_usd;
  new.fo_aum_usd := old.fo_aum_usd;
  new.turnover_usd := old.turnover_usd;
  new.capacity_currency := old.capacity_currency;
  new.capacity_verified := old.capacity_verified;
  return new;
end;
$$;

revoke all on function private.protect_profile_capacity() from public, anon, authenticated;

-- Latest majlis readers checked staff_users directly. They now use private.is_staff().
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
  coalesce(host_profile.avatar_style, 'male')::text as host_avatar_style,
  host_profile.avatar_path as host_avatar_path
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
  private.is_staff()
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

drop policy if exists majlis_decisions_select_staff on public.majlis_decisions;
create policy majlis_decisions_select_staff on public.majlis_decisions
  for select to authenticated
  using (private.is_staff());

alter table public.due_diligence_decks
  add column if not exists shared_with_admin_at timestamptz;
alter table public.due_diligence_jobs
  add column if not exists shared_with_admin_at timestamptz;
alter table public.due_diligence_reports
  add column if not exists shared_with_admin_at timestamptz;
alter table public.ai_tool_jobs
  add column if not exists shared_with_admin_at timestamptz;
alter table public.ai_tool_outputs
  add column if not exists shared_with_admin_at timestamptz;
alter table public.ai_tool_notes
  add column if not exists shared_with_admin_at timestamptz;

comment on column public.due_diligence_reports.shared_with_admin_at is
  'Set and cleared only by the owner through set_due_diligence_report_admin_share. Security 3 calls private.note_staff_shared_read on a staff read. No audit table in this migration.';
comment on column public.due_diligence_decks.shared_with_admin_at is
  'Deck file share. A report share does not set this. Owner only, through set_due_diligence_deck_admin_share.';
comment on column public.ai_tool_outputs.shared_with_admin_at is
  'Set and cleared only by the owner through set_ai_tool_result_admin_share.';

drop policy if exists due_diligence_decks_select_staff on public.due_diligence_decks;
drop policy if exists due_diligence_jobs_select_staff on public.due_diligence_jobs;
drop policy if exists due_diligence_reports_select_staff on public.due_diligence_reports;
drop policy if exists ai_tool_jobs_select_staff on public.ai_tool_jobs;
drop policy if exists ai_tool_outputs_select_staff on public.ai_tool_outputs;
drop policy if exists ai_tool_notes_select_staff on public.ai_tool_notes;
drop policy if exists due_diligence_decks_storage_select_staff on storage.objects;

create policy due_diligence_decks_select_shared_staff on public.due_diligence_decks
  for select to authenticated
  using (shared_with_admin_at is not null and private.is_staff());

create policy due_diligence_jobs_select_shared_staff on public.due_diligence_jobs
  for select to authenticated
  using (shared_with_admin_at is not null and private.is_staff());

create policy due_diligence_reports_select_shared_staff on public.due_diligence_reports
  for select to authenticated
  using (shared_with_admin_at is not null and private.is_staff());

create policy ai_tool_jobs_select_shared_staff on public.ai_tool_jobs
  for select to authenticated
  using (shared_with_admin_at is not null and private.is_staff());

create policy ai_tool_outputs_select_shared_staff on public.ai_tool_outputs
  for select to authenticated
  using (shared_with_admin_at is not null and private.is_staff());

create policy ai_tool_notes_select_shared_staff on public.ai_tool_notes
  for select to authenticated
  using (shared_with_admin_at is not null and private.is_staff());

create policy due_diligence_decks_storage_select_shared_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'due-diligence-decks'
    and private.is_staff()
    and exists (
      select 1
      from public.due_diligence_decks d
      where d.shared_with_admin_at is not null
        and d.storage_path = name
    )
  );

comment on policy ai_tool_consents_select_staff on public.ai_tool_consents is
  'Kept. Staff may read consent records when private.is_staff() is true (aal2). This is not a member file or an AI result.';

comment on policy member_avatars_select_staff on storage.objects is
  'Kept. Staff may read member avatars when private.is_staff() is true (aal2). Avatars already show in the members directory.';

create or replace function private.note_staff_shared_read(p_table text, p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Security 3 replaces this body with the staff-read audit log.
  -- No audit table in this migration.
  if p_table is null or p_row_id is null then
    return;
  end if;
end;
$$;

comment on function private.note_staff_shared_read(text, uuid) is
  'Security 3 staff-read audit hook. Named on purpose. Do not drop it when the audit table arrives.';

revoke all on function private.note_staff_shared_read(text, uuid) from public, anon, authenticated;

create or replace function public.set_due_diligence_report_admin_share(p_report_id uuid, p_share boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_member uuid;
  found_job uuid;
begin
  if auth.uid() is null or p_share is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select r.member_id, r.job_id into found_member, found_job
  from public.due_diligence_reports r
  where r.id = p_report_id;
  if found_member is null or found_member is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_share then
    update public.due_diligence_reports
      set shared_with_admin_at = coalesce(shared_with_admin_at, now())
      where id = p_report_id and member_id = auth.uid();
    update public.due_diligence_jobs
      set shared_with_admin_at = coalesce(shared_with_admin_at, now())
      where id = found_job and member_id = auth.uid();
  else
    update public.due_diligence_reports
      set shared_with_admin_at = null
      where id = p_report_id and member_id = auth.uid();
    update public.due_diligence_jobs
      set shared_with_admin_at = null
      where id = found_job and member_id = auth.uid();
  end if;
  return jsonb_build_object('ok', true, 'shared', p_share);
end;
$$;

revoke all on function public.set_due_diligence_report_admin_share(uuid, boolean) from public, anon;
grant execute on function public.set_due_diligence_report_admin_share(uuid, boolean) to authenticated;

create or replace function public.set_due_diligence_deck_admin_share(p_deck_id uuid, p_share boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_member uuid;
begin
  if auth.uid() is null or p_share is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select d.member_id into found_member
  from public.due_diligence_decks d
  where d.id = p_deck_id;
  if found_member is null or found_member is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.due_diligence_decks
    set shared_with_admin_at = case when p_share then coalesce(shared_with_admin_at, now()) else null end
    where id = p_deck_id and member_id = auth.uid();
  return jsonb_build_object('ok', true, 'shared', p_share);
end;
$$;

revoke all on function public.set_due_diligence_deck_admin_share(uuid, boolean) from public, anon;
grant execute on function public.set_due_diligence_deck_admin_share(uuid, boolean) to authenticated;

create or replace function public.set_ai_tool_result_admin_share(p_job_id uuid, p_share boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_member uuid;
begin
  if auth.uid() is null or p_share is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select j.member_id into found_member
  from public.ai_tool_jobs j
  where j.id = p_job_id;
  if found_member is null or found_member is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_share then
    update public.ai_tool_jobs
      set shared_with_admin_at = coalesce(shared_with_admin_at, now())
      where id = p_job_id and member_id = auth.uid();
    update public.ai_tool_outputs
      set shared_with_admin_at = coalesce(shared_with_admin_at, now())
      where job_id = p_job_id and member_id = auth.uid();
    update public.ai_tool_notes
      set shared_with_admin_at = coalesce(shared_with_admin_at, now())
      where job_id = p_job_id and member_id = auth.uid();
  else
    update public.ai_tool_jobs set shared_with_admin_at = null where id = p_job_id and member_id = auth.uid();
    update public.ai_tool_outputs set shared_with_admin_at = null where job_id = p_job_id and member_id = auth.uid();
    update public.ai_tool_notes set shared_with_admin_at = null where job_id = p_job_id and member_id = auth.uid();
  end if;
  return jsonb_build_object('ok', true, 'shared', p_share);
end;
$$;

revoke all on function public.set_ai_tool_result_admin_share(uuid, boolean) from public, anon;
grant execute on function public.set_ai_tool_result_admin_share(uuid, boolean) to authenticated;

create or replace function public.own_admin_share_state(p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  report_at timestamptz;
  deck_at timestamptz;
  deck uuid;
  job_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind = 'due_diligence_report' then
    select r.shared_with_admin_at, d.shared_with_admin_at, d.id
      into report_at, deck_at, deck
    from public.due_diligence_reports r
    join public.due_diligence_decks d on d.id = r.deck_id
    where r.id = p_id and r.member_id = auth.uid();
    if not found then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'shared', report_at is not null,
      'deck_shared', deck_at is not null,
      'deck_id', deck
    );
  end if;
  if p_kind = 'ai_tool_job' then
    select j.shared_with_admin_at into job_at
    from public.ai_tool_jobs j
    where j.id = p_id and j.member_id = auth.uid();
    if not found then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    return jsonb_build_object('shared', job_at is not null);
  end if;
  raise exception 'not_allowed' using errcode = '42501';
end;
$$;

revoke all on function public.own_admin_share_state(text, uuid) from public, anon;
grant execute on function public.own_admin_share_state(text, uuid) to authenticated;

create or replace function public.staff_private_work_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  deck_count integer;
  report_count integer;
  report_shared integer;
  output_count integer;
  output_shared integer;
  note_count integer;
  dd_jobs jsonb;
  ai_jobs jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select count(*)::integer into deck_count from public.due_diligence_decks;
  select count(*)::integer into report_count from public.due_diligence_reports;
  select count(*)::integer into report_shared from public.due_diligence_reports where shared_with_admin_at is not null;
  select count(*)::integer into output_count from public.ai_tool_outputs;
  select count(*)::integer into output_shared from public.ai_tool_outputs where shared_with_admin_at is not null;
  select count(*)::integer into note_count from public.ai_tool_notes;
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into dd_jobs
  from (
    select status, count(*)::integer as n
    from public.due_diligence_jobs
    group by status
  ) s;
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into ai_jobs
  from (
    select status, count(*)::integer as n
    from public.ai_tool_jobs
    group by status
  ) s;
  return jsonb_build_object(
    'due_diligence_decks', deck_count,
    'due_diligence_jobs', dd_jobs,
    'due_diligence_reports', report_count,
    'due_diligence_reports_shared', report_shared,
    'ai_tool_jobs', ai_jobs,
    'ai_tool_outputs', output_count,
    'ai_tool_outputs_shared', output_shared,
    'ai_tool_notes', note_count
  );
end;
$$;

revoke all on function public.staff_private_work_counts() from public, anon;
grant execute on function public.staff_private_work_counts() to authenticated;

drop function if exists public.list_all_deal_rooms(uuid);
create or replace function public.list_all_deal_rooms(p_actor uuid, p_aal text)
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
  if coalesce(p_aal, '') is distinct from 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
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

revoke all on function public.list_all_deal_rooms(uuid, text) from public, anon, authenticated;
grant execute on function public.list_all_deal_rooms(uuid, text) to service_role;

drop function if exists public.close_any_deal_room(uuid, uuid);
create or replace function public.close_any_deal_room(p_actor uuid, p_aal text, p_room_id uuid)
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
  if coalesce(p_aal, '') is distinct from 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
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

revoke all on function public.close_any_deal_room(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.close_any_deal_room(uuid, text, uuid) to service_role;
