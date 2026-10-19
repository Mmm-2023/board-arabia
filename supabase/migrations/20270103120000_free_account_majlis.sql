-- MJ-3a free accounts. Reuse candidate rows. Do not add a tier.
-- Apply this file only, and only after 20270102120000 when that migration exists.
-- Do not apply it from the app, from CI, or against a live database from this PR.
-- The operator applies it via MCP. No schedule is created here. This file does not send mail.
-- LEGAL CHANGE: a free account with a majlis request is kept 12 months after
-- the last majlis, or 12 months after rejection when none was accepted.

-- caller_sees_member_card used to be true for every signed-in user who is not
-- a partner. Callers that already require a live member stay as they are.
-- Reviewed callers: list_directory, search_deal_room_directory,
-- list_my_intro_suggestions, board seat counts, the weekly digest and its
-- sections, and the partner directory opt-in policies. A free account has no
-- members row, so the helper is now false for that account.

create or replace function private.caller_sees_member_card(p_member pg_catalog.uuid)
returns pg_catalog.bool
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_member is not null
    and (
      private.is_staff()
      or (
        exists (
          select 1
          from public.members self
          where self.user_id = auth.uid()
            and self.status in ('invited', 'active')
        )
        and (
          not private.is_sponsor(auth.uid())
          or p_member = auth.uid()
          or exists (
            select 1
            from public.members m
            where m.user_id = p_member
              and m.show_card_to_sponsors
              and coalesce(m.directory_hidden, false) = false
          )
        )
      )
    );
$$;

revoke all on function private.caller_sees_member_card(uuid) from public, anon;
grant execute on function private.caller_sees_member_card(uuid) to authenticated;

comment on function private.caller_sees_member_card(uuid) is
  'True for staff, and for a live member. A partner sees self, or a member who opted in and is not directory_hidden. A free account is not a member, so this is false.';

create table if not exists public.majlis_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.majlis_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'received',
  form_snapshot jsonb not null default '{}'::jsonb,
  consent_version text,
  verified_at timestamptz,
  submitted_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  seat_held boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint majlis_applications_status_check check (
    status in ('received', 'pending', 'accepted', 'waitlist', 'rejected', 'cancelled')
  ),
  constraint majlis_applications_snapshot_object check (jsonb_typeof(form_snapshot) = 'object'),
  constraint majlis_applications_no_email check (position('@' in form_snapshot::text) = 0),
  constraint majlis_applications_user_event unique (event_id, user_id)
);

comment on table public.majlis_applications is
  'Own majlis requests for a free account. Review starts only after the Board Arabia email code. Direct table reads are revoked.';

create index if not exists majlis_applications_user_idx
  on public.majlis_applications (user_id);

create index if not exists majlis_applications_event_seat_idx
  on public.majlis_applications (event_id)
  where seat_held;

alter table public.majlis_applications enable row level security;
alter table public.majlis_applications force row level security;
revoke all on table public.majlis_applications from public, anon, authenticated;

