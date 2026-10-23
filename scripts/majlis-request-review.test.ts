import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { presentMajlisDrafts, presentMajlisRequests } from '../src/lib/majlisRequestReview.ts'
import { STAFF_SECTIONS, shellSectionTitle, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../src/shell/destinations.ts'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const migrationName = '20270106120000_majlis_request_review.sql'
const migrationPath = path.join(root, 'supabase/migrations', migrationName)

const STAFF = '10000000-0000-4000-8000-0000000000a1'
const HOST = '10000000-0000-4000-8000-0000000000a2'
const ATTENDEE = '10000000-0000-4000-8000-0000000000a3'
const PARTNER = '10000000-0000-4000-8000-0000000000a4'
const APPLICANT = '10000000-0000-4000-8000-0000000000a5'
const UNVERIFIED = '10000000-0000-4000-8000-0000000000a6'
const SECOND = '10000000-0000-4000-8000-0000000000a7'
const OPEN_EVENT = '20000000-0000-4000-8000-0000000000c1'
const FULL_EVENT = '20000000-0000-4000-8000-0000000000c2'
const VIRTUAL_EVENT = '20000000-0000-4000-8000-0000000000c3'

function readMigration() {
  return readFileSync(migrationPath, 'utf8')
}

test('staff review migration stays closed, draft only, and on the free slot', () => {
  const sql = readMigration()
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(sql.includes('aal2'), false)
  assert.equal(/cron|pg_cron|email_outbox|resend|master_enabled|net\.http/i.test(sql), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/create policy|grant select|grant insert|to anon/i.test(sql), false)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /private\.is_staff\(\)/)
  assert.match(sql, /email_unverified/)
  assert.match(sql, /email_confirmed_at is not read/)
  assert.match(sql, /private\.majlis_virtual_member_cap/)
  assert.match(sql, /DRAFT FOR MICHAEL/)
  assert.match(sql, /send_enabled = false/)
  assert.match(sql, /majlis_application_audits/)
  const listAt = sql.indexOf('function public.staff_list_majlis_requests')
  const gateAt = sql.indexOf('if not private.is_staff()', listAt)
  const snapAt = sql.indexOf('form_snapshot', listAt)
  assert.ok(listAt > 0 && gateAt > listAt && snapAt > gateAt)
  assert.equal(sql.includes('the desk'), false)
  assert.deepEqual(STAFF_SECTIONS.majlis?.map((item) => item.label), ['Events', 'Requests'])
  assert.equal(shellSectionTitle('/admin/majlis/requests', STAFF_DESTINATIONS, STAFF_SECONDARY), 'Majlis')
  const app = readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  assert.match(app, /path="requests" element=\{<MajlisRequestsPage/)
})

test('request cards keep fit fields and drop an email', () => {
  const rows = presentMajlisRequests([
    {
      id: '30000000-0000-4000-8000-0000000000b1',
      event_id: '20000000-0000-4000-8000-0000000000b1',
      event_title: 'Governance circle',
      starts_at: '2026-11-20T15:00:00.000Z',
      ends_at: '2026-11-20T16:30:00.000Z',
      status: 'pending',
      submitted_at: '2026-10-19T09:00:00.000Z',
      seat_held: false,
      email_verified: true,
      full_name: 'Ada Example',
      phone: '+966500000000',
      company: 'Example Holdings',
      role: 'chairperson',
      linkedin: 'https://www.linkedin.com/in/example',
      why: 'Governance',
      email: 'ada@example.com',
      user_id: '10000000-0000-4000-8000-0000000000a5',
    },
    { id: 'not-a-uuid', event_id: '20000000-0000-4000-8000-0000000000b1', status: 'pending' },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.company, 'Example Holdings')
  assert.equal(rows[0]?.phone, '+966500000000')
  assert.equal(JSON.stringify(rows).includes('ada@example.com'), false)
  assert.equal(JSON.stringify(rows).includes('@'), false)
  const drafts = presentMajlisDrafts([
    { kind: 'accept', subject: 'Hello', body: 'Draft', send_enabled: true },
    { kind: 'send', subject: 'No', body: 'No' },
  ])
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0]?.sendEnabled, false)
})

