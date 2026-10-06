import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import type { MajlisEventRow, MajlisRosterRow } from '../src/lib/supabase.ts'
import { hostGuestLabel } from '../supabase/functions/_shared/majlis_mail.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const priorMigration = path.join(root, 'supabase/migrations/20261127120000_staff_aal2_private_files.sql')
const migration = path.join(root, 'supabase/migrations/20261128180000_majlis_roster_host_no_email.sql')

const HOST = '00000000-0000-4000-8000-0000000000a1'
const GUEST = '00000000-0000-4000-8000-0000000000a2'
const WAIT = '00000000-0000-4000-8000-0000000000a3'
const OTHER = '00000000-0000-4000-8000-0000000000a4'
const STAFF = '00000000-0000-4000-8000-0000000000a5'
const SPONSOR = '00000000-0000-4000-8000-0000000000a6'
const EVENT = '10000000-0000-4000-8000-0000000000a1'
const RSVP_GUEST = '20000000-0000-4000-8000-0000000000a1'
const RSVP_WAIT = '20000000-0000-4000-8000-0000000000a2'

test('host roster migration hides email and stays independent of Security 4', () => {
  const sql = readFileSync(migration, 'utf8')
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(sql.includes('@'), false)
  assert.equal(/private\.is_staff\(\)\s*returns/i.test(sql), false)
  assert.equal(/note_staff_shared_read/i.test(sql), false)
  assert.equal(/master admin guard/i.test(sql), true)
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /when private\.is_staff\(\) then jsonb_build_object\('email', m\.email\)/)
  assert.match(sql, /else '\{\}'::jsonb/)
  assert.equal(/grant execute on function private\.majlis_roster_rows\(\) to anon/i.test(sql), false)
  assert.equal(/grant select on table public\.majlis_roster to anon/i.test(sql), false)
  const files = readFileSync(path.join(root, 'src/App.tsx'), 'utf8').split('\n')
  const applyLine = files.find((line) => line.includes('path="/apply"'))
  assert.match(applyLine || '', /path="\/apply" element=\{<ApplyPage/)
})

test('host notification label does not include another member email', () => {
  const rsvp = readFileSync(path.join(root, 'supabase/functions/majlis-rsvp/index.ts'), 'utf8')
  const admin = readFileSync(path.join(root, 'supabase/functions/majlis-admin-action/index.ts'), 'utf8')
  const label = rsvp.split('function personLabel')[1]?.split('function toMailEvent')[0] ?? ''
  assert.match(label, /hostGuestLabel\(person\?\.full_name\)/)
  assert.equal(label.includes('person.email'), false)
  assert.equal(/\$\{name\} \(\$\{member\?\.email\}\)/.test(admin), false)
  assert.equal(admin.includes('member?.email ||'), false)
  assert.match(admin, /hostGuestLabel\(profile\?\.full_name\)/)
  assert.equal(hostGuestLabel('guest@example.com'), 'guest@example.com')
  assert.equal(hostGuestLabel('Example Member').includes('@'), false)
})

