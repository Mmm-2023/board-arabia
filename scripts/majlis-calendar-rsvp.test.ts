import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { monthCells, riyadhDay } from '../src/lib/majlisCalendar.ts'
import { resolveAvatar } from '../src/lib/avatarStyle.ts'
import { MEMBER_SECTIONS } from '../src/shell/destinations.ts'
import { resolveRedirect } from '../src/shell/redirects.ts'
import { memberMajlisPast } from '../supabase/functions/_shared/majlis.ts'
import { staffApiDecision } from '../supabase/functions/_shared/staff_auth.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261202120000_majlis_rsvp_calendar.sql'

const HOST = '10000000-0000-4000-8000-000000000001'
const YES = '10000000-0000-4000-8000-000000000002'
const WAIT = '10000000-0000-4000-8000-000000000003'
const MAYBE = '10000000-0000-4000-8000-000000000004'
const NO = '10000000-0000-4000-8000-000000000005'
const STAFF = '10000000-0000-4000-8000-000000000006'
const SPONSOR = '10000000-0000-4000-8000-000000000007'
const EVENT = '20000000-0000-4000-8000-000000000001'
const PAST = '20000000-0000-4000-8000-000000000002'
const ADMIN_EVENT = '20000000-0000-4000-8000-000000000003'

test('majlis calendar migration pins an empty search path', () => {
  const sql = readFileSync(path.join(root, 'supabase/migrations', migrationName), 'utf8')
  assert.equal(sql.includes('search_path = public'), false)
  assert.equal(sql.includes('\u2014'), false)
  const definers: string[] = []
  for (const block of sql.split(/create (?:or replace )?function /).slice(1)) {
    const header = block.split(/as \$\$|as \$fn\$/)[0] ?? ''
    if (!/security definer/i.test(header)) continue
    assert.match(header, /set search_path = ''/)
    definers.push(header.split('(')[0]?.trim() ?? '')
  }
  assert.deepEqual(definers, [
    'public.majlis_place_rsvp',
    'private.majlis_events_member_rows',
    'private.majlis_roster_rows',
  ])
  const place = sql.split('function public.majlis_place_rsvp')[1]?.split('$$;')[0] ?? ''
  assert.match(place, /auth\.role\(\)/)
  assert.match(place, /public\.majlis_events/)
  assert.match(place, /public\.members/)
  assert.match(place, /public\.majlis_rsvps/)
})

