import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  BOARD_SEAT_LIMITS,
  boardSeatProblem,
  emptyBoardSeatDraft,
  notificationLine,
  presentBoardSeatApplicants,
  presentUnreadNotification,
} from '../src/lib/boardSeats.ts'
import { assembleHome, type AssembleInput } from '../src/lib/homeSnapshot.ts'
import { SECTOR_TAGS } from '../src/lib/profileTags.ts'
import { RE_REGIONS } from '../src/lib/reRegions.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261224120000_board_seats_notifications.sql'
const earlierName = '20261219120000_operator_row_owner_lock.sql'
const migrationPath = path.join(migrationsDir, migrationName)
const migration = readFileSync(migrationPath, 'utf8')

const STAFF = '11111111-1111-4111-8111-111111111111'
const OWNER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const APPLICANT = '44444444-4444-4444-8444-444444444444'
const RE_ROLE = 'b3000001-0000-4000-8000-0000000000aa'
const DRAFT = 'b3000001-0000-4000-8000-0000000000bb'
const INTRO = 'c3000001-0000-4000-8000-0000000000cc'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function slice(start: string, end: string) {
  const from = migration.indexOf(start)
  const to = migration.indexOf(end, from + start.length)
  assert.ok(from >= 0, start)
  assert.ok(to > from, end)
  return migration.slice(from, to)
}