test('accept at the cap waits, unverified accept is blocked, and only staff can read the form', { timeout: 120_000 }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-mj3b2-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_mj3b2_${process.pid}`
  writeFileSync(script, `${stubSql}\n\\i ${migrationPath}\n${assertSql}\n`)
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

function chromePath() {
  return (
    resolveChromePath()
    || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : null)
    || (existsSync('/usr/bin/google-chrome-stable') ? '/usr/bin/google-chrome-stable' : null)
  )
}

const shotNames = ['requests-1440.png', 'requests-390.png', 'requests-empty-1440.png', 'requests-empty-390.png'] as const

async function shot(page: import('playwright-core').Page, width: number, file: string) {
  if (width === 390) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.setViewportSize({ width, height: Math.max(height, 844) })
    await page.screenshot({ path: file, fullPage: false })
    await page.setViewportSize({ width, height: 844 })
    return
  }
  await page.screenshot({ path: file, fullPage: true })
}

test('majlis request shots at 1440 and 390', { timeout: 300_000 }, async (t) => {
  const chrome = chromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  const shotDir = path.join(root, 'handoff/ba-mj-3b-2-request-review')
  mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    configFile: path.join(root, 'scripts/smoke/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(120_000)
    page.setDefaultNavigationTimeout(120_000)
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto(`http://127.0.0.1:${port}/majlis-requests.html`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Requests' }).waitFor()
      const draftSubject = await page.locator('input').first().inputValue()
      assert.match(draftSubject, /DRAFT FOR MICHAEL/)
      const text = await page.locator('body').innerText()
      assert.equal(text.includes('\u2014') || text.includes('\u2013'), false)
      assert.equal(/\bsponsor\b/i.test(text), false)
      assert.equal(/nammco/i.test(text), false)
      assert.equal(/\b(price|priced|pricing)\b/i.test(text), false)
      assert.match(text, /Draft only. Nothing is sent./)
      assert.equal(await page.getByRole('button', { name: 'Send' }).count(), 0)
      await shot(page, width, path.join(shotDir, `requests-${width}.png`))
      const full = page.locator('[data-request-id="30000000-0000-4000-8000-0000000000b1"]')
      await full.getByRole('button', { name: 'Accept' }).click()
      await full.getByText('Waitlist').waitFor()
      await page.getByText('This majlis is full. The request is on the waitlist and does not hold a seat.').waitFor()
      const locked = page.locator('[data-request-id="30000000-0000-4000-8000-0000000000b3"]')
      assert.equal(await locked.getByRole('button', { name: 'Accept' }).isDisabled(), true)
      await locked.getByText('Accept is blocked until this email is verified.').waitFor()
      const open = page.locator('[data-request-id="30000000-0000-4000-8000-0000000000b2"]')
      await open.getByRole('button', { name: 'Reject' }).click()
      await open.getByRole('button', { name: 'Cancel' }).waitFor()
      await open.getByRole('button', { name: 'Reject' }).click()
      await open.getByText('Rejected').waitFor()
      await page.goto(`http://127.0.0.1:${port}/majlis-requests.html?view=empty`, { waitUntil: 'networkidle' })
      await page.getByText('No majlis requests yet.').waitFor()
      await shot(page, width, path.join(shotDir, `requests-empty-${width}.png`))
    }
    for (const name of shotNames) {
      assert.ok(statSync(path.join(shotDir, name)).size > 1000, name)
    }
  } finally {
    await browser.close()
    await vite.close()
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
exception
  when unique_violation then
    null;
end
$roles$;
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
create schema if not exists private;
grant usage on schema public, auth, private to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''), current_user)
$$;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create table if not exists public.staff_users (
  user_id uuid primary key,
  email text,
  role text
);

create table if not exists public.candidates (
  user_id uuid primary key,
  email text,
  email_verified_at timestamptz
);

create table if not exists public.majlis_events (
  id uuid primary key,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer,
  format text,
  host_member_id uuid
);

create table if not exists public.majlis_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  status text
);

create table if not exists public.majlis_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  status text not null default 'received',
  form_snapshot jsonb not null default '{}'::jsonb,
  consent_version text,
  verified_at timestamptz,
  submitted_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  seat_held boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_users s
    where s.user_id = auth.uid()
      and s.role in ('staff', 'master')
  );
$$;

create or replace function private.majlis_virtual_member_cap(p_host uuid)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_host is null then 149 else 148 end;
$$;

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
  new.verified_at := v_verified;
  if v_verified is null and new.status in ('accepted', 'waitlist') then
    raise exception 'email_unverified' using errcode = '42501';
  end if;
  new.seat_held := new.status = 'accepted';
  new.updated_at := pg_catalog.now();
  return new;