test('member routes keep Majlis upcoming, past, and the events redirect', () => {
  assert.deepEqual(
    MEMBER_SECTIONS.majlis?.map((item) => item.label),
    ['Upcoming', 'Past'],
  )
  assert.equal(resolveRedirect('/dashboard/events'), '/dashboard/majlis')
  assert.equal(resolveRedirect('/dashboard/majlis'), null)
  assert.equal(resolveRedirect('/dashboard/majlis/past'), null)
  const app = readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  assert.match(app, /path="majlis" element=\{<MajlisLayout/)
  assert.match(app, /path="past" element=\{<MajlisPage/)
  assert.match(app, /path="events" element=\{<RedirectKeep/)
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  const page = readFileSync(path.join(root, 'src/pages/dashboard/MajlisPage.tsx'), 'utf8')
  assert.equal(/\bstaff\b/i.test(page), false)
  assert.equal(/\bdesk\b/i.test(page), false)
  assert.match(page, /Our admin team reviews the application before it is published/)
  assert.match(page, /Admin feedback/)
  assert.match(page, /until admin accepts it/)
  assert.match(page, /Admin will accept or reject it/)
  assert.match(page, /hosted by our admin team/)
  assert.match(page, /Add to calendar \(\.ics\)/)
  assert.match(page, /fetchOwnMajlisRsvps/)
  assert.match(page, /Google Calendar/)
})

test('member and aal1 staff cannot create', () => {
  const admin = readFileSync(path.join(root, 'supabase/functions/majlis-admin-action/index.ts'), 'utf8')
  const gate = admin.indexOf('requireStaff')
  const create = admin.indexOf("action === 'create'")
  assert.ok(gate > 0 && create > gate)
  assert.match(admin, /host_member_id: null/)
  assert.match(admin, /created_by_staff: staffId/)
  assert.equal(staffApiDecision({ userId: HOST, role: null, aal: 'aal2' }).allow, false)
  assert.equal(staffApiDecision({ userId: HOST, role: null, aal: 'aal2' }).status, 403)
  const aal1 = staffApiDecision({ userId: STAFF, role: 'staff', aal: 'aal1' })
  assert.equal(aal1.allow, false)
  if (!aal1.allow) assert.equal(aal1.status, 403)
  assert.equal(staffApiDecision({ userId: STAFF, role: 'staff', aal: 'aal2' }).allow, true)
})

test('calendar file stays on a Yes only', () => {
  const ics = readFileSync(path.join(root, 'supabase/functions/majlis-ics/index.ts'), 'utf8')
  assert.match(ics, /rsvp\?\.status !== 'registered'/)
  assert.match(ics, /403/)
  const rsvp = readFileSync(path.join(root, 'supabase/functions/majlis-rsvp/index.ts'), 'utf8')
  assert.match(rsvp, /register', 'maybe', 'decline', 'cancel'/)
  assert.equal(rsvp.includes("'promote'"), false)
  const reminders = readFileSync(path.join(root, 'supabase/migrations/20260926103000_majlis_rsvp.sql'), 'utf8')
  assert.match(reminders, /r\.status = 'registered'/)
})

test('past feed and calendar grid use ended events and Riyadh days', () => {
  const now = Date.parse('2026-10-06T12:00:00.000Z')
  const past = memberMajlisPast(
    [
      { title: 'Earlier evening', starts_at: '2026-09-01T10:00:00.000Z', ends_at: '2026-09-01T12:00:00.000Z', status: 'published' },
      { title: 'Still running', starts_at: '2026-10-06T10:00:00.000Z', ends_at: '2026-10-06T18:00:00.000Z', status: 'published' },
      { title: 'test majlis', starts_at: '2026-01-01T10:00:00.000Z', ends_at: '2026-01-01T12:00:00.000Z', status: 'published' },
    ],
    now,
  )
  assert.deepEqual(past.map((event) => event.title), ['Earlier evening'])
  const day = riyadhDay('2026-10-06T21:30:00.000Z')
  assert.deepEqual(day, { year: 2026, month: 10, day: 7 })
  assert.equal(monthCells(2026, 10).length % 7, 0)
  assert.equal(resolveAvatar({ photoUrl: null, style: null }).kind, 'illustration')
  const roster = readFileSync(path.join(root, 'src/lib/majlisRoster.ts'), 'utf8')
  assert.match(roster, /label: 'Yes'/)
  assert.match(roster, /label: 'Waitlist'/)
  assert.match(roster, /label: 'Maybe'/)
  assert.match(roster, /label: 'No'/)
})

test('maybe, no, capacity, roster privacy, past archive, own row, and null host hold in postgres', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261201120000_intro_suggestions_directory_hidden.sql'))
  assert.equal(names.includes('20261203120000_ux_b.sql'), false)
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-majlis-fw2-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_majlis_fw2_${process.pid}`
  writeFileSync(script, [stubSql, ...names.map(include), assertSql].join('\n'))
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer }
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}`)
    }
  } finally {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})

const stubSql = `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$roles$;
alter role service_role bypassrls;
grant anon, authenticated, service_role to current_user;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists private;
grant usage on schema public, auth, storage, private, extensions to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    current_user
  )
$$;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb
);
create table storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text,
  email text,
  phone text,
  turnover text,
  fo_aum text,
  companies text,
  job_titles text,
  linkedin_url text,
  calendar_slot text,
  status text,
  notes text
);
alter table public.applications enable row level security;

create table public.staff_users (
  user_id uuid primary key,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.staff_users enable row level security;

alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema private grant execute on functions to anon, authenticated, service_role;
`

const assertSql = `
insert into auth.users (id, email) values
  ('${HOST}', 'host@example.com'),
  ('${YES}', 'yes@example.com'),
  ('${WAIT}', 'wait@example.com'),
  ('${MAYBE}', 'maybe@example.com'),
  ('${NO}', 'no@example.com'),
  ('${STAFF}', 'admin@example.com'),
  ('${SPONSOR}', 'sponsor@example.com');

insert into public.staff_users (user_id, email, role) values
  ('${STAFF}', 'admin@example.com', 'staff');

insert into public.members (user_id, email, seat, status) values
  ('${HOST}', 'host@example.com', 'ksa', 'active'),
  ('${YES}', 'yes@example.com', 'ksa', 'active'),
  ('${WAIT}', 'wait@example.com', 'ksa', 'active'),
  ('${MAYBE}', 'maybe@example.com', 'ksa', 'active'),
  ('${NO}', 'no@example.com', 'ksa', 'active'),
  ('${SPONSOR}', 'sponsor@example.com', 'sponsor', 'active');

insert into public.profiles (user_id, full_name) values
  ('${HOST}', 'Example Host'),
  ('${YES}', 'Example Yes'),
  ('${WAIT}', 'Example Wait'),
  ('${MAYBE}', 'Example Maybe'),
  ('${NO}', 'Example No');

select set_config('request.jwt.claims', '{"role":"service_role"}', false);

insert into public.majlis_events (
  id, host_member_id, title, description, region, focus_tags, starts_at, ends_at, timezone,
  capacity, venue_name, venue_address, venue_visibility, status, approved_by, approved_at
) values
  (
    '${EVENT}', '${HOST}', 'Example gathering', 'A private gathering for members.', 'Riyadh', array['Governance'],
    now() + interval '2 days', now() + interval '2 days 2 hours', 'Asia/Riyadh',
    1, 'Example venue', 'Example street', 'members_on_rsvp', 'published', '${STAFF}', now() - interval '3 days'
  ),
  (
    '${PAST}', '${HOST}', 'Example archive', 'A private gathering that has ended.', 'Riyadh', array['Governance'],
    now() - interval '3 days', now() - interval '2 days', 'Asia/Riyadh',
    8, 'Example venue', 'Past street', 'members_on_rsvp', 'published', '${STAFF}', now() - interval '10 days'
  ),
  (
    '${ADMIN_EVENT}', null, 'Admin gathering', 'Created with no member host.', 'Riyadh', array['Governance'],
    now() + interval '4 days', now() + interval '4 days 2 hours', 'Asia/Riyadh',
    8, 'Example venue', 'Admin street', 'members_on_rsvp', 'published', '${STAFF}', now() - interval '1 day'
  );

update public.majlis_events
  set created_by_staff = '${STAFF}', title = 'Admin gathering edited'
  where id = '${ADMIN_EVENT}';

insert into public.majlis_rsvps (event_id, member_id, status, registered_at)
values ('${PAST}', '${YES}', 'registered', now() - interval '4 days');

create or replace function pg_temp.fail(p_label text) returns void language plpgsql as $$
begin
  raise exception '%', p_label;
end $$;

create or replace function pg_temp.assume(p_sub text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text,
    false
  );
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  reset role;
end $$;

do $checks$
declare
  placed jsonb;
  address text;
  maybe_n integer;
  host_id uuid;
  created_by uuid;
  own_status text;
  n integer;
  rate text;
begin
  perform pg_temp.service();
  placed := public.majlis_place_rsvp('${EVENT}', '${YES}', 'register');
  if placed->>'status' <> 'registered' then perform pg_temp.fail('yes did not take the seat'); end if;

  placed := public.majlis_place_rsvp('${EVENT}', '${WAIT}', 'register');
  if placed->>'status' <> 'waitlist' then perform pg_temp.fail('capacity did not waitlist'); end if;

  placed := public.majlis_place_rsvp('${EVENT}', '${MAYBE}', 'maybe');
  if placed->>'status' <> 'maybe' then perform pg_temp.fail('maybe status'); end if;
  if (placed->>'registered_count')::int <> 1 then perform pg_temp.fail('maybe took a seat'); end if;

  placed := public.majlis_place_rsvp('${EVENT}', '${NO}', 'decline');
  if placed->>'status' <> 'declined' then perform pg_temp.fail('no status'); end if;
  if (placed->>'registered_count')::int <> 1 then perform pg_temp.fail('no took a seat'); end if;

  perform pg_temp.assume('${MAYBE}', 'aal1');
  select venue_address into address from public.majlis_events_member where id = '${EVENT}';
  if address is not null then perform pg_temp.fail('maybe saw the venue address'); end if;
  select maybe_count into maybe_n from public.majlis_events_member where id = '${EVENT}';
  if maybe_n is not null then perform pg_temp.fail('member saw the maybe count'); end if;

  perform pg_temp.assume('${NO}', 'aal1');
  select venue_address into address from public.majlis_events_member where id = '${EVENT}';
  if address is not null then perform pg_temp.fail('no saw the venue address'); end if;

  perform pg_temp.service();
  placed := public.majlis_place_rsvp('${EVENT}', '${YES}', 'decline');
  if placed->>'status' <> 'declined' then perform pg_temp.fail('yes to no'); end if;
  if placed->>'promoted_member_id' <> '${WAIT}' then perform pg_temp.fail('waitlist was not promoted'); end if;
  if (placed->>'registered_count')::int <> 1 then perform pg_temp.fail('promoted seat missing'); end if;

  perform pg_temp.assume('${WAIT}', 'aal1');
  select venue_address into address from public.majlis_events_member where id = '${EVENT}';
  if address is distinct from 'Example street' then perform pg_temp.fail('yes did not see the venue address'); end if;
  select venue_address into address from public.majlis_events_member where id = '${PAST}';
  if address is not null then perform pg_temp.fail('past event showed an address'); end if;
  select count(*) into n from public.majlis_roster where event_id = '${PAST}';
  if n <> 0 then perform pg_temp.fail('past event showed attendees'); end if;

  perform pg_temp.assume('${HOST}', 'aal1');
  select venue_address into address from public.majlis_events_member where id = '${PAST}';
  if address is not null then perform pg_temp.fail('host saw a past address'); end if;
  select count(*) into n from public.majlis_roster where event_id = '${PAST}';
  if n <> 0 then perform pg_temp.fail('host saw past attendees'); end if;
  select count(*) into n from public.majlis_roster where event_id = '${EVENT}' and email is not null;
  if n <> 0 then perform pg_temp.fail('host roster contained an email'); end if;
  select count(*) into n from public.majlis_roster where event_id = '${EVENT}';
  if n < 1 then perform pg_temp.fail('host lost the live roster'); end if;
  select maybe_count into maybe_n from public.majlis_events_member where id = '${EVENT}';
  if maybe_n is distinct from 1 then perform pg_temp.fail('host maybe count'); end if;

  perform pg_temp.assume('${STAFF}', 'aal2');
  select count(*) into n from public.majlis_roster where event_id = '${EVENT}' and email = 'yes@example.com';
  if n <> 1 then perform pg_temp.fail('aal2 staff roster lost the email'); end if;
  select maybe_count into maybe_n from public.majlis_events_member where id = '${EVENT}';
  if maybe_n is distinct from 1 then perform pg_temp.fail('staff maybe count'); end if;

  perform pg_temp.assume('${STAFF}', 'aal1');
  select count(*) into n from public.majlis_roster;
  if n <> 0 then perform pg_temp.fail('aal1 staff saw the roster'); end if;

  perform pg_temp.assume('${MAYBE}', 'aal1');
  select status into own_status from public.majlis_rsvps where event_id = '${EVENT}';
  if own_status <> 'maybe' then perform pg_temp.fail('own rsvp row'); end if;
  select count(*) into n from public.majlis_rsvps where member_id <> '${MAYBE}';
  if n <> 0 then perform pg_temp.fail('member read another rsvp'); end if;
  select count(*) into n from public.majlis_roster;
  if n <> 0 then perform pg_temp.fail('attendee read the roster'); end if;

  perform pg_temp.assume('${SPONSOR}', 'aal1');
  select count(*) into n from public.majlis_events_member;
  if n <> 0 then perform pg_temp.fail('sponsor saw member rows'); end if;
  select count(*) into n from public.majlis_events_sponsor where id = '${EVENT}';
  if n <> 1 then perform pg_temp.fail('sponsor lost the sponsor row'); end if;

  perform pg_temp.assume('${YES}', 'aal1');
  select host_member_id, venue_address into host_id, address
  from public.majlis_events_member where id = '${ADMIN_EVENT}';
  if host_id is not null then perform pg_temp.fail('null host was filled in'); end if;
  if address is not null then perform pg_temp.fail('non guest saw the admin venue'); end if;

  perform pg_temp.service();
  select created_by_staff into created_by from public.majlis_events where id = '${ADMIN_EVENT}';
  if created_by <> '${STAFF}' then perform pg_temp.fail('created_by_staff missing'); end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'majlis_events_member' and column_name = 'created_by_staff'
  ) then perform pg_temp.fail('member view exposes created_by_staff'); end if;

  select pg_get_functiondef('public.majlis_consume_rsvp_slot(uuid)'::regprocedure) into rate;
  if position('hit_count > 30' in rate) = 0 then perform pg_temp.fail('rate limit changed'); end if;

  if has_table_privilege('anon', 'public.majlis_rsvps', 'select') then perform pg_temp.fail('anon rsvp select'); end if;
  if has_table_privilege('anon', 'public.majlis_roster', 'select') then perform pg_temp.fail('anon roster select'); end if;
  if has_table_privilege('anon', 'public.majlis_events_member', 'select') then perform pg_temp.fail('anon member select'); end if;
  if has_column_privilege('authenticated', 'public.majlis_rsvps', 'calendar_sent_at', 'select') then
    perform pg_temp.fail('member can read reminder columns');
  end if;
end
$checks$;
`