test('the seat migration exists and sorts after the operator lock', () => {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  assert.ok(files.includes(migrationName))
  assert.ok(files.includes(earlierName))
  assert.ok(migrationName > earlierName)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/\b(price|fee|usd|sar)\b|cron|pg_cron|net\.http|send_email/i.test(migration), false)
  assert.equal(/\bto anon\b/i.test(migration), false)
  assert.equal(/grant\s+all\s+on\s+[^;]*\bto\s+public\b/i.test(migration), false)
  const emails = migration.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
  assert.deepEqual(emails, [])
  assert.equal(SECTOR_TAGS.length, 16)
  assert.equal(RE_REGIONS.length, 13)
  assert.match(migration, /private\.profile_sector_tags\(\), 16/)
  assert.match(migration, /private\.board_seat_regions\(\), 13/)
  for (const table of ['member_notifications', 'member_notification_prefs']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`))
  }
  assert.equal(/create policy[^;]*is_staff\(\)/i.test(migration), false)
  assert.equal(/grant execute on function private\.raise_member_notification/i.test(migration), false)
  const headers = migration.split(/create or replace function /i).slice(1)
  assert.ok(headers.length >= 16)
  for (const header of headers) {
    assert.match(header.slice(0, header.indexOf('as $$')), /set search_path = ''/)
  }
  const publish = slice('function public.staff_publish_board_seat', 'revoke all on function public.staff_publish_board_seat')
  assert.match(publish, /if not private\.is_staff\(\)/)
  assert.ok(publish.indexOf('if not private.is_staff()') < publish.indexOf('update public.re_board_roles'))
  const feed = slice('-- member_board_role_feed_v2_begin', '-- member_board_role_feed_v2_end')
  assert.match(feed, /and scope = 'real_estate'/)
  assert.match(feed, /and r\.scope = 'real_estate'/)
  assert.match(feed, /m\.seat in \('ksa', 'intl'\)/)
  assert.match(migration, /and r\.scope = 'real_estate'/)
  const applicants = slice(
    'function public.staff_list_board_seat_applicants',
    'revoke all on function public.staff_list_board_seat_applicants',
  )
  assert.match(applicants, /private\.log_staff_access/)
  assert.match(applicants, /'board_seat_applicant'/)
  assert.equal(applicants.includes('contact_email'), false)
  assert.equal(applicants.includes('turnover'), false)
  assert.equal(applicants.includes('.email'), false)
  assert.equal(applicants.includes('.phone'), false)
  assert.ok(applicants.indexOf('if not private.is_staff()') < applicants.indexOf('log_staff_access'))
})

test('seat copy and presenters keep contacts off the member note and the applicant card', () => {
  const draft = {
    ...emptyBoardSeatDraft(),
    title: 'Independent director',
    sector: 'Health',
    capacity: 'Four meetings a year.',
    sectorTags: ['Financial services'],
    regions: ['Riyadh'],
    organisationName: 'Example Holdings',
    terms: 'Independent seat.',
    contactName: 'Noura S.',
    contactEmail: 'noura.seat@example.com',
    contactPhone: 'Extension 20',
    narrative: 'A fictional company seat.',
  }
  assert.equal(boardSeatProblem(draft, 'draft'), '')
  assert.equal(boardSeatProblem({ ...draft, sectorTags: [], regions: [] }, 'publish'), 'Choose at least one sector or region before you publish.')
  assert.match(boardSeatProblem({ ...draft, seatKind: 'company_board', contactEmail: '' }, 'draft'), /contact/)
  assert.equal(boardSeatProblem({ ...draft, seatKind: 'ned', contactName: '', contactEmail: '', contactPhone: '' }, 'draft'), '')
  assert.equal(BOARD_SEAT_LIMITS.sectors, 16)
  const dropped = presentBoardSeatApplicants([
    {
      id: INTRO,
      member_name: 'Example Member',
      headline: 'Board director',
      company: 'Example Holdings',
      note: 'Happy to be considered.',
      status: 'pending',
      contact_email: 'hidden.person@example.com',
      phone: '555-0100',
    },
    {
      id: 'drop',
      member_name: 'Mail Person',
      headline: 'hidden.person@example.com',
      company: 'Example Holdings',
      note: 'Hello',
      status: 'pending',
    },
  ])
  assert.equal(dropped.length, 1)
  assert.equal(JSON.stringify(dropped).includes('@'), false)
  assert.equal(JSON.stringify(dropped).includes('555'), false)
  const note = presentUnreadNotification({
    id: 'n1',
    title: 'A seat that fits your profile',
    body: 'Health in Riyadh.',
  })
  assert.ok(note)
  assert.equal(notificationLine(note), 'A seat that fits your profile Health in Riyadh.')
  assert.equal(presentUnreadNotification({ id: 'n2', title: 'Write hidden.person@example.com', body: '' }), null)
  assert.equal(source('src/pages/admin/AdminHome.tsx').includes('BoardSeatsPanel'), true)
  assert.equal(source('src/pages/dashboard/DashboardHome.tsx').includes('loadUnreadNotification'), true)
  for (const rel of [
    'src/pages/admin/BoardSeatsView.tsx',
    'src/pages/admin/BoardSeatsPanel.tsx',
    'src/lib/boardSeats.ts',
    'src/lib/boardSeatApi.ts',
    'src/lib/memberNotifications.ts',
  ]) {
    const text = source(rel)
    assert.equal(text.includes('\u2014'), false, rel)
    assert.equal(text.includes('\u2013'), false, rel)
    assert.equal(/\bthe desk\b/i.test(text), false, rel)
    assert.equal(/\bsponsor/i.test(text), false, rel)
    assert.equal(/\b(price|fee)\b/i.test(text), false, rel)
  }
})

test('admin seat panel and the member notification line render', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const view = await vite.ssrLoadModule('/src/pages/admin/BoardSeatsView.tsx')
    const home = await vite.ssrLoadModule('/src/pages/dashboard/HomeSnapshotView.tsx')
    const seat = {
      id: DRAFT,
      isDemo: false,
      seatKind: 'company_board' as const,
      status: 'pending_review' as const,
      title: 'Independent director',
      sector: 'Health',
      capacity: 'Four meetings a year.',
      sectorTags: ['Financial services'],
      regions: ['Riyadh'],
      organisationName: 'Example Holdings',
      terms: 'Independent seat.',
      contactName: 'Noura S.',
      contactEmail: 'noura.seat@example.com',
      contactPhone: 'Extension 20',
      narrative: 'A fictional company seat.',
      posterName: 'Example Member',
      applicantCount: 1,
    }
    const html = renderToStaticMarkup(
      createElement(view.BoardSeatsView, {
        status: 'ready',
        seats: [seat],
        draft: emptyBoardSeatDraft(),
        editingId: null,
        message: '',
        notice: '',
        busy: false,
        openId: DRAFT,
        applicants: {
          [DRAFT]: [
            {
              id: INTRO,
              memberName: 'Example Member',
              headline: 'Board director',
              company: 'Example Holdings',
              note: 'Happy to be considered.',
              status: 'pending',
            },
          ],
        },
        onDraft: () => {},
        onSubmit: () => {},
        onEdit: () => {},
        onPublish: () => {},
        onClose: () => {},
        onOpenApplicants: () => {},
        onRetry: () => {},
      }),
    )
    assert.match(html, /data-board-seats-panel/)
    assert.match(html, /Board seats/)
    assert.match(html, /Approve/)
    assert.match(html, /Decline/)
    assert.match(html, /Example Member/)
    assert.match(html, /Happy to be considered/)
    assert.match(html, /name@example\.com/)
    assert.equal(html.includes('\u2014'), false)
    assert.equal(/\bsponsor/i.test(html), false)
    const leaked = html.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
    assert.ok(leaked.every((email) => email.endsWith('@example.com')))

    const model = assembleHome(homeInput())
    const member = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(home.HomeSnapshotView, {
          model,
          needsYou: [],
          unreadNote: {
            id: 'n1',
            title: 'A seat that fits your profile',
            body: '',
          },
          onMarkNotificationRead: () => {},
        }),
      ),
    )
    const noteAt = member.indexOf('data-home-notification')
    const needsAt = member.indexOf('data-home-needs')
    assert.ok(noteAt >= 0)
    assert.equal(needsAt, -1)
    assert.match(member, /A seat that fits your profile/)
    assert.match(member, /Mark read/)
    assert.equal(member.includes('@'), false)
    assert.equal(/\b(price|fee)\b/i.test(member), false)
  } finally {
    await vite.close()
  }
})

test('staff aal1 cannot publish, and notification rows stay with the owner', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-sm1-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_sm1_${process.pid}`
  writeFileSync(script, `${fixtureSql}\n\\i ${migrationPath}\n${assertSql}\n`)
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

function homeInput(): AssembleInput {
  return {
    nowMs: Date.parse('2026-10-13T09:00:00.000Z'),
    seat: 'ksa',
    name: 'Huda Al Sample',
    photoUrl: null,
    profileReady: true,
    mustSetPassword: false,
    invitesRemaining: 0,
    personalCapacityIncluded: false,
    attention: [],
    mandates: [],
    rooms: [],
    directory: [],
    partners: [],
    gatherings: [],
    admitted: 12,
    ksa: 8,
    intl: 4,
    money: [],
    activity: [],
    activityStatus: 'empty',
    loading: false,
    partialError: false,
    updatedLabel: 'Updated 09:00',
  }
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
exception
  when unique_violation then
    null;
end
$roles$;

create schema if not exists auth;
create schema if not exists private;
grant usage on schema public, private, auth to anon, authenticated, service_role;

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
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
$$;

grant execute on function auth.uid() to public;
grant execute on function auth.jwt() to public;
grant execute on function auth.role() to public;

create table public.members (
  user_id uuid primary key
);

create table public.profiles (
  user_id uuid primary key,
  full_name text,
  headline text,
  company text
);

create table public.staff_users (
  user_id uuid primary key,
  role text not null
);

create table public.staff_access_log (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid,
  member_id uuid,
  object_type text,
  object_id uuid,
  action text
);

create table public.re_board_roles (
  id uuid primary key default gen_random_uuid(),
  is_demo boolean not null default false,
  published boolean not null default false,
  seat_kind text not null,
  title text not null,
  sector text not null,
  capacity text not null,
  city text,
  asset_class text,
  organisation_name text not null,
  terms text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  narrative text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint re_board_roles_seat_kind check (seat_kind in ('developer', 'propco')),
  constraint re_board_roles_city check (
    city is null or city in ('Riyadh', 'Makkah', 'Eastern Province')
  ),
  constraint re_board_roles_asset_class check (
    asset_class is null or asset_class in ('residential', 'hospitality')
  )
);

create table public.re_board_role_intros (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.re_board_roles (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status text not null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_users s
    where s.user_id = auth.uid()
      and s.role in ('staff', 'master')
  )
  and (auth.jwt() ->> 'aal') = 'aal2';
$$;

create or replace function private.log_staff_access(
  p_staff uuid,
  p_member uuid,
  p_object_type text,
  p_object_id uuid,
  p_action text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action is distinct from 'read' then
    return;
  end if;
  insert into public.staff_access_log (staff_user_id, member_id, object_type, object_id, action)
  values (p_staff, p_member, p_object_type, p_object_id, 'read');
end;
$$;

create or replace function private.profile_sector_tags()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'Energy transition',
    'Health',
    'Tourism',
    'Financial services',
    'Logistics',
    'Mining',
    'Digital infrastructure',
    'Food security',
    'Real estate',
    'Industrials and manufacturing',
    'Technology and telecom',
    'Consumer and retail',
    'Construction and infrastructure',
    'Education',
    'Media and entertainment',
    'Utilities and water'
  ]::text[];
$$;

insert into public.members (user_id) values
  ('${OWNER}'),
  ('${OTHER}'),
  ('${APPLICANT}');

insert into public.staff_users (user_id, role) values ('${STAFF}', 'staff');

insert into public.profiles (user_id, full_name, headline, company)
values ('${APPLICANT}', 'Example Member', 'Board director', 'Example Holdings');

insert into public.re_board_roles (
  id, is_demo, published, seat_kind, title, sector, capacity, city, asset_class,
  organisation_name, terms, contact_name, contact_email, contact_phone, narrative, sort_order
) values (
  '${RE_ROLE}',
  false,
  true,
  'developer',
  'Independent director',
  'Housing',
  'Four meetings a year.',
  'Riyadh',
  'residential',
  'Example Holdings',
  'Independent seat.',
  'Noura S.',
  'noura.seat@example.com',
  'Extension 20',
  'A fictional real estate seat.',
  1
);
`

const assertSql = `
create or replace function pg_temp.fail(msg text) returns void
language plpgsql as $$
begin
  raise exception '%', msg;
end;
$$;

create or replace function pg_temp.assume(p_sub uuid, p_aal text, p_role text) returns void
language plpgsql as $$
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
  v_scope text;
  v_status text;
  v_published boolean;
  v_note uuid;
  v_count int;
  v_payload jsonb;
  v_title text;
  v_nudges boolean;
begin
  select scope, status, published into v_scope, v_status, v_published
  from public.re_board_roles
  where id = '${RE_ROLE}';
  if v_scope is distinct from 'real_estate' or v_status is distinct from 'published' or v_published is not true then
    perform pg_temp.fail('real estate row drifted');
  end if;

  begin
    insert into public.re_board_roles (
      is_demo, published, scope, status, seat_kind, title, sector, capacity,
      organisation_name, terms, narrative
    ) values (
      false, false, 'real_estate', 'draft', 'developer', 'Open seat', 'Housing', 'Quarterly.',
      'Example Holdings', 'Terms.', 'Narrative.'
    );
    perform pg_temp.fail('real estate without place');
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.re_board_roles (
      is_demo, published, scope, status, seat_kind, title, sector, capacity,
      organisation_name, terms, narrative, sector_tags
    ) values (
      false, false, 'general', 'draft', 'company_board', 'Open seat', 'Health', 'Quarterly.',
      'North Court', 'Terms.', 'Narrative.', array['Health']
    );
    perform pg_temp.fail('company seat without contact');
  exception
    when check_violation then
      null;
  end;

  insert into public.re_board_roles (
    id, is_demo, published, scope, status, seat_kind, title, sector, capacity,
    organisation_name, terms, contact_name, contact_email, contact_phone, narrative,
    sector_tags, regions, posted_by_member_id
  ) values (
    '${DRAFT}', false, false, 'general', 'pending_review', 'company_board',
    'Independent director', 'Health', 'Four meetings a year.',
    'Example Holdings', 'Independent seat.', 'Noura S.', 'noura.seat@example.com', 'Extension 20',
    'A fictional company seat.',
    array['Financial services'], array['Riyadh'], '${APPLICANT}'
  );

  begin
    insert into public.re_board_role_intros (role_id, member_id, status, note)
    values ('${DRAFT}', '${APPLICANT}', 'pending', 'Write name@example.com');
    perform pg_temp.fail('note with at sign');
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.re_board_role_intros (role_id, member_id, status, note)
    values ('${DRAFT}', '${APPLICANT}', 'pending', 'Call 555-0100 now');
    perform pg_temp.fail('note with phone');
  exception
    when check_violation then
      null;
  end;

  insert into public.re_board_role_intros (id, role_id, member_id, status, note, decided_by_role)
  values ('${INTRO}', '${DRAFT}', '${APPLICANT}', 'pending', 'Happy to be considered.', 'poster');

  begin
    insert into public.re_board_role_intros (role_id, member_id, status, decided_by_role)
    values ('${RE_ROLE}', '${OTHER}', 'pending', 'member');
    perform pg_temp.fail('bad decided by');
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.member_notifications (member_id, kind, title, body)
    values ('${OWNER}', 'board_seat_match', 'A seat that fits your profile', '');
    perform pg_temp.fail('direct notification insert');
  exception
    when insufficient_privilege then
      null;
  end;

  v_note := private.raise_member_notification(
    '${OWNER}', 'board_seat_match', '${DRAFT}', 'A seat that fits your profile', 'Health in Riyadh.'
  );
  if v_note is null then
    perform pg_temp.fail('raise returned null');
  end if;

  if has_table_privilege('anon', 'public.member_notifications', 'select') then
    perform pg_temp.fail('anon select');
  end if;
  if has_table_privilege('anon', 'public.member_notification_prefs', 'select') then
    perform pg_temp.fail('anon prefs');
  end if;
  if has_table_privilege('authenticated', 'public.member_notifications', 'insert') then
    perform pg_temp.fail('member insert grant');
  end if;
  if has_column_privilege('authenticated', 'public.member_notifications', 'title', 'update') then
    perform pg_temp.fail('member title update');
  end if;
  if not has_column_privilege('authenticated', 'public.member_notifications', 'read_at', 'update') then
    perform pg_temp.fail('member read_at update');
  end if;
  if has_function_privilege('authenticated', 'private.raise_member_notification(uuid, text, uuid, text, text)', 'execute') then
    perform pg_temp.fail('member can raise');
  end if;
  if has_function_privilege('anon', 'public.staff_publish_board_seat(uuid)', 'execute') then
    perform pg_temp.fail('anon can publish');
  end if;

  perform pg_temp.assume('${STAFF}', 'aal1', 'authenticated');
  begin
    perform public.staff_publish_board_seat('${DRAFT}');
    perform pg_temp.fail('aal1 published');
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform public.staff_list_board_seat_applicants('${DRAFT}');
    perform pg_temp.fail('aal1 listed applicants');
  exception
    when insufficient_privilege then
      null;
  end;
  select count(*) into v_count from public.member_notifications;
  if v_count <> 0 then
    perform pg_temp.fail('aal1 staff saw a notification');
  end if;
  execute 'reset role';
  select count(*) into v_count from public.staff_access_log;
  if v_count <> 0 then
    perform pg_temp.fail('aal1 wrote a log');
  end if;

  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  perform public.staff_publish_board_seat('${DRAFT}');
  select count(*) into v_count from public.member_notifications;
  if v_count <> 0 then
    perform pg_temp.fail('aal2 staff saw a notification');
  end if;
  v_payload := public.staff_list_board_seat_applicants('${DRAFT}');
  if jsonb_array_length(v_payload) <> 1 then
    perform pg_temp.fail('applicant count');
  end if;
  if position('@' in v_payload::text) > 0 then
    perform pg_temp.fail('applicant payload has an address');
  end if;
  if v_payload->0->>'member_name' is distinct from 'Example Member' then
    perform pg_temp.fail('applicant name');
  end if;
  if v_payload->0 ? 'contact_email' or v_payload->0 ? 'phone' or v_payload->0 ? 'turnover' then
    perform pg_temp.fail('applicant secret key');
  end if;
  v_payload := public.my_unread_notification();
  if v_payload is distinct from 'null'::jsonb then
    perform pg_temp.fail('staff unread');
  end if;
  execute 'reset role';
  select status, published into v_status, v_published
  from public.re_board_roles
  where id = '${DRAFT}';
  if v_status is distinct from 'published' or v_published is not true then
    perform pg_temp.fail('aal2 did not publish');
  end if;
  select count(*) into v_count
  from public.staff_access_log
  where object_type = 'board_seat_applicant'
    and action = 'read'
    and member_id = '${APPLICANT}'
    and staff_user_id = '${STAFF}';
  if v_count <> 1 then
    perform pg_temp.fail('applicant read was not logged');
  end if;

  perform pg_temp.assume('${OWNER}', 'aal2', 'authenticated');
  select count(*) into v_count from public.member_notifications;
  if v_count <> 1 then
    perform pg_temp.fail('owner count');
  end if;
  v_payload := public.my_unread_notification();
  v_title := v_payload->>'title';
  if v_title is distinct from 'A seat that fits your profile' then
    perform pg_temp.fail('owner unread');
  end if;
  update public.member_notifications set read_at = pg_catalog.now() where id = v_note;
  v_payload := public.my_unread_notification();
  if v_payload is distinct from 'null'::jsonb then
    perform pg_temp.fail('read note still unread');
  end if;
  begin
    update public.member_notifications set title = 'Changed' where id = v_note;
    perform pg_temp.fail('owner retitled');
  exception
    when insufficient_privilege then
      null;
  end;
  insert into public.member_notification_prefs (member_id, board_seat_nudges)
  values ('${OWNER}', false);
  select board_seat_nudges into v_nudges
  from public.member_notification_prefs
  where member_id = '${OWNER}';
  if v_nudges is not false then
    perform pg_temp.fail('owner nudge');
  end if;

  perform pg_temp.assume('${OTHER}', 'aal2', 'authenticated');
  select count(*) into v_count from public.member_notifications;
  if v_count <> 0 then
    perform pg_temp.fail('other member saw a notification');
  end if;
  select count(*) into v_count from public.member_notification_prefs;
  if v_count <> 0 then
    perform pg_temp.fail('other member saw prefs');
  end if;
  begin
    insert into public.member_notification_prefs (member_id, board_seat_nudges)
    values ('${OWNER}', true);
    perform pg_temp.fail('other member wrote prefs');
  exception
    when insufficient_privilege then
      null;
  end;
end
$checks$;

do $anon$
begin
  perform pg_temp.assume('${OWNER}', 'aal2', 'anon');
  perform count(*) from public.member_notifications;
  perform pg_temp.fail('anon read');
exception
  when insufficient_privilege then
    execute 'reset role';
end;
$anon$;
`