end;
$fn$;

drop trigger if exists majlis_applications_guard_review on public.majlis_applications;
create trigger majlis_applications_guard_review
  before insert or update on public.majlis_applications
  for each row
  execute function private.guard_majlis_application_review();

insert into auth.users (id, email) values
  ('${STAFF}', 'staff.review@example.com'),
  ('${HOST}', 'host.review@example.com'),
  ('${ATTENDEE}', 'attendee.review@example.com'),
  ('${PARTNER}', 'partner.review@example.com'),
  ('${APPLICANT}', 'ada.review@example.com'),
  ('${UNVERIFIED}', 'omar.review@example.com'),
  ('${SECOND}', 'noura.review@example.com');

insert into public.staff_users (user_id, email, role) values
  ('${STAFF}', 'staff.review@example.com', 'staff');

insert into public.candidates (user_id, email, email_verified_at) values
  ('${APPLICANT}', 'ada.review@example.com', now()),
  ('${SECOND}', 'noura.review@example.com', now()),
  ('${UNVERIFIED}', 'omar.review@example.com', null);

insert into public.majlis_events (id, title, starts_at, ends_at, capacity, format, host_member_id) values
  ('${OPEN_EVENT}', 'Capital circle', '2026-11-20T15:00:00Z', '2026-11-20T16:30:00Z', 2, 'in_person', '${HOST}'),
  ('${FULL_EVENT}', 'Governance circle', '2026-11-20T15:00:00Z', '2026-11-20T16:30:00Z', 1, 'in_person', '${HOST}'),
  ('${VIRTUAL_EVENT}', 'Virtual circle', '2026-11-20T15:00:00Z', '2026-11-20T16:30:00Z', 200, 'virtual', '${HOST}');

insert into public.majlis_rsvps (event_id, status)
select '${FULL_EVENT}', 'registered';

insert into public.majlis_rsvps (event_id, status)
select '${VIRTUAL_EVENT}', 'registered'
from generate_series(1, 148);

insert into public.majlis_applications (id, event_id, user_id, status, form_snapshot, submitted_at) values
  (
    '30000000-0000-4000-8000-0000000000d1',
    '${OPEN_EVENT}',
    '${APPLICANT}',
    'pending',
    '{"full_name":"Ada Example","phone":"+966500000000","company":"Example Holdings","role":"chairperson","linkedin":"https://www.linkedin.com/in/example","why":"Governance"}'::jsonb,
    now()
  ),
  (
    '30000000-0000-4000-8000-0000000000d2',
    '${FULL_EVENT}',
    '${SECOND}',
    'pending',
    '{"full_name":"Noura Example","phone":"+442000000000","company":"Example Capital","role":"board_member","linkedin":"","why":"Capital"}'::jsonb,
    now()
  ),
  (
    '30000000-0000-4000-8000-0000000000d3',
    '${VIRTUAL_EVENT}',
    '${APPLICANT}',
    'pending',
    '{"full_name":"Ada Example","phone":"+966500000000","company":"Example Holdings","role":"chairperson","linkedin":"","why":"Virtual"}'::jsonb,
    now()
  ),
  (
    '30000000-0000-4000-8000-0000000000d4',
    '${OPEN_EVENT}',
    '${UNVERIFIED}',
    'received',
    '{"full_name":"Omar Example","phone":"+966500000001","company":"Example Works","role":"c_suite","linkedin":"","why":""}'::jsonb,
    now()
  );
