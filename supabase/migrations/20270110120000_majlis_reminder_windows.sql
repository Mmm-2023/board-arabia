-- Majlis reminders. Adds the one hour and start stamps.
-- t7 stays the window from 7 days out until after 1 day out.
-- t1 stays the window from 1 day out until start.
-- t1h is due when start is 45 to 75 minutes away.
-- live is due from start until 15 minutes after start.
-- Accepted free accounts are included. Pending, rejected, and waitlist are not.
-- A registration made after a t1h or live window has closed is not due.
-- Does not send mail. Does not schedule anything. Does not call Google.
-- Factory does not apply this file. 20270109120000 stays free.
-- Slot 20270110120000.

alter table public.majlis_rsvps
  add column if not exists reminder_t1h_sent_at timestamptz;

alter table public.majlis_rsvps
  add column if not exists reminder_live_sent_at timestamptz;

comment on column public.majlis_rsvps.reminder_t1h_sent_at is
  'Claim time for the one hour reminder. Null until claimed.';

comment on column public.majlis_rsvps.reminder_live_sent_at is
  'Claim time for the start reminder. Null until claimed.';

alter table public.majlis_applications
  add column if not exists reminder_t7_sent_at timestamptz;

alter table public.majlis_applications
  add column if not exists reminder_t1_sent_at timestamptz;

alter table public.majlis_applications
  add column if not exists reminder_t1h_sent_at timestamptz;

alter table public.majlis_applications
  add column if not exists reminder_live_sent_at timestamptz;

comment on column public.majlis_applications.reminder_t7_sent_at is
  'Claim time for the one week reminder to an accepted free account. Null until claimed.';

comment on column public.majlis_applications.reminder_t1_sent_at is
  'Claim time for the one day reminder to an accepted free account. Null until claimed.';

comment on column public.majlis_applications.reminder_t1h_sent_at is
  'Claim time for the one hour reminder to an accepted free account. Null until claimed.';

comment on column public.majlis_applications.reminder_live_sent_at is
  'Claim time for the start reminder to an accepted free account. Null until claimed.';