create or replace function private.release_majlis_application_seats(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_user_id is null or pg_catalog.to_regclass('public.majlis_applications') is null then
    return;
  end if;

  update public.majlis_applications
    set seat_held = false,
        status = case
          when status in ('received', 'pending', 'accepted', 'waitlist') then 'cancelled'
          else status
        end,
        updated_at = pg_catalog.now()
    where user_id = p_user_id
      and (seat_held or status in ('received', 'pending', 'accepted', 'waitlist'));

  delete from public.majlis_applications
    where user_id = p_user_id;
end;
$fn$;

revoke all on function private.release_majlis_application_seats(uuid) from public, anon, authenticated;

create or replace function private.guard_majlis_application_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_verified timestamptz;
begin
  select c.email_verified_at into v_verified
  from public.candidates c
  where c.user_id = new.user_id;

  -- Board Arabia email code only. auth.users.email_confirmed_at is not read.
  new.verified_at := v_verified;

  if v_verified is null and new.status in ('accepted', 'waitlist') then
    raise exception 'email_unverified' using errcode = '42501';
  end if;

  if v_verified is null and new.status = 'pending' then
    new.status := 'received';
  end if;

  new.seat_held := new.status = 'accepted';
  new.updated_at := pg_catalog.now();
  return new;
end;
$fn$;

revoke all on function private.guard_majlis_application_review() from public, anon, authenticated;

drop trigger if exists majlis_applications_guard_review on public.majlis_applications;
create trigger majlis_applications_guard_review
  before insert or update on public.majlis_applications
  for each row
  execute function private.guard_majlis_application_review();

create or replace function private.promote_majlis_applications_on_verify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if old.email_verified_at is null and new.email_verified_at is not null then
    update public.majlis_applications
      set status = 'pending',
          verified_at = new.email_verified_at
      where user_id = new.user_id
        and status = 'received';
  end if;
  return new;
end;
$fn$;

revoke all on function private.promote_majlis_applications_on_verify() from public, anon, authenticated;

drop trigger if exists candidates_promote_majlis_review on public.candidates;
create trigger candidates_promote_majlis_review
  after update of email_verified_at on public.candidates
  for each row
  execute function private.promote_majlis_applications_on_verify();

create or replace function private.majlis_release_on_anonymise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if old.anonymised_at is null and new.anonymised_at is not null then
    perform private.release_majlis_application_seats(new.user_id);
  end if;
  return new;
end;
$fn$;

revoke all on function private.majlis_release_on_anonymise() from public, anon, authenticated;

drop trigger if exists members_release_majlis_on_anonymise on public.members;
create trigger members_release_majlis_on_anonymise
  after update of anonymised_at on public.members
  for each row
  execute function private.majlis_release_on_anonymise();

create or replace function public.my_majlis_applications()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', a.id,
        'event_id', a.event_id,
        'title', e.title,
        'starts_at', e.starts_at,
        'ends_at', e.ends_at,
        'status', a.status,
        'submitted_at', a.submitted_at
      )
      order by e.starts_at
    )
    from public.majlis_applications a
    join public.majlis_events e on e.id = a.event_id
    where auth.uid() is not null
      and a.user_id = auth.uid()
  ), '[]'::jsonb);
$fn$;

revoke all on function public.my_majlis_applications() from public, anon;
grant execute on function public.my_majlis_applications() to authenticated;

comment on function public.my_majlis_applications() is
  'The signed-in account''s own majlis requests. No other account, no venue, no Join link.';

create or replace function public.majlis_join_for_me(p_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_url text := null;
  v_ok boolean := false;
begin
  if auth.uid() is null or p_event is null then
    return pg_catalog.jsonb_build_object('ok', true, 'join_url', null);
  end if;

  select exists (
    select 1
    from public.majlis_applications a
    join public.candidates c on c.user_id = a.user_id
    join public.majlis_events e on e.id = a.event_id
    where a.user_id = auth.uid()
      and a.event_id = p_event
      and a.status = 'accepted'
      and c.email_verified_at is not null
      and e.status is distinct from 'cancelled'
      and e.ends_at > pg_catalog.now()
  ) into v_ok;

  if not v_ok then
    return pg_catalog.jsonb_build_object('ok', true, 'join_url', null);
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'majlis_events'
      and column_name in ('google_meet_url', 'meet_fallback_url', 'format')
  ) = 3 then
    execute $sql$
      select case
        when format is distinct from 'virtual' then null
        else coalesce(nullif(btrim(google_meet_url), ''), nullif(btrim(meet_fallback_url), ''))
      end
      from public.majlis_events
      where id = $1
    $sql$ into v_url using p_event;
  end if;

  if v_url is null or v_url !~ '^https://meet\.google\.com/[a-z0-9-]{3,64}$' then
    v_url := null;
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'join_url', v_url);
end;
$fn$;

revoke all on function public.majlis_join_for_me(uuid) from public, anon;
grant execute on function public.majlis_join_for_me(uuid) to authenticated;

comment on function public.majlis_join_for_me(uuid) is
  'Join link for the signed-in free account when that majlis request is accepted and the Board Arabia email code is confirmed. Same shape when there is no link.';

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

  if p_event is null or not exists (
    select 1
    from public.majlis_events e
    where e.id = p_event
      and e.status = 'published'
      and e.ends_at > pg_catalog.now()
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'error_code', '');
  end if;

  v_name := pg_catalog.left(btrim(coalesce(p_snapshot->>'full_name', '')), 200);
  v_phone := pg_catalog.left(btrim(coalesce(p_snapshot->>'phone', '')), 32);
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
  'Stores the signed-in free account request. A request stays out of review until the Board Arabia email code is confirmed. Honeypot and hourly limit. Same ok reply. Does not send mail.';