`

const assertSql = `
do $checks$
declare
  listed jsonb;
  columns text;
  send_flag boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '${STAFF}', 'role', 'authenticated')::text, false);

  set role authenticated;
  begin
    perform public.review_majlis_application('30000000-0000-4000-8000-0000000000d4', 'accepted');
    raise exception 'unverified accept was allowed';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%email_unverified%' then
        raise exception 'unverified error: %', sqlerrm;
      end if;
  end;
  set role postgres;

  if (select count(*) from public.majlis_application_audits) <> 0 then
    raise exception 'unverified decision wrote an audit row';
  end if;
  if (select status from public.majlis_applications where id = '30000000-0000-4000-8000-0000000000d4') <> 'received' then
    raise exception 'unverified status changed';
  end if;

  set role authenticated;
  if (public.review_majlis_application('30000000-0000-4000-8000-0000000000d2', 'accepted')->>'status') <> 'waitlist' then
    raise exception 'full in-person event did not waitlist';
  end if;
  set role postgres;
  if (select seat_held from public.majlis_applications where id = '30000000-0000-4000-8000-0000000000d2') then
    raise exception 'waitlist held a seat';
  end if;

  set role authenticated;
  if (public.review_majlis_application('30000000-0000-4000-8000-0000000000d3', 'accepted')->>'status') <> 'waitlist' then
    raise exception 'virtual cap did not waitlist';
  end if;

  if (public.review_majlis_application('30000000-0000-4000-8000-0000000000d1', 'accepted')->>'status') <> 'accepted' then
    raise exception 'open event did not accept';
  end if;
  set role postgres;
  if (select seat_held from public.majlis_applications where id = '30000000-0000-4000-8000-0000000000d1') is not true then
    raise exception 'accepted request did not hold a seat';
  end if;

  set role authenticated;
  if (public.review_majlis_application('30000000-0000-4000-8000-0000000000d1', 'rejected')->>'status') <> 'rejected' then
    raise exception 'reject failed';
  end if;
  set role postgres;
  if (select seat_held from public.majlis_applications where id = '30000000-0000-4000-8000-0000000000d1') then
    raise exception 'rejected request still held a seat';
  end if;

  if not exists (
    select 1 from public.majlis_application_audits
    where application_id = '30000000-0000-4000-8000-0000000000d1'
      and decision = 'accepted'
      and actor_user_id = '${STAFF}'
  ) or not exists (
    select 1 from public.majlis_application_audits
    where application_id = '30000000-0000-4000-8000-0000000000d1'
      and decision = 'rejected'
      and actor_user_id = '${STAFF}'
  ) or not exists (
    select 1 from public.majlis_application_audits
    where application_id = '30000000-0000-4000-8000-0000000000d2'
      and decision = 'waitlist'
      and actor_user_id = '${STAFF}'
  ) or not exists (
    select 1 from public.majlis_application_audits
    where application_id = '30000000-0000-4000-8000-0000000000d3'
      and decision = 'waitlist'
      and actor_user_id = '${STAFF}'
  ) then
    raise exception 'audit row mismatch';
  end if;

  select string_agg(column_name, ',' order by column_name) into columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'majlis_application_audits';
  if columns <> 'actor_user_id,application_id,created_at,decision,id' then
    raise exception 'audit columns: %', columns;
  end if;
  if exists (
    select 1 from public.majlis_application_audits a
    where a::text ilike '%example.com%' or a::text like '%+966%' or a::text ilike '%holdings%'
  ) then
    raise exception 'audit payload has applicant data';
  end if;

  set role authenticated;
  listed := public.staff_list_majlis_requests();
  if listed::text not like '%Example Holdings%' or listed::text not like '%+966500000000%' then
    raise exception 'staff list missed the form';
  end if;
  if listed::text ilike '%example.com%' or listed::text ilike '%@%' then
    raise exception 'staff list included an email';
  end if;

  if (public.staff_save_majlis_request_draft('accept', 'Updated subject', 'Updated body for the owner.')->>'send_enabled')::boolean then
    raise exception 'save reported sending on';
  end if;
  set role postgres;
  select send_enabled into send_flag from public.majlis_request_mail_drafts where kind = 'accept';
  if send_flag then
    raise exception 'draft sending turned on';
  end if;

  begin
    update public.majlis_request_mail_drafts set send_enabled = true where kind = 'decline';
    raise exception 'send flag accepted true';
  exception
    when check_violation then
      null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', '${HOST}', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_list_majlis_requests();
    raise exception 'host read the form';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'host error: %', sqlerrm;
      end if;
  end;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', '${ATTENDEE}', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_list_majlis_requests();
    raise exception 'attendee read the form';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'attendee error: %', sqlerrm;
      end if;
  end;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', '${PARTNER}', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.review_majlis_application('30000000-0000-4000-8000-0000000000d4', 'rejected');
    raise exception 'partner reviewed';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'partner error: %', sqlerrm;
      end if;
  end;

  begin
    perform 1 from public.majlis_applications;
    raise exception 'authenticated read the table';
  exception
    when insufficient_privilege then
      null;
  end;

  set role anon;
  begin
    perform public.staff_list_majlis_requests();
    raise exception 'anon listed requests';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached the function body';
      end if;
  end;
  set role postgres;
end
$checks$;
`