test('host roster csv and rendered lists keep email on the admin list only', async () => {
  const page = readFileSync(path.join(root, 'src/pages/dashboard/MajlisPage.tsx'), 'utf8')
  const hostFn = page.split('function HostRoster')[1]?.split('function StatusLabel')[0] ?? ''
  assert.equal(hostFn.includes('row.email'), false)
  assert.equal(hostFn.includes("'Email'"), false)
  const admin = readFileSync(path.join(root, 'src/pages/admin/MajlisPage.tsx'), 'utf8')
  assert.match(admin, /includeEmail: true/)
  assert.match(admin, /\['Name', 'Email', 'Status', 'Waitlist position', 'Registered at'\]/)

  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const rosterMod = await vite.ssrLoadModule('/src/lib/majlisRoster.ts')
    const csv = rosterMod.hostRosterCsv([
      {
        full_name: 'Example Member',
        status: 'registered',
        waitlist_position: null,
        registered_at: '2099-01-02T10:00:00.000Z',
      },
      {
        full_name: 'Example Waitlist',
        status: 'waitlist',
        waitlist_position: 1,
        registered_at: '2099-01-02T11:00:00.000Z',
      },
    ])
    assert.equal(csv.includes('@'), false)
    assert.equal(/email/i.test(csv), false)
    assert.match(csv, /Example Member/)
    assert.match(csv, /Example Waitlist/)
    assert.match(csv, /waitlist/)

    const memberMod = await vite.ssrLoadModule('/src/pages/dashboard/MajlisPage.tsx')
    const contextMod = await vite.ssrLoadModule('/src/pages/dashboard/context.ts')
    const adminMod = await vite.ssrLoadModule('/src/pages/admin/MajlisPage.tsx')
    const event = exampleEvent()
    const roster = exampleRoster()
    const hostHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/majlis'] },
        createElement(
          contextMod.MemberContext.Provider,
          { value: memberRoom() },
          createElement(memberMod.MajlisPage, { preview: { events: [event], roster } }),
        ),
      ),
    )
    const hostList = section(hostHtml, 'Roster')
    assert.match(hostList, /Example Member/)
    assert.match(hostList, /Example Waitlist/)
    assert.match(hostList, /registered/)
    assert.match(hostList, /waitlist/)
    assert.equal(hostList.includes('@'), false)
    assert.equal(/email/i.test(hostList), false)

    const adminHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/admin/majlis'] },
        createElement(adminMod.AdminMajlisPage, { preview: { events: [event], roster } }),
      ),
    )
    const adminList = section(adminHtml, 'RSVPs')
    assert.match(adminList, /Example Member/)
    assert.match(adminList, /guest@example\.com/)
    assert.match(adminList, /wait@example\.com/)
    assert.match(adminList, /Example Waitlist/)
  } finally {
    await vite.close()
  }
})

test('postgres roster hides email from a host and keeps it for aal2 staff', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-roster-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_roster_${process.pid}`
  const security3InRepo = path.join(root, 'supabase/migrations/20261128120000_retention_privacy_audit.sql')
  let security3 = ''
  if (existsSync(security3InRepo)) {
    security3 = `\\i ${security3InRepo}\n`
  } else {
    try {
      try {
        execFileSync('git', ['show', 'origin/cursor/retention-privacy-audit-4741:supabase/migrations/20261128120000_retention_privacy_audit.sql'], {
          stdio: 'ignore',
        })
      } catch {
        execFileSync('git', ['fetch', 'origin', 'cursor/retention-privacy-audit-4741'], { stdio: 'ignore' })
      }
      const pulled = execFileSync(
        'git',
        ['show', 'origin/cursor/retention-privacy-audit-4741:supabase/migrations/20261128120000_retention_privacy_audit.sql'],
        { encoding: 'utf8' },
      )
      const pulledPath = path.join(dir, '20261128120000_retention_privacy_audit.sql')
      writeFileSync(pulledPath, pulled)
      security3 = `\\i ${pulledPath}\n`
    } catch {
      security3 = ''
    }
  }
  const security3Check = security3
    ? `do $sec3$ begin
         if to_regclass('public.staff_access_log') is null then
           raise exception 'security 3 migration was not applied';
         end if;
       end $sec3$;`
    : `do $sec3$ begin
         raise exception 'security 3 migration was not available';
       end $sec3$;`
  writeFileSync(
    script,
    `${fixtureSql}\n\\i ${priorMigration}\n${seedSql}\n${security3}\\i ${migration}\n${security3Check}\n${assertSql}\n`,
  )
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer; message?: string }
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}\n${failed.message ?? ''}`)
    }
  } finally {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})

function section(html: string, label: string): string {
  const marker = `aria-label="${label}"`
  const start = html.indexOf(marker)
  assert.ok(start >= 0, label)
  const end = html.indexOf('</ul>', start)
  assert.ok(end > start, label)
  return html.slice(start, end)
}

function memberRoom() {
  return {
    userId: HOST,
    email: 'host@example.com',
    staffRole: null,
    member: {
      user_id: HOST,
      email: 'host@example.com',
      seat: 'ksa' as const,
      status: 'active' as const,
      must_set_password: false,
      invites_remaining: 0,
      invites_granted: 0,
    },
    profile: null,
    reload: async () => {},
  }
}

