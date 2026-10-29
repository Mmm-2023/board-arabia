-- Public virtual majlis requests.
-- Apply after 20270103120000. The operator applies this file via MCP.
-- Do not apply it from the app, from CI, or with supabase db push.
-- No schedule. This file does not send mail. The master switch is not changed.
-- A free account is required. There is no account-free join token.
-- The public list is a definer projection. The table stays revoked.

alter table public.majlis_applications enable row level security;
alter table public.majlis_applications force row level security;
revoke all on table public.majlis_applications from public, anon, authenticated;

create or replace function private.public_majlis_phone(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.regexp_replace(coalesce(p_raw, ''), '[^0-9+]', '', 'g') ~ '^\+[1-9][0-9]{7,14}$'
    then pg_catalog.regexp_replace(coalesce(p_raw, ''), '[^0-9+]', '', 'g')
    else null
  end;
$$;

revoke all on function private.public_majlis_phone(text) from public, anon, authenticated;

comment on function private.public_majlis_phone(text) is
  'International phone, country code required. Saudi Arabia and the United Kingdom both fit. Empty when the shape is wrong.';

create or replace function private.public_majlis_place(p_event uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_cap integer;
  v_used integer := 0;
  v_left integer;
begin
  select e.capacity into v_cap
  from public.majlis_events e
  where e.id = p_event;

  if v_cap is null or v_cap < 1 then
    return 'open';
  end if;

  if pg_catalog.to_regclass('public.majlis_rsvps') is not null then
    select count(*)::integer into v_used
    from public.majlis_rsvps r
    where r.event_id = p_event
      and r.status = 'registered';
  end if;

  v_used := coalesce(v_used, 0) + coalesce((
    select count(*)::integer
    from public.majlis_applications a
    where a.event_id = p_event
      and a.seat_held
  ), 0);

  if v_used >= v_cap then
    return 'full';
  end if;

  v_left := v_cap - v_used;
  if v_left * 10 <= v_cap then
    return 'few';
  end if;
  return 'open';
end;
$fn$;

revoke all on function private.public_majlis_place(uuid) from public, anon, authenticated;

comment on function private.public_majlis_place(uuid) is
  'open, few, or full. The number of places is not returned.';

-- Same open and founding window members use. Public requests wait until both have passed.
create or replace function private.public_majlis_request_open(
  p_rsvp_opens_at timestamptz,
  p_founding_priority_ends_at timestamptz,
  p_approved_at timestamptz,
  p_now timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_rsvp_opens_at, p_approved_at) is not null
    and p_now >= coalesce(p_rsvp_opens_at, p_approved_at)
    and coalesce(p_founding_priority_ends_at, p_approved_at + interval '48 hours') is not null
    and p_now >= coalesce(p_founding_priority_ends_at, p_approved_at + interval '48 hours');
$$;

revoke all on function private.public_majlis_request_open(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

comment on function private.public_majlis_request_open(timestamptz, timestamptz, timestamptz, timestamptz) is
  'True after member RSVP has opened and the founding priority window has passed. Uses the same fallback as member RSVP.';

create or replace function public.list_public_majlis()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', e.id,
        'title', pg_catalog.regexp_replace(pg_catalog.left(e.title, 160), '@', '', 'g'),
        'description', pg_catalog.regexp_replace(pg_catalog.left(e.description, 500), '@', '', 'g'),
        'region', e.region,
        'focus_tags', e.focus_tags,
        'starts_at', e.starts_at,
        'ends_at', e.ends_at,
        'place', private.public_majlis_place(e.id)
      )
      order by e.starts_at
    )
    from public.majlis_events e
    where e.status = 'published'
      and e.format = 'virtual'
      and e.cancelled_at is null
      and e.ends_at > pg_catalog.now()
      and private.public_majlis_request_open(
        e.rsvp_opens_at,
        e.founding_priority_ends_at,
        e.approved_at,
        pg_catalog.now()
      )
  ), '[]'::jsonb);
$fn$;

revoke all on function public.list_public_majlis() from public;
grant execute on function public.list_public_majlis() to anon, authenticated;

comment on function public.list_public_majlis() is
  'Published virtual majlis that have not ended, after member RSVP is open and the founding priority window has passed. No Meet link, no counts, no names, no emails.';

