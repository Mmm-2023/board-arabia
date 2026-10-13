-- Weekly digest. An admin prepares each issue and approves it before a future letter can go out.
-- Sending stays off. This file does not send mail, does not call a mailbox, and does not schedule anything.
-- Apply after 20261209120000_application_answers_at_admission.sql.
-- Factory does not apply migrations.

alter table public.members
  add column if not exists digest_email_opt_in boolean not null default false;

alter table public.members
  add column if not exists digest_unsubscribe_token text;

comment on column public.members.digest_email_opt_in is
  'Member preference for a future weekly letter. Default false. No letter is sent from this column.';

comment on column public.members.digest_unsubscribe_token is
  'Random token stored for a future unsubscribe link. The link is not live. Not granted to the member role.';

revoke all (digest_email_opt_in, digest_unsubscribe_token)
  on table public.members from public, anon, authenticated;

create or replace function private.digest_plain(p_value text, p_max integer)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  scrubbed text;
  digits text;
begin
  scrubbed := pg_catalog.left(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(coalesce(p_value, ''), '@', '', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    case when coalesce(p_max, 0) < 0 then 0 else coalesce(p_max, 0) end
  );
  digits := pg_catalog.regexp_replace(scrubbed, '[^0-9]', '', 'g');
  if pg_catalog.char_length(digits) >= 8
     and scrubbed ~ '[0-9][0-9 ()+.-]{6,}[0-9]' then
    return '';
  end if;
  return scrubbed;
end;
$fn$;

revoke all on function private.digest_plain(text, integer) from public, anon, authenticated;

create or replace function private.members_digest_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.digest_unsubscribe_token is null or pg_catalog.btrim(new.digest_unsubscribe_token) = '' then
    new.digest_unsubscribe_token := encode(extensions.gen_random_bytes(32), 'hex');
  end if;
  return new;
end;
$fn$;

revoke all on function private.members_digest_token() from public, anon, authenticated;

drop trigger if exists members_digest_token_bi on public.members;
create trigger members_digest_token_bi
  before insert on public.members
  for each row execute function private.members_digest_token();

update public.members
set digest_unsubscribe_token = encode(extensions.gen_random_bytes(32), 'hex')
where digest_unsubscribe_token is null;

alter table public.members
  alter column digest_unsubscribe_token set not null;

alter table public.members
  drop constraint if exists members_digest_unsubscribe_token_check;

alter table public.members
  add constraint members_digest_unsubscribe_token_check
  check (digest_unsubscribe_token ~ '^[0-9a-f]{64}$');

create unique index if not exists members_digest_unsubscribe_token_idx
  on public.members (digest_unsubscribe_token);

create or replace function private.digest_week(p_at timestamptz)
returns table (iso_year integer, iso_week integer)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    extract(isoyear from pg_catalog.timezone('UTC', p_at))::integer,
    extract(week from pg_catalog.timezone('UTC', p_at))::integer;
$fn$;

revoke all on function private.digest_week(timestamptz) from public, anon, authenticated;

create or replace function private.digest_when(p_at timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when p_at is null then ''
    else
      pg_catalog.to_char(pg_catalog.timezone('Asia/Riyadh', p_at), 'FMDD')
      || ' '
      || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'])[
        extract(month from pg_catalog.timezone('Asia/Riyadh', p_at))::integer
      ]
      || ' '
      || pg_catalog.to_char(pg_catalog.timezone('Asia/Riyadh', p_at), 'YYYY, HH24:MI')
  end;
$fn$;

revoke all on function private.digest_when(timestamptz) from public, anon, authenticated;

create or replace function private.digest_member_visible(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.members m
    where m.user_id = p_member
      and m.is_demo = false
      and m.anonymised_at is null
      and m.status in ('invited', 'active')
      and m.seat in ('ksa', 'intl', 'sponsor')
      and coalesce(m.directory_hidden, false) = false
      and not private.sample_subject(m.user_id)
  );
$fn$;

revoke all on function private.digest_member_visible(uuid) from public, anon, authenticated;

create or replace function private.digest_venue_for_caller(p_event uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when e.id is null then null
    when e.cancelled_at is not null then null
    when e.ends_at <= pg_catalog.now() and not private.is_staff() then null
    when e.host_member_id = auth.uid() or private.is_staff()
      then nullif(private.digest_plain(e.venue_address, 200), '')
    when e.venue_visibility = 'members_always'
      and e.status = 'published'
      and exists (
        select 1
        from public.members m
        where m.user_id = auth.uid()
          and m.status in ('invited', 'active')
          and m.seat <> 'sponsor'
      )
      then nullif(private.digest_plain(e.venue_address, 200), '')
    when e.venue_visibility = 'members_on_rsvp'
      and exists (
        select 1
        from public.majlis_rsvps r
        where r.event_id = e.id
          and r.member_id = auth.uid()
          and r.status = 'registered'
      )
      then nullif(private.digest_plain(e.venue_address, 200), '')
    else null
  end
  from public.majlis_events e
  where e.id = p_event;
$fn$;

revoke all on function private.digest_venue_for_caller(uuid) from public, anon, authenticated;

create or replace function private.digest_build_payload()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_year integer;
  v_week integer;
  v_members jsonb;
  v_mandates jsonb;
  v_events jsonb;
begin
  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select coalesce(pg_catalog.jsonb_agg(listed.payload order by listed.sort_name), '[]'::jsonb)
    into v_members
  from (
    select
      pg_catalog.lower(coalesce(p.full_name, '')) as sort_name,
      pg_catalog.jsonb_build_object(
        'id', m.user_id,
        'full_name', coalesce(nullif(private.digest_plain(p.full_name, 200), ''), 'Member'),
        'headline', private.digest_plain(p.headline, 160),
        'company', private.digest_plain(p.company, 200),
        'avatar_style', coalesce(nullif(pg_catalog.btrim(p.avatar_style), ''), 'male')
      ) as payload
    from public.members m
    join public.profiles p on p.user_id = m.user_id
    where private.digest_member_visible(m.user_id)
      and extract(isoyear from pg_catalog.timezone('UTC', m.created_at))::integer = v_year
      and extract(week from pg_catalog.timezone('UTC', m.created_at))::integer = v_week
  ) listed;

  select coalesce(pg_catalog.jsonb_agg(listed.payload order by listed.created_at), '[]'::jsonb)
    into v_mandates
  from (
    select
      m.created_at,
      pg_catalog.jsonb_build_object(
        'id', m.id,
        'sector', private.digest_plain(m.sector, 120),
        'deal_type', private.digest_plain(m.deal_type, 80),
        'ticket_band', private.digest_plain(m.ticket_band, 40),
        'geography', private.digest_plain(m.geography, 40),
        'stage', private.digest_plain(m.stage, 40),
        'one_liner', private.digest_plain(m.one_liner, 280)
      ) as payload
    from public.mandates m
    where m.published = true
      and m.is_demo = false
      and not private.sample_subject(m.id)
      and extract(isoyear from pg_catalog.timezone('UTC', m.created_at))::integer = v_year
      and extract(week from pg_catalog.timezone('UTC', m.created_at))::integer = v_week
  ) listed;

  select coalesce(pg_catalog.jsonb_agg(listed.payload order by listed.starts_at), '[]'::jsonb)
    into v_events
  from (
    select
      e.starts_at,
      pg_catalog.jsonb_build_object(
        'id', e.id,
        'title', private.digest_plain(e.title, 160),
        'starts_at', private.digest_when(e.starts_at),
        'region', private.digest_plain(e.region, 80),
        'host_name', coalesce(nullif(private.digest_plain(host_profile.full_name, 200), ''), 'Board Arabia'),
        'venue_address', case
          when e.venue_visibility = 'members_always'
            then nullif(private.digest_plain(e.venue_address, 200), '')
          else null
        end
      ) as payload
    from public.majlis_events e
    left join public.profiles host_profile on host_profile.user_id = e.host_member_id
    where e.status = 'published'
      and e.cancelled_at is null
      and e.starts_at > pg_catalog.now()
  ) listed;

  return pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', v_year,
    'iso_week', v_week,
    'new_members', coalesce(v_members, '[]'::jsonb),
    'new_mandates', coalesce(v_mandates, '[]'::jsonb),
    'upcoming_events', coalesce(v_events, '[]'::jsonb)
  );
end;
$fn$;

revoke all on function private.digest_build_payload() from public, anon, authenticated;

comment on function private.digest_build_payload() is
  'Member-visible sections for the current ISO week. Omits hidden, demo, and sample rows. No contact fields. mail_ready is false.';

create table if not exists public.digest_settings (
  id boolean primary key default true,
  send_enabled boolean not null default false,
  constraint digest_settings_singleton check (id)
);

comment on table public.digest_settings is
  'One row. send_enabled defaults false. No sender reads this row in this change.';

insert into public.digest_settings (id, send_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.digest_settings enable row level security;
alter table public.digest_settings force row level security;

revoke all on table public.digest_settings from public, anon, authenticated, service_role;

drop policy if exists digest_settings_staff on public.digest_settings;
create policy digest_settings_staff
  on public.digest_settings
  for all
  to public
  using (private.is_staff())
  with check (private.is_staff());

create table if not exists public.digest_issues (
  id uuid primary key default gen_random_uuid(),
  iso_year integer not null,
  iso_week integer not null,
  status text not null default 'draft',
  approved_by uuid,
  approved_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint digest_issues_week_unique unique (iso_year, iso_week),
  constraint digest_issues_year_check check (iso_year between 2020 and 2100),
  constraint digest_issues_week_check check (iso_week between 1 and 53),
  constraint digest_issues_status_check check (status in ('draft', 'approved', 'withdrawn')),
  constraint digest_issues_payload_object check (jsonb_typeof(payload) = 'object')
);

comment on table public.digest_issues is
  'One issue per ISO week. Members never read this table. Status draft, approved, or withdrawn.';

alter table public.digest_issues enable row level security;
alter table public.digest_issues force row level security;

revoke all on table public.digest_issues from public, anon, authenticated, service_role;

drop policy if exists digest_issues_staff on public.digest_issues;
create policy digest_issues_staff
  on public.digest_issues
  for all
  to public
  using (private.is_staff())
  with check (private.is_staff());

create table if not exists public.digest_issue_log (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.digest_issues (id) on delete cascade,
  action text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  constraint digest_issue_log_action_check check (action in ('created', 'approved', 'withdrawn'))
);

comment on table public.digest_issue_log is
  'Audit rows for prepare, approve, and withdraw. Staff read them through the issue RPC.';

create index if not exists digest_issue_log_issue_idx
  on public.digest_issue_log (issue_id, created_at);

alter table public.digest_issue_log enable row level security;
alter table public.digest_issue_log force row level security;

revoke all on table public.digest_issue_log from public, anon, authenticated, service_role;

drop policy if exists digest_issue_log_staff on public.digest_issue_log;
create policy digest_issue_log_staff
  on public.digest_issue_log
  for all
  to public
  using (private.is_staff())
  with check (private.is_staff());

create or replace function private.digest_strip_ids(p_rows jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $fn$
  select coalesce((
    select pg_catalog.jsonb_agg(listed.item - 'id' order by listed.ord)
    from pg_catalog.jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
      with ordinality as listed(item, ord)
  ), '[]'::jsonb);
$fn$;

revoke all on function private.digest_strip_ids(jsonb) from public, anon, authenticated;

create or replace function private.digest_preview_intros()
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'full_name', 'Preview member',
      'headline', 'Board director',
      'company', 'Preview Works',
      'reason', 'A sample introduction for this preview.'
    )
  );
$fn$;

revoke all on function private.digest_preview_intros() from public, anon, authenticated;

create or replace function private.digest_with_preview(p_payload jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', p_payload->'iso_year',
    'iso_week', p_payload->'iso_week',
    'new_members', private.digest_strip_ids(p_payload->'new_members'),
    'new_mandates', private.digest_strip_ids(p_payload->'new_mandates'),
    'upcoming_events', private.digest_strip_ids(p_payload->'upcoming_events'),
    'preview_intros', private.digest_preview_intros()
  );
$fn$;

revoke all on function private.digest_with_preview(jsonb) from public, anon, authenticated;

create or replace function public.own_digest_preference()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  opted boolean;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select m.digest_email_opt_in
    into opted
  from public.members m
  where m.user_id = auth.uid()
    and m.status in ('invited', 'active');

  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object('digest_email_opt_in', coalesce(opted, false));
end;
$fn$;

revoke all on function public.own_digest_preference() from public, anon;
grant execute on function public.own_digest_preference() to authenticated;

create or replace function public.set_digest_email_opt_in(p_opt_in boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  next_value boolean;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  next_value := coalesce(p_opt_in, false);

  update public.members
  set digest_email_opt_in = next_value
  where user_id = auth.uid()
    and status in ('invited', 'active');

  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object('digest_email_opt_in', next_value);
end;
$fn$;

revoke all on function public.set_digest_email_opt_in(boolean) from public, anon;
grant execute on function public.set_digest_email_opt_in(boolean) to authenticated;

comment on function public.set_digest_email_opt_in(boolean) is
  'Sets the signed-in member preference only. Does not send mail.';

create or replace function public.my_weekly_digest()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_year integer;
  v_week integer;
  v_base jsonb;
  v_members jsonb;
  v_mandates jsonb;
  v_events jsonb;
  v_suggestions jsonb;
  v_sponsor boolean;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.is_demo = false
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  v_base := private.digest_build_payload();
  v_sponsor := private.is_sponsor(auth.uid()) and not private.is_staff();

  select coalesce(pg_catalog.jsonb_agg(item order by item->>'full_name'), '[]'::jsonb)
    into v_members
  from pg_catalog.jsonb_array_elements(coalesce(v_base->'new_members', '[]'::jsonb)) item
  where (item->>'id') ~ '^[0-9a-fA-F-]{36}$'
    and (item->>'id')::uuid is distinct from auth.uid()
    and private.digest_member_visible((item->>'id')::uuid)
    and private.caller_sees_member_card((item->>'id')::uuid);

  select coalesce(pg_catalog.jsonb_agg(item order by item->>'sector', item->>'one_liner'), '[]'::jsonb)
    into v_mandates
  from pg_catalog.jsonb_array_elements(coalesce(v_base->'new_mandates', '[]'::jsonb)) item
  where coalesce(item->>'one_liner', '') <> ''
    and position('@' in item::text) = 0;

  if v_sponsor then
    v_events := '[]'::jsonb;
  else
    select coalesce((
      select pg_catalog.jsonb_agg(
        (listed.item - 'venue_address') || pg_catalog.jsonb_build_object(
          'venue_address',
          case
            when (listed.item->>'id') ~ '^[0-9a-fA-F-]{36}$'
              then private.digest_venue_for_caller((listed.item->>'id')::uuid)
            else null
          end
        )
        order by listed.ord
      )
      from pg_catalog.jsonb_array_elements(coalesce(v_base->'upcoming_events', '[]'::jsonb))
        with ordinality as listed(item, ord)
    ), '[]'::jsonb)
      into v_events;
  end if;

  select coalesce(pg_catalog.jsonb_agg(listed.payload order by listed.rank), '[]'::jsonb)
    into v_suggestions
  from (
    select
      s.rank,
      pg_catalog.jsonb_build_object(
        'full_name', coalesce(nullif(private.digest_plain(p.full_name, 200), ''), 'Member'),
        'headline', private.digest_plain(p.headline, 160),
        'company', private.digest_plain(p.company, 200),
        'reason', private.digest_plain(s.reason, 200)
      ) as payload
    from public.intro_suggestions s
    join public.profiles p on p.user_id = s.suggested_id
    join public.members suggested on suggested.user_id = s.suggested_id
    where s.member_id = auth.uid()
      and s.iso_year = v_year
      and s.iso_week = v_week
      and suggested.is_demo = false
      and suggested.status in ('invited', 'active')
      and coalesce(suggested.directory_hidden, false) = false
      and private.caller_sees_member_card(s.suggested_id)
      and not private.sample_subject(s.suggested_id)
  ) listed;

  return pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'iso_year', v_year,
    'iso_week', v_week,
    'new_members', private.digest_strip_ids(v_members),
    'new_mandates', private.digest_strip_ids(v_mandates),
    'upcoming_events', private.digest_strip_ids(v_events),
    'suggestions', coalesce(v_suggestions, '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.my_weekly_digest() from public, anon;
grant execute on function public.my_weekly_digest() to authenticated;

comment on function public.my_weekly_digest() is
  'Live This week view for the signed-in member. Own suggestions only. mail_ready is false. Does not read draft issues.';

create or replace function public.set_digest_send_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  next_value boolean;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  next_value := coalesce(p_enabled, false);

  update public.digest_settings
  set send_enabled = next_value
  where id;

  return pg_catalog.jsonb_build_object('send_enabled', next_value);
end;
$fn$;

revoke all on function public.set_digest_send_enabled(boolean) from public, anon;
grant execute on function public.set_digest_send_enabled(boolean) to authenticated;

comment on function public.set_digest_send_enabled(boolean) is
  'Staff aal2 may store the switch. This function does not send mail.';

create or replace function public.digest_issue_sendable(p_issue_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  ok boolean;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select
    i.status = 'approved'
    and s.send_enabled
    and coalesce(i.payload ->> 'mail_ready', 'false') = 'true'
  into ok
  from public.digest_issues i
  cross join public.digest_settings s
  where i.id = p_issue_id;

  return coalesce(ok, false);
end;
$fn$;

revoke all on function public.digest_issue_sendable(uuid) from public, anon;
grant execute on function public.digest_issue_sendable(uuid) to authenticated;

comment on function public.digest_issue_sendable(uuid) is
  'True only for an approved issue when the switch is on and mail_ready is true. Does not send mail. This change keeps mail_ready false.';

create or replace function private.digest_issue_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_year integer;
  v_week integer;
  v_send boolean;
  v_issue jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select s.send_enabled into v_send
  from public.digest_settings s
  where s.id;

  select pg_catalog.jsonb_build_object(
    'id', i.id,
    'iso_year', i.iso_year,
    'iso_week', i.iso_week,
    'status', i.status,
    'approved_at', i.approved_at,
    'payload', private.digest_with_preview(i.payload),
    'log', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'action', l.action,
          'created_at', l.created_at
        )
        order by l.created_at
      )
      from public.digest_issue_log l
      where l.issue_id = i.id
    ), '[]'::jsonb)
  )
    into v_issue
  from public.digest_issues i
  where i.iso_year = v_year
    and i.iso_week = v_week;

  return pg_catalog.jsonb_build_object(
    'send_enabled', coalesce(v_send, false),
    'mail_ready', false,
    'live', private.digest_with_preview(private.digest_build_payload()),
    'issue', v_issue
  );