function exampleEvent(): MajlisEventRow {
  return {
    id: EVENT,
    host_member_id: HOST,
    title: 'Example gathering',
    description: 'A private gathering for members.',
    region: 'Riyadh',
    focus_tags: ['Governance'],
    starts_at: '2099-01-02T10:00:00.000Z',
    ends_at: '2099-01-02T12:00:00.000Z',
    timezone: 'Asia/Riyadh',
    capacity: 12,
    venue_name: 'Example venue',
    venue_address: 'Example street',
    venue_visibility: 'members_on_rsvp',
    status: 'published',
    rejection_feedback: null,
    admin_note: null,
    approved_at: '2099-01-01T00:00:00.000Z',
    created_at: '2099-01-01T00:00:00.000Z',
    map_lat: null,
    map_lng: null,
    rsvp_opens_at: '2099-01-01T00:00:00.000Z',
    founding_priority_ends_at: null,
    featured: false,
    sponsor_label: null,
    cancelled_at: null,
    cancel_reason: null,
    registered_count: 1,
    waitlist_count: 1,
    my_rsvp_status: null,
    my_waitlist_position: null,
    host_avatar_style: 'male',
    host_avatar_path: null,
  }
}

function exampleRoster(): MajlisRosterRow[] {
  return [
    {
      id: RSVP_GUEST,
      event_id: EVENT,
      member_id: GUEST,
      status: 'registered',
      waitlist_position: null,
      registered_at: '2099-01-02T10:00:00.000Z',
      cancelled_at: null,
      email: 'guest@example.com',
      full_name: 'Example Member',
      avatar_style: 'male',
      avatar_path: null,
    },
    {
      id: RSVP_WAIT,
      event_id: EVENT,
      member_id: WAIT,
      status: 'waitlist',
      waitlist_position: 1,
      registered_at: '2099-01-02T11:00:00.000Z',
      cancelled_at: null,
      email: 'wait@example.com',
      full_name: 'Example Waitlist',
      avatar_style: 'male',
      avatar_path: null,
    },
  ]
}

const fixtureSql = `
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

grant anon, authenticated, service_role to current_user;
create schema if not exists auth;
create schema if not exists private;
grant usage on schema public, private to anon, authenticated, service_role;

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

create table public.staff_users (
  user_id uuid primary key,
  role text not null,
  email text not null
);
create table public.members (
  user_id uuid primary key,
  status text,
  seat text,
  email text
);
create table public.profiles (
  user_id uuid primary key,
  full_name text,
  avatar_style text,
  avatar_path text,
  investable_capacity_usd numeric,
  fo_aum_usd numeric,
  turnover_usd numeric,
  capacity_currency text,
  capacity_verified boolean
);
create table public.majlis_events (
  id uuid primary key,
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
  cancel_reason text
);
create table public.majlis_region_geotag (
  region text primary key,
  map_lat numeric,
  map_lng numeric
);
create table public.majlis_rsvps (
  id uuid primary key,
  event_id uuid,
  member_id uuid,
  status text,
  waitlist_position integer,
  registered_at timestamptz,
  cancelled_at timestamptz
);
create table public.majlis_decisions (id uuid primary key);
alter table public.majlis_decisions enable row level security;
alter table public.majlis_decisions force row level security;
grant select on public.majlis_decisions to authenticated;

create table public.due_diligence_decks (
  id uuid primary key,
  member_id uuid not null,
  storage_path text not null
);
create table public.due_diligence_jobs (
  id uuid primary key,
  member_id uuid not null,
  status text not null
);
create table public.due_diligence_reports (
  id uuid primary key,
  member_id uuid not null,
  job_id uuid not null,
  deck_id uuid not null
);
create table public.ai_tool_jobs (
  id uuid primary key,
  member_id uuid not null,
  status text not null
);
create table public.ai_tool_outputs (
  id uuid primary key,
  job_id uuid not null,
  member_id uuid not null
);
create table public.ai_tool_notes (
  id uuid primary key,
  job_id uuid not null,
  member_id uuid not null
);
create table public.ai_tool_consents (
  id uuid primary key,
  member_id uuid not null
);
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.objects (
  id uuid primary key,
  bucket_id text,
  name text
);
create table public.rooms (
  id uuid primary key,
  opened_by text,
  status text,
  name text,
  purpose text,
  owner_member_id uuid,
  mandate_id uuid,
  re_opportunity_id uuid,
  created_at timestamptz
);
create table public.room_participants (
  id uuid primary key,
  room_id uuid,
  member_id uuid,
  role text,
  invite_status text,
  created_at timestamptz
);

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select false;
$$;
grant execute on function private.is_staff() to authenticated, service_role;

create or replace function private.assert_service_role()
returns void language plpgsql as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

alter table public.due_diligence_decks enable row level security;
alter table public.due_diligence_jobs enable row level security;
alter table public.due_diligence_reports enable row level security;
alter table public.ai_tool_jobs enable row level security;
alter table public.ai_tool_outputs enable row level security;
alter table public.ai_tool_notes enable row level security;
alter table public.ai_tool_consents enable row level security;
alter table storage.objects enable row level security;
alter table storage.objects force row level security;
grant select on public.due_diligence_decks to authenticated;
grant select on public.due_diligence_jobs to authenticated;
grant select on public.due_diligence_reports to authenticated;
grant select on public.ai_tool_jobs to authenticated;
grant select on public.ai_tool_outputs to authenticated;
grant select on public.ai_tool_notes to authenticated;
grant select on public.ai_tool_consents to authenticated;
grant select on storage.objects to authenticated;

create policy ai_tool_consents_select_staff on public.ai_tool_consents
  for select to authenticated using (private.is_staff());
create policy member_avatars_select_staff on storage.objects
  for select to authenticated using (bucket_id = 'member-avatars' and private.is_staff());
`