create or replace function public.review_majlis_application(p_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_app public.majlis_applications%rowtype;
  v_verified timestamptz;
  v_decision text;
  v_cap integer;
  v_used integer := 0;
  v_event uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_decision not in ('accepted', 'waitlist', 'rejected') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_app
  from public.majlis_applications
  where id = p_id
  for update;

  if v_app.id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select c.email_verified_at into v_verified
  from public.candidates c
  where c.user_id = v_app.user_id;

  if v_verified is null then
    raise exception 'email_unverified' using errcode = '42501';
  end if;

  v_decision := p_decision;
  v_event := v_app.event_id;

  if v_decision = 'accepted' then
    select e.capacity into v_cap
    from public.majlis_events e
    where e.id = v_event
    for update;

    if pg_catalog.to_regclass('public.majlis_rsvps') is not null then
      select count(*)::integer into v_used
      from public.majlis_rsvps r
      where r.event_id = v_event
        and r.status = 'registered';
    end if;

    v_used := coalesce(v_used, 0) + coalesce((
      select count(*)::integer
      from public.majlis_applications a
      where a.event_id = v_event
        and a.status = 'accepted'
        and a.id is distinct from v_app.id
    ), 0);

    if v_cap is not null and v_used >= v_cap then
      v_decision := 'waitlist';
    end if;
  end if;

  update public.majlis_applications
    set status = v_decision,
        decided_by = auth.uid(),
        decided_at = pg_catalog.now(),
        verified_at = v_verified
    where id = v_app.id;

  return pg_catalog.jsonb_build_object('ok', true, 'status', v_decision);
end;
$fn$;

revoke all on function public.review_majlis_application(uuid, text) from public, anon;
grant execute on function public.review_majlis_application(uuid, text) to authenticated;

comment on function public.review_majlis_application(uuid, text) is
  'Staff decision. Accept and waitlist are blocked until the Board Arabia email code is confirmed. Does not send mail.';

create or replace function public.prepare_candidate_delete(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  cand public.candidates%rowtype;
  analytics text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.members m where m.user_id = p_user_id) then
    return pg_catalog.jsonb_build_object('status', 'member');
  end if;

  if exists (select 1 from public.staff_users s where s.user_id = p_user_id) then
    return pg_catalog.jsonb_build_object('status', 'staff');
  end if;

  select * into cand from public.candidates where user_id = p_user_id for update;
  if cand.user_id is null then
    return pg_catalog.jsonb_build_object('status', 'missing');
  end if;

  if cand.email_verified_at is null
     and cand.request_state = 'open'
     and cand.invite_token_id is not null
  then
    perform private.return_applied_invite(cand.invite_token_id);
  end if;

  perform private.enqueue_member_notice(
    'security_deletion',
    p_user_id,
    p_user_id,
    pg_catalog.jsonb_build_object('user_id', p_user_id)
  );

  analytics := cand.analytics_id;
  if analytics is not null and pg_catalog.strpos(analytics, '@') = 0 then
    insert into public.retention_posthog_queue (analytics_id)
    values (analytics)
    on conflict (analytics_id) do nothing;
  end if;

  perform private.release_majlis_application_seats(p_user_id);

  delete from public.candidate_events where candidate_user_id = p_user_id;
  delete from public.candidate_notes where candidate_user_id = p_user_id;
  delete from auth.users where id = p_user_id;

  return pg_catalog.jsonb_build_object('status', 'ok', 'analytics_id', analytics);
end;
$fn$;

revoke all on function public.prepare_candidate_delete(uuid) from public, anon, authenticated;
grant execute on function public.prepare_candidate_delete(uuid) to service_role;

comment on function public.email_recipients(uuid) is
  'Eligible members only. A free account has no member row, so it is not a newsletter recipient. Transactional mail is separate. Does not send mail.';

create or replace function public.retention_sweep_plan(p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  unverified uuid[];
  never_submitted uuid[];
  decided uuid[];
  applications uuid[];
  members uuid[];
  invites uuid[];
  reminders uuid[];
  consent_ids uuid[];
  all_ids uuid[];
  event_count int := 0;
  cache_count int := 0;
  returned_count int := 0;
  uid uuid;
  invite_id uuid;
  retention_days int := 30;
  ai_jobs uuid[] := '{}';
  ai_due_files text[] := '{}';
  ai_queued_files text[] := '{}';
  ai_files text[] := '{}';
  dd_decks uuid[] := '{}';
  dd_jobs uuid[] := '{}';
  dd_reports uuid[] := '{}';
  dd_due_files text[] := '{}';
  dd_queued_files text[] := '{}';
  dd_files text[] := '{}';
  access_ids uuid[] := '{}';
  majlis_due uuid[] := '{}';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(array_agg(user_id), '{}') into unverified
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is null
      and c.created_at < now() - interval '7 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
    order by c.created_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into never_submitted
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is not null
      and c.created_at < now() - interval '120 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
      and not exists (select 1 from public.majlis_applications app where app.user_id = c.user_id)
    order by c.created_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into decided
  from (
    select c.user_id
    from public.candidates c
    where c.request_state in ('declined', 'closed')
      and c.decided_at is not null
      and c.decided_at < now() - interval '12 months'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
    order by c.decided_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into reminders
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is not null
      and c.retention_reminded_at is null
      and c.created_at <= now() - interval '90 days'
      and c.created_at > now() - interval '120 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.majlis_applications app where app.user_id = c.user_id)
    order by c.created_at
    limit 200
  ) due;

  -- LEGAL CHANGE: 12 months after your last majlis, or after rejection when none was accepted.
  -- Cancelled-only accounts go 12 months after the last update.
  select coalesce(array_agg(user_id), '{}') into majlis_due
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and exists (select 1 from public.majlis_applications app where app.user_id = c.user_id)
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
      and not exists (
        select 1 from public.majlis_applications open_app
        where open_app.user_id = c.user_id
          and open_app.status in ('received', 'pending')
      )
      and (
        (
          exists (
            select 1 from public.majlis_applications acc
            where acc.user_id = c.user_id
              and acc.status in ('accepted', 'waitlist')
          )
          and not exists (
            select 1
            from public.majlis_applications acc
            join public.majlis_events e on e.id = acc.event_id
            where acc.user_id = c.user_id
              and acc.status in ('accepted', 'waitlist')
              and e.ends_at > now() - interval '12 months'
          )
        )
        or (
          not exists (
            select 1 from public.majlis_applications acc
            where acc.user_id = c.user_id
              and acc.status in ('accepted', 'waitlist')
          )
          and (
            select max(rej.decided_at)
            from public.majlis_applications rej
            where rej.user_id = c.user_id
              and rej.status = 'rejected'
          ) < now() - interval '12 months'
        )
        or (
          not exists (
            select 1 from public.majlis_applications other
            where other.user_id = c.user_id
              and other.status in ('accepted', 'waitlist', 'rejected')
          )
          and (
            select max(can.updated_at)
            from public.majlis_applications can
            where can.user_id = c.user_id
              and can.status = 'cancelled'
          ) < now() - interval '12 months'
        )
      )
    order by c.created_at
    limit 500
  ) due_majlis;

  select coalesce(array_agg(id), '{}') into applications
  from (
    select a.id
    from public.applications a
    where a.status in ('rejected', 'declined')
      and a.decision_at is not null
      and a.decision_at < now() - interval '12 months'
      and not exists (select 1 from public.members m where m.application_id = a.id)
    order by a.decision_at
    limit 500
  ) old_apps;

  select coalesce(array_agg(user_id), '{}') into members
  from (
    select m.user_id
    from public.members m
    where m.left_at is not null
      and m.left_at < now() - interval '24 months'
      and m.legal_hold = false
      and m.anonymised_at is null
    order by m.left_at
    limit 500
  ) gone;

  select coalesce(array_agg(id), '{}') into consent_ids
  from (
    select cl.id
    from public.consent_log cl
    where cl.created_at < now() - interval '13 months'
    order by cl.created_at
    limit 2000
  ) old_consent;

  select coalesce(array_agg(c.invite_token_id), '{}') into invites
  from public.candidates c
  where c.user_id = any(unverified)
    and c.invite_token_id is not null
    and c.request_state = 'open'
    and c.email_verified_at is null
    and exists (
      select 1 from public.member_invites i
      where i.id = c.invite_token_id
        and i.status = 'applied'
    );

  select s.retention_days into retention_days
  from public.ai_tool_settings s
  where s.id;
  if retention_days is null or retention_days < 1 then
    retention_days := 30;
  end if;

  select coalesce(array_agg(due.id), '{}'), coalesce(array_agg(due.storage_path), '{}')
    into ai_jobs, ai_due_files
  from (
    select j.id, j.storage_path
    from public.ai_tool_jobs j
    where j.created_at < now() - make_interval(days => retention_days)
    order by j.created_at
    limit 500
  ) due;

  select coalesce(array_agg(q.storage_path), '{}') into ai_queued_files
  from (
    select storage_path
    from public.ai_tool_file_purge
    order by created_at
    limit 500
  ) q;

  select coalesce(array_agg(distinct path), '{}') into ai_files
  from (
    select unnest(coalesce(ai_due_files, '{}'::text[]) || coalesce(ai_queued_files, '{}'::text[])) as path
  ) paths
  where path is not null and path <> '';

  select coalesce(array_agg(due.id), '{}'), coalesce(array_agg(due.storage_path), '{}')
    into dd_decks, dd_due_files
  from (
    select d.id, d.storage_path
    from public.due_diligence_decks d
    where d.created_at < now() - make_interval(days => retention_days)
    order by d.created_at
    limit 500
  ) due;

  select coalesce(array_agg(due.id), '{}') into dd_jobs
  from (
    select j.id
    from public.due_diligence_jobs j
    where j.created_at < now() - make_interval(days => retention_days)
    order by j.created_at
    limit 500
  ) due;

  select coalesce(array_agg(due.id), '{}') into dd_reports
  from (
    select r.id
    from public.due_diligence_reports r
    where r.created_at < now() - make_interval(days => retention_days)
    order by r.created_at
    limit 500
  ) due;

  select coalesce(array_agg(q.storage_path), '{}') into dd_queued_files
  from (
    select storage_path
    from public.due_diligence_file_purge
    order by created_at
    limit 500
  ) q;

  select coalesce(array_agg(distinct path), '{}') into dd_files
  from (
    select unnest(coalesce(dd_due_files, '{}'::text[]) || coalesce(dd_queued_files, '{}'::text[])) as path
  ) paths
  where path is not null and path <> '';

  select coalesce(array_agg(id), '{}') into access_ids
  from (
    select l.id
    from public.staff_access_log l
    where l.created_at < now() - interval '13 months'
    order by l.created_at
    limit 2000
  ) old_access;

  all_ids := unverified || never_submitted || decided || majlis_due;

  select count(*)::int into event_count
  from public.candidate_events e
  where e.candidate_user_id = any(all_ids);

  if to_regclass('public.marketing_stats_cache') is not null then
    execute $cache$
      select count(*)::int from public.marketing_stats_cache
      where created_at < now() - interval '24 hours'
    $cache$ into cache_count;
  end if;

  if p_apply then
    insert into public.ai_tool_file_purge (storage_path)
    select distinct path
    from unnest(coalesce(ai_due_files, '{}'::text[])) as path
    where path is not null and path <> ''
    on conflict (storage_path) do nothing;

    delete from public.ai_tool_outputs where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_notes where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_consents where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_jobs where id = any(coalesce(ai_jobs, '{}'::uuid[]));

    insert into public.due_diligence_file_purge (storage_path)
    select distinct path
    from unnest(coalesce(dd_due_files, '{}'::text[])) as path
    where path is not null and path <> ''
    on conflict (storage_path) do nothing;

    delete from public.due_diligence_reports
    where id = any(coalesce(dd_reports, '{}'::uuid[]))
      or deck_id = any(coalesce(dd_decks, '{}'::uuid[]))
      or job_id = any(coalesce(dd_jobs, '{}'::uuid[]));
    delete from public.due_diligence_jobs
    where id = any(coalesce(dd_jobs, '{}'::uuid[]))
      or deck_id = any(coalesce(dd_decks, '{}'::uuid[]));
    delete from public.due_diligence_decks
    where id = any(coalesce(dd_decks, '{}'::uuid[]));

    delete from public.staff_access_log
    where id = any(coalesce(access_ids, '{}'::uuid[]));

    foreach uid in array unverified loop
      select c.invite_token_id into invite_id
      from public.candidates c
      where c.user_id = uid
        and c.request_state = 'open'
        and c.email_verified_at is null;
      if invite_id is not null and private.return_applied_invite(invite_id) then
        returned_count := returned_count + 1;
      end if;
    end loop;

    insert into public.retention_posthog_queue (analytics_id)
    select distinct c.analytics_id
    from public.candidates c
    where c.user_id = any(all_ids)
      and c.analytics_id is not null
      and position('@' in c.analytics_id) = 0
    on conflict (analytics_id) do nothing;

    delete from public.candidate_events where candidate_user_id = any(all_ids);
    delete from public.candidate_notes where candidate_user_id = any(all_ids);
    update public.majlis_applications
      set seat_held = false,
          status = case
            when status in ('received', 'pending', 'accepted', 'waitlist') then 'cancelled'
            else status
          end
      where user_id = any(all_ids);
    delete from public.majlis_applications
      where user_id = any(all_ids);

    delete from auth.users u
    where u.id = any(all_ids)
      and not exists (select 1 from public.members m where m.user_id = u.id)
      and not exists (select 1 from public.staff_users s where s.user_id = u.id);

    delete from public.applications a
    where a.id = any(applications);

    update public.members m
    set email = 'retired+' || m.user_id::text || '@example.com',
        anonymised_at = now()
    where m.user_id = any(members);

    update auth.users u
    set email = 'retired+' || u.id::text || '@example.com',
        raw_user_meta_data = '{}'::jsonb
    where u.id = any(members);

    update public.profiles p
    set full_name = 'Retired member',
        headline = null,
        company = null,
        location = null,
        linkedin_url = null,
        bio = null,
        phone = null,
        investable_capacity_usd = null,
        fo_aum_usd = null,
        turnover_usd = null
    where p.user_id = any(members);

    perform public.purge_expired_consent_log();

    if to_regclass('public.marketing_stats_cache') is not null then
      execute $cache$
        delete from public.marketing_stats_cache
        where created_at < now() - interval '24 hours'
      $cache$;
    end if;
  end if;

  return jsonb_build_object(
    'unverified', to_jsonb(unverified),
    'never_submitted', to_jsonb(never_submitted),
    'decided', to_jsonb(decided),
    'majlis_due', to_jsonb(majlis_due),
    'applications', to_jsonb(applications),
    'members', to_jsonb(members),
    'invites', to_jsonb(invites),
    'reminders', to_jsonb(reminders),
    'consent', to_jsonb(consent_ids),
    'events', event_count,
    'cache', cache_count,
    'invites_returned', returned_count,
    'ai_tool_jobs', to_jsonb(ai_jobs),
    'ai_tool_files', to_jsonb(ai_files),
    'ai_tool_retention_days', retention_days,
    'dd_decks', to_jsonb(dd_decks),
    'dd_jobs', to_jsonb(dd_jobs),
    'dd_reports', to_jsonb(dd_reports),
    'dd_files', to_jsonb(dd_files),
    'staff_access_log', to_jsonb(access_ids)
  );
end;
$$;

revoke all on function public.retention_sweep_plan(boolean) from public, anon, authenticated;
grant execute on function public.retention_sweep_plan(boolean) to service_role;

comment on function public.retention_sweep_plan(boolean) is
  'Retention plan. p_apply false lists rows. p_apply true deletes unverified sign-ups at 7 days, confirmed accounts that never submit at 120 days, and free accounts with a majlis request 12 months after your last majlis or after rejection. Cancelled-only accounts go 12 months after the last update. LEGAL CHANGE. Declined or closed requests and legacy applications go at 12 months. Members and staff are not deleted. Does not send mail.';

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
  accepted_free int := 0;
  seats_used int := 0;
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

  select count(*) into accepted_free
  from public.majlis_applications
  where event_id = p_event and status = 'accepted';

  seats_used := registered_n + coalesce(accepted_free, 0);

  if p_action = 'promote' then
    if not has_row or existing.status is distinct from 'waitlist' then
      raise exception 'not_waitlist' using errcode = '42501';
    end if;
    if seats_used >= seat_cap then
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
    elsif seats_used < seat_cap then
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

comment on function public.majlis_place_rsvp(uuid, uuid, text) is
  'Service role only. Yes uses capacity and the founding window. Accepted free accounts count toward the cap. A waitlisted request does not hold a seat. Virtual majlis seats stay within 150 people. Maybe and No do not take a seat.';