drop function if exists public.majlis_due_reminders();

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
  capacity int,
  format text,
  meet_ready boolean,
  audience text
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select *
  from (
    (
      select *
      from (
        -- kind t7 member. Window unchanged.
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
          e.capacity,
          e.format,
          (
            case
              when e.format = 'virtual'
                and e.google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              when e.format = 'virtual'
                and e.meet_fallback_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              else false
            end
          ),
          'member'::text
        from public.majlis_rsvps r
        join public.majlis_events e on e.id = r.event_id
        join public.members m on m.user_id = r.member_id
        left join public.profiles p on p.user_id = r.member_id
        where r.status = 'registered'
          and e.status = 'published'
          and r.reminder_t7_sent_at is null
          and e.starts_at > pg_catalog.now() + interval '1 day'
          and e.starts_at <= pg_catalog.now() + interval '7 days'
        union all
        -- kind t7 guest. Same window. Accepted only.
        select
          a.id,
          't7'::text,
          e.id,
          a.user_id,
          private.notice_address(a.user_id),
          null::text,
          e.title,
          e.region,
          e.starts_at,
          e.ends_at,
          e.venue_name,
          e.venue_address,
          e.venue_visibility,
          e.capacity,
          e.format,
          (
            case
              when e.format = 'virtual'
                and e.google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              when e.format = 'virtual'
                and e.meet_fallback_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              else false
            end
          ),
          'guest'::text
        from public.majlis_applications a
        join public.majlis_events e on e.id = a.event_id
        join public.candidates c on c.user_id = a.user_id
        where a.status = 'accepted'
          and c.email_verified_at is not null
          and e.status = 'published'
          and a.reminder_t7_sent_at is null
          and e.starts_at > pg_catalog.now() + interval '1 day'
          and e.starts_at <= pg_catalog.now() + interval '7 days'
          and private.notice_address(a.user_id) is not null
        union all
        -- kind t1 member. Window unchanged.
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
          e.capacity,
          e.format,
          (
            case
              when e.format = 'virtual'
                and e.google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              when e.format = 'virtual'
                and e.meet_fallback_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              else false
            end
          ),
          'member'::text
        from public.majlis_rsvps r
        join public.majlis_events e on e.id = r.event_id
        join public.members m on m.user_id = r.member_id
        left join public.profiles p on p.user_id = r.member_id
        where r.status = 'registered'
          and e.status = 'published'
          and r.reminder_t1_sent_at is null
          and e.starts_at > pg_catalog.now()
          and e.starts_at <= pg_catalog.now() + interval '1 day'
        union all
        -- kind t1 guest. Same window. Accepted only.
        select
          a.id,
          't1'::text,
          e.id,
          a.user_id,
          private.notice_address(a.user_id),
          null::text,
          e.title,
          e.region,
          e.starts_at,
          e.ends_at,
          e.venue_name,
          e.venue_address,
          e.venue_visibility,
          e.capacity,
          e.format,
          (
            case
              when e.format = 'virtual'
                and e.google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              when e.format = 'virtual'
                and e.meet_fallback_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              else false
            end
          ),
          'guest'::text
        from public.majlis_applications a
        join public.majlis_events e on e.id = a.event_id
        join public.candidates c on c.user_id = a.user_id
        where a.status = 'accepted'
          and c.email_verified_at is not null
          and e.status = 'published'
          and a.reminder_t1_sent_at is null
          and e.starts_at > pg_catalog.now()
          and e.starts_at <= pg_catalog.now() + interval '1 day'
          and private.notice_address(a.user_id) is not null
      ) older
      limit 80
    )
    union all
    (
      select *
      from (
        -- kind t1h member.
        select
          r.id,
          't1h'::text,
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
          e.capacity,
          e.format,
          (
            case
              when e.format = 'virtual'
                and e.google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              when e.format = 'virtual'
                and e.meet_fallback_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              else false
            end
          ),
          'member'::text
        from public.majlis_rsvps r
        join public.majlis_events e on e.id = r.event_id
        join public.members m on m.user_id = r.member_id
        left join public.profiles p on p.user_id = r.member_id
        where r.status = 'registered'
          and e.status = 'published'
          and r.reminder_t1h_sent_at is null
          and e.starts_at >= pg_catalog.now() + interval '45 minutes'
          and e.starts_at <= pg_catalog.now() + interval '75 minutes'
          and r.registered_at <= e.starts_at - interval '45 minutes'
        union all
        -- kind t1h guest.
        select
          a.id,
          't1h'::text,
          e.id,
          a.user_id,
          private.notice_address(a.user_id),
          null::text,
          e.title,
          e.region,
          e.starts_at,
          e.ends_at,
          e.venue_name,
          e.venue_address,
          e.venue_visibility,
          e.capacity,
          e.format,
          (
            case
              when e.format = 'virtual'
                and e.google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              when e.format = 'virtual'
                and e.meet_fallback_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              else false
            end
          ),
          'guest'::text
        from public.majlis_applications a
        join public.majlis_events e on e.id = a.event_id
        join public.candidates c on c.user_id = a.user_id
        where a.status = 'accepted'
          and c.email_verified_at is not null
          and e.status = 'published'
          and a.reminder_t1h_sent_at is null
          and e.starts_at >= pg_catalog.now() + interval '45 minutes'
          and e.starts_at <= pg_catalog.now() + interval '75 minutes'
          and coalesce(a.decided_at, a.submitted_at, a.created_at) <= e.starts_at - interval '45 minutes'
          and private.notice_address(a.user_id) is not null
        union all
        -- kind live member.
        select
          r.id,
          'live'::text,
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
          e.capacity,
          e.format,
          (
            case
              when e.format = 'virtual'
                and e.google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              when e.format = 'virtual'
                and e.meet_fallback_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              else false
            end
          ),
          'member'::text
        from public.majlis_rsvps r
        join public.majlis_events e on e.id = r.event_id
        join public.members m on m.user_id = r.member_id
        left join public.profiles p on p.user_id = r.member_id
        where r.status = 'registered'
          and e.status = 'published'
          and r.reminder_live_sent_at is null
          and e.starts_at <= pg_catalog.now()
          and e.starts_at >= pg_catalog.now() - interval '15 minutes'
          and r.registered_at <= e.starts_at + interval '15 minutes'
        union all
        -- kind live guest.
        select
          a.id,
          'live'::text,
          e.id,
          a.user_id,
          private.notice_address(a.user_id),
          null::text,
          e.title,
          e.region,
          e.starts_at,
          e.ends_at,
          e.venue_name,
          e.venue_address,
          e.venue_visibility,
          e.capacity,
          e.format,
          (
            case
              when e.format = 'virtual'
                and e.google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              when e.format = 'virtual'
                and e.meet_fallback_url ~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then true
              else false
            end
          ),
          'guest'::text
        from public.majlis_applications a
        join public.majlis_events e on e.id = a.event_id
        join public.candidates c on c.user_id = a.user_id
        where a.status = 'accepted'
          and c.email_verified_at is not null
          and e.status = 'published'
          and a.reminder_live_sent_at is null
          and e.starts_at <= pg_catalog.now()
          and e.starts_at >= pg_catalog.now() - interval '15 minutes'
          and coalesce(a.decided_at, a.submitted_at, a.created_at) <= e.starts_at + interval '15 minutes'
          and private.notice_address(a.user_id) is not null
      ) newer
      limit 80
    )
  ) due;
end;
$fn$;

revoke all on function public.majlis_due_reminders() from public, anon, authenticated;
grant execute on function public.majlis_due_reminders() to service_role;

comment on function public.majlis_due_reminders() is
  'Service role only. t7 and t1 windows are unchanged. t1h is 45 to 75 minutes before start. live runs from start until 15 minutes after start. Accepted free accounts are included. Does not send mail.';