end;
$fn$;

revoke all on function private.digest_issue_state() from public, anon, authenticated;

create or replace function public.staff_digest_issue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return private.digest_issue_state();
end;
$$;

revoke all on function public.staff_digest_issue() from public, anon;
grant execute on function public.staff_digest_issue() to authenticated;

create or replace function public.staff_create_digest_draft()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_week integer;
  v_id uuid;
  v_status text;
  v_payload jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  v_payload := private.digest_with_preview(private.digest_build_payload());

  select i.id, i.status
    into v_id, v_status
  from public.digest_issues i
  where i.iso_year = v_year
    and i.iso_week = v_week
  for update;

  if v_id is null then
    insert into public.digest_issues (iso_year, iso_week, status, payload)
    values (v_year, v_week, 'draft', v_payload)
    returning id into v_id;

    insert into public.digest_issue_log (issue_id, action, actor_id)
    values (v_id, 'created', auth.uid());
  elsif v_status = 'withdrawn' then
    update public.digest_issues
    set status = 'draft',
        payload = v_payload,
        approved_by = null,
        approved_at = null
    where id = v_id;

    insert into public.digest_issue_log (issue_id, action, actor_id)
    values (v_id, 'created', auth.uid());
  end if;

  return private.digest_issue_state();
end;
$$;