const seedSql = `
insert into public.staff_users (user_id, role, email) values
  ('${STAFF}', 'staff', 'staff@example.com');
insert into public.members (user_id, status, seat, email) values
  ('${HOST}', 'active', 'ksa', 'host@example.com'),
  ('${GUEST}', 'active', 'ksa', 'guest@example.com'),
  ('${WAIT}', 'active', 'intl', 'wait@example.com'),
  ('${OTHER}', 'active', 'ksa', 'other@example.com'),
  ('${SPONSOR}', 'active', 'sponsor', 'sponsor@example.com');
insert into public.profiles (user_id, full_name, avatar_style) values
  ('${HOST}', 'Example Host', 'male'),
  ('${GUEST}', 'Example Member', 'male'),
  ('${WAIT}', 'Example Waitlist', 'male'),
  ('${OTHER}', 'Example Other', 'male');
insert into public.majlis_events (
  id, host_member_id, title, description, region, focus_tags, starts_at, ends_at, timezone,
  capacity, venue_name, venue_address, venue_visibility, status, created_at, featured
) values (
  '${EVENT}', '${HOST}', 'Example gathering', 'A private gathering for members.', 'Riyadh', array['Governance'],
  '2099-01-02T10:00:00Z', '2099-01-02T12:00:00Z', 'Asia/Riyadh',
  12, 'Example venue', 'Example street', 'members_on_rsvp', 'published', '2099-01-01T00:00:00Z', false
);
insert into public.majlis_rsvps (id, event_id, member_id, status, waitlist_position, registered_at) values
  ('${RSVP_GUEST}', '${EVENT}', '${GUEST}', 'registered', null, '2099-01-02T10:00:00Z'),
  ('${RSVP_WAIT}', '${EVENT}', '${WAIT}', 'waitlist', 1, '2099-01-02T11:00:00Z');
`