create or replace function public.submit_own_majlis_application(
  p_event uuid,
  p_snapshot jsonb,
  p_consent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_key text;
  v_hits integer;
  v_window timestamptz;
  v_verified timestamptz;
  v_status text;
  v_snap jsonb;
  v_name text;
  v_phone text;
  v_company text;
  v_role text;
  v_linkedin text;
  v_why text;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if coalesce(p_snapshot->>'company_fax', '') <> '' then
    return pg_catalog.jsonb_build_object('ok', true, 'error_code', '');
  end if;

  if coalesce(btrim(p_consent), '') = '' then
    raise exception 'consent' using errcode = '42501';
  end if;

  v_key := 'majlis:' || auth.uid()::text;
  select hit_count, window_start into v_hits, v_window
  from public.register_rate_limits
  where rate_key = v_key
  for update;

  if not found then
    insert into public.register_rate_limits (rate_key, window_start, hit_count)
    values (v_key, pg_catalog.now(), 1);
  elsif v_window < pg_catalog.now() - interval '1 hour' then
    update public.register_rate_limits
      set window_start = pg_catalog.now(),
          hit_count = 1
      where rate_key = v_key;
  elsif v_hits >= 8 then
    return pg_catalog.jsonb_build_object('ok', true, 'error_code', 'rate_limited');
  else
    update public.register_rate_limits
      set hit_count = v_hits + 1
      where rate_key = v_key;
  end if;

  if not exists (select 1 from public.candidates c where c.user_id = auth.uid()) then
    return pg_catalog.jsonb_build_object('ok', true, 'error_code', '');
  end if;

  v_phone := private.public_majlis_phone(p_snapshot->>'phone');
  if v_phone is null then
    raise exception 'phone' using errcode = '42501';
  end if;

  v_name := pg_catalog.left(btrim(coalesce(p_snapshot->>'full_name', '')), 200);
  v_company := pg_catalog.left(btrim(coalesce(p_snapshot->>'company', '')), 200);
  v_role := pg_catalog.left(btrim(coalesce(p_snapshot->>'role', '')), 80);
  v_linkedin := pg_catalog.left(btrim(coalesce(p_snapshot->>'linkedin', '')), 300);
  v_why := pg_catalog.left(btrim(coalesce(p_snapshot->>'why', '')), 1000);
  if position('@' in v_name || v_phone || v_company || v_role || v_linkedin || v_why) > 0 then
    v_name := regexp_replace(v_name, '@', '', 'g');
    v_phone := regexp_replace(v_phone, '@', '', 'g');
    v_company := regexp_replace(v_company, '@', '', 'g');
    v_role := regexp_replace(v_role, '@', '', 'g');
    v_linkedin := regexp_replace(v_linkedin, '@', '', 'g');
    v_why := regexp_replace(v_why, '@', '', 'g');
  end if;

  if v_name = '' or v_company = '' or v_role = '' then
    raise exception 'missing_fields' using errcode = '42501';
  end if;

  if p_event is null or not exists (
    select 1
    from public.majlis_events e
    where e.id = p_event
      and e.status = 'published'
      and e.format = 'virtual'
      and e.cancelled_at is null
      and e.ends_at > pg_catalog.now()
      and private.public_majlis_request_open(
        e.rsvp_opens_at,
        e.founding_priority_ends_at,
        e.approved_at,
        pg_catalog.now()
      )
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'error_code', '');
  end if;

  v_snap := pg_catalog.jsonb_build_object(
    'full_name', v_name,
    'phone', v_phone,
    'company', v_company,
    'role', v_role,
    'linkedin', v_linkedin,
    'why', v_why
  );

  select c.email_verified_at into v_verified
  from public.candidates c
  where c.user_id = auth.uid();

  v_status := case when v_verified is null then 'received' else 'pending' end;

  insert into public.majlis_applications (
    event_id, user_id, status, form_snapshot, consent_version, verified_at, submitted_at
  )
  values (
    p_event, auth.uid(), v_status, v_snap, pg_catalog.left(btrim(p_consent), 40), v_verified, pg_catalog.now()
  )
  on conflict (event_id, user_id) do update
    set form_snapshot = excluded.form_snapshot,
        consent_version = excluded.consent_version,
        status = case
          when public.majlis_applications.status in ('accepted', 'waitlist', 'rejected', 'cancelled')
            then public.majlis_applications.status
          else excluded.status
        end,
        submitted_at = coalesce(public.majlis_applications.submitted_at, excluded.submitted_at);

  return pg_catalog.jsonb_build_object('ok', true, 'error_code', '');
end;
$fn$;

revoke all on function public.submit_own_majlis_application(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_own_majlis_application(uuid, jsonb, text) to authenticated;

comment on function public.submit_own_majlis_application(uuid, jsonb, text) is
  'Stores the signed-in free account request for a published virtual majlis that has not ended. Phone, company, and role are required. Honeypot and hourly limit. Same ok reply when the event is closed or the account is not a free account. Does not send mail.';