create or replace function public.majlis_claim_reminder(p_rsvp uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  claimed uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind = 't7' then
    update public.majlis_rsvps
      set reminder_t7_sent_at = pg_catalog.now()
      where id = p_rsvp
        and status = 'registered'
        and reminder_t7_sent_at is null
      returning id into claimed;
    if claimed is null then
      update public.majlis_applications
        set reminder_t7_sent_at = pg_catalog.now()
        where id = p_rsvp
          and status = 'accepted'
          and reminder_t7_sent_at is null
        returning id into claimed;
    end if;
  elsif p_kind = 't1' then
    update public.majlis_rsvps
      set reminder_t1_sent_at = pg_catalog.now()
      where id = p_rsvp
        and status = 'registered'
        and reminder_t1_sent_at is null
      returning id into claimed;
    if claimed is null then
      update public.majlis_applications
        set reminder_t1_sent_at = pg_catalog.now()
        where id = p_rsvp
          and status = 'accepted'
          and reminder_t1_sent_at is null
        returning id into claimed;
    end if;
  elsif p_kind = 't1h' then
    update public.majlis_rsvps
      set reminder_t1h_sent_at = pg_catalog.now()
      where id = p_rsvp
        and status = 'registered'
        and reminder_t1h_sent_at is null
      returning id into claimed;
    if claimed is null then
      update public.majlis_applications
        set reminder_t1h_sent_at = pg_catalog.now()
        where id = p_rsvp
          and status = 'accepted'
          and reminder_t1h_sent_at is null
        returning id into claimed;
    end if;
  elsif p_kind = 'live' then
    update public.majlis_rsvps
      set reminder_live_sent_at = pg_catalog.now()
      where id = p_rsvp
        and status = 'registered'
        and reminder_live_sent_at is null
      returning id into claimed;
    if claimed is null then
      update public.majlis_applications
        set reminder_live_sent_at = pg_catalog.now()
        where id = p_rsvp
          and status = 'accepted'
          and reminder_live_sent_at is null
        returning id into claimed;
    end if;
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  return claimed is not null;
end;
$fn$;

revoke all on function public.majlis_claim_reminder(uuid, text) from public, anon, authenticated;
grant execute on function public.majlis_claim_reminder(uuid, text) to service_role;

comment on function public.majlis_claim_reminder(uuid, text) is
  'Service role only. Stamps one reminder once. A second call returns false. Does not send mail.';

create or replace function public.majlis_release_reminder(p_rsvp uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind = 't7' then
    update public.majlis_rsvps set reminder_t7_sent_at = null where id = p_rsvp;
    update public.majlis_applications set reminder_t7_sent_at = null where id = p_rsvp;
  elsif p_kind = 't1' then
    update public.majlis_rsvps set reminder_t1_sent_at = null where id = p_rsvp;
    update public.majlis_applications set reminder_t1_sent_at = null where id = p_rsvp;
  elsif p_kind = 't1h' then
    update public.majlis_rsvps set reminder_t1h_sent_at = null where id = p_rsvp;
    update public.majlis_applications set reminder_t1h_sent_at = null where id = p_rsvp;
  elsif p_kind = 'live' then
    update public.majlis_rsvps set reminder_live_sent_at = null where id = p_rsvp;
    update public.majlis_applications set reminder_live_sent_at = null where id = p_rsvp;
  else
    raise exception 'bad_kind' using errcode = '22023';
  end if;
end;
$fn$;

revoke all on function public.majlis_release_reminder(uuid, text) from public, anon, authenticated;
grant execute on function public.majlis_release_reminder(uuid, text) to service_role;

comment on function public.majlis_release_reminder(uuid, text) is
  'Service role only. Clears one reminder stamp after a failed send. Does not send mail.';

create or replace function public.service_event_reminder_blocked(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_address text;
  v_hash text;
  v_opt boolean;
  v_have boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user is null then
    return true;
  end if;
  v_address := private.notice_address(p_user);
  if v_address is null or pg_catalog.btrim(v_address) = '' then
    return true;
  end if;
  v_hash := private.email_address_hash(v_address);
  if v_hash is not null and exists (
    select 1
    from public.email_suppressions s
    where s.email_hash = v_hash
      and s.reason in ('hard_bounce', 'complaint', 'admin', 'invalid')
  ) then
    return true;
  end if;
  select p.opted_in into v_opt
  from public.email_preferences p
  where p.user_id = p_user
    and p.category = 'event_reminder';
  v_have := found;
  if v_have and v_opt is false then
    return true;
  end if;
  return false;
end;
$fn$;

revoke all on function public.service_event_reminder_blocked(uuid) from public, anon, authenticated;
grant execute on function public.service_event_reminder_blocked(uuid) to service_role;

comment on function public.service_event_reminder_blocked(uuid) is
  'Service role only. True when the address is missing, suppressed, or event_reminder is turned off. Does not send mail.';