const assertSql = `
create or replace function pg_temp.fail(p_label text) returns void language plpgsql as $$
begin
  raise exception '%', p_label;
end;
$$;

create or replace function pg_temp.assume(p_sub text, p_aal text, p_role text) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'aal', p_aal, 'role', p_role)::text,
    false
  );
  execute format('set role %I', p_role);
end;
$$;

do $checks$
declare
  payload jsonb;
  n integer;
  registered integer;
  waiting integer;
  config text[];
  definer boolean;
begin
  select p.prosecdef, p.proconfig into definer, config
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'majlis_roster_rows';
  if definer is not true then perform pg_temp.fail('roster not definer'); end if;
  if not exists (
    select 1 from unnest(coalesce(config, array[]::text[])) item
    where item in ('search_path=', 'search_path=""')
  ) then
    perform pg_temp.fail('roster search_path ' || coalesce(array_to_string(config, ','), 'null'));
  end if;
  if has_function_privilege('anon', 'private.majlis_roster_rows()', 'execute') then
    perform pg_temp.fail('anon execute');
  end if;
  if has_table_privilege('anon', 'public.majlis_roster', 'select') then
    perform pg_temp.fail('anon select');
  end if;

  perform pg_temp.assume('${HOST}', 'aal1', 'authenticated');
  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into payload from private.majlis_roster_rows() row_data;
  if jsonb_array_length(payload) <> 2 then perform pg_temp.fail('host row count'); end if;
  if exists (select 1 from jsonb_array_elements(payload) elem where elem ? 'email') then
    perform pg_temp.fail('host email key');
  end if;
  if position('@' in payload::text) > 0 then perform pg_temp.fail('host at sign'); end if;
  if not exists (
    select 1 from jsonb_array_elements(payload) elem
    where elem->>'full_name' = 'Example Member' and elem->>'status' = 'registered'
  ) then perform pg_temp.fail('host lost name'); end if;
  if not exists (
    select 1 from jsonb_array_elements(payload) elem
    where elem->>'full_name' = 'Example Waitlist'
      and elem->>'status' = 'waitlist'
      and (elem->>'waitlist_position')::int = 1
  ) then perform pg_temp.fail('host lost waitlist'); end if;
  if exists (select 1 from public.majlis_roster where email is not null) then
    perform pg_temp.fail('host view email');
  end if;
  select registered_count, waitlist_count into registered, waiting
  from private.majlis_events_member_rows()
  where id = '${EVENT}';
  if registered <> 1 or waiting <> 1 then perform pg_temp.fail('host counts'); end if;

  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into payload from private.majlis_roster_rows() row_data;
  if jsonb_array_length(payload) <> 2 then perform pg_temp.fail('staff row count'); end if;
  if exists (select 1 from jsonb_array_elements(payload) elem where not (elem ? 'email')) then
    perform pg_temp.fail('staff missing email key');
  end if;
  if not exists (
    select 1 from jsonb_array_elements(payload) elem where elem->>'email' = 'guest@example.com'
  ) or not exists (
    select 1 from jsonb_array_elements(payload) elem where elem->>'email' = 'wait@example.com'
  ) then perform pg_temp.fail('staff email value'); end if;
  select count(*) into n from public.majlis_roster where email in ('guest@example.com', 'wait@example.com');
  if n <> 2 then perform pg_temp.fail('staff view email'); end if;

  perform pg_temp.assume('${STAFF}', 'aal1', 'authenticated');
  select count(*) into n from private.majlis_roster_rows();
  if n <> 0 then perform pg_temp.fail('aal1 staff rows'); end if;
  select count(*) into n from public.majlis_roster;
  if n <> 0 then perform pg_temp.fail('aal1 staff view'); end if;

  perform pg_temp.assume('${OTHER}', 'aal1', 'authenticated');
  select count(*) into n from private.majlis_roster_rows();
  if n <> 0 then perform pg_temp.fail('other member rows'); end if;
  perform pg_temp.assume('${GUEST}', 'aal1', 'authenticated');
  select count(*) into n from public.majlis_roster;
  if n <> 0 then perform pg_temp.fail('attendee member rows'); end if;
  perform pg_temp.assume('${SPONSOR}', 'aal1', 'authenticated');
  select count(*) into n from public.majlis_roster;
  if n <> 0 then perform pg_temp.fail('sponsor rows'); end if;

  perform set_config('role', 'none', true);
  begin
    perform pg_temp.assume('${HOST}', 'aal1', 'anon');
    perform count(*) from public.majlis_roster;
    perform pg_temp.fail('anon read');
  exception
    when insufficient_privilege then
      perform set_config('role', 'none', true);
  end;
  begin
    perform pg_temp.assume('${HOST}', 'aal1', 'anon');
    perform count(*) from private.majlis_roster_rows();
    perform pg_temp.fail('anon execute call');
  exception
    when insufficient_privilege then
      perform set_config('role', 'none', true);
  end;
end
$checks$;
`