revoke all on function public.staff_create_digest_draft() from public, anon;
grant execute on function public.staff_create_digest_draft() to authenticated;

comment on function public.staff_create_digest_draft() is
  'Staff aal2 prepare the current week. A draft or approved issue is left as stored. Does not read member suggestions. Does not send mail.';

create or replace function public.staff_decide_digest_issue(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_week integer;
  v_id uuid;
  v_status text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_action is distinct from 'approve' and p_action is distinct from 'withdraw' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select i.id, i.status
    into v_id, v_status
  from public.digest_issues i
  where i.iso_year = v_year
    and i.iso_week = v_week
  for update;

  if v_id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_action = 'approve' and v_status = 'draft' then
    update public.digest_issues
    set status = 'approved',
        approved_by = auth.uid(),
        approved_at = pg_catalog.now()
    where id = v_id;

    insert into public.digest_issue_log (issue_id, action, actor_id)
    values (v_id, 'approved', auth.uid());
  elsif p_action = 'withdraw' and v_status in ('draft', 'approved') then
    update public.digest_issues
    set status = 'withdrawn'
    where id = v_id;

    insert into public.digest_issue_log (issue_id, action, actor_id)
    values (v_id, 'withdrawn', auth.uid());
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return private.digest_issue_state();
end;
$$;

revoke all on function public.staff_decide_digest_issue(text) from public, anon;
grant execute on function public.staff_decide_digest_issue(text) to authenticated;

comment on function public.staff_decide_digest_issue(text) is
  'Staff aal2 approve a draft or withdraw a draft or approved issue. Does not send mail.';
