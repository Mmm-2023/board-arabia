import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { handleAiToolJob, type AiToolStore, type JobRow } from '../supabase/functions/ai-tool-job/handle.ts'
import { ddDeckPathOk, purgeStoragePaths } from '../supabase/functions/_shared/retention_storage.ts'
import { deckHintText, DD_COPY } from '../src/lib/dueDiligenceCopy.ts'
import { deskIntroLine } from '../src/lib/memberIntros.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const priorMigration = path.join(root, 'supabase/migrations/20261127120000_staff_aal2_private_files.sql')
const migrationPath = path.join(root, 'supabase/migrations/20261128120000_retention_privacy_audit.sql')

const STAFF = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const VISIBLE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const DECK = '44444444-4444-4444-8444-444444444444'
const JOB = '55555555-5555-4555-8555-555555555555'
const REPORT = '66666666-6666-4666-8666-666666666666'
const AI_JOB = '77777777-7777-4777-8777-777777777777'
const AI_OUT = '88888888-8888-4888-8888-888888888888'
const AI_NOTE = '99999999-9999-4999-8999-999999999999'
const OLD_DECK = '12121212-1212-4121-8121-121212121212'
const NEW_DECK = '13131313-1313-4131-8131-131313131313'
const OLD_JOB = '14141414-1414-4141-8141-141414141414'
const NEW_JOB = '15151515-1515-4151-8151-151515151515'
const OLD_REPORT = '16161616-1616-4161-8161-161616161616'
const NEW_REPORT = '17171717-1717-4171-8171-171717171717'
const INTRO = '18181818-1818-4181-8181-181818181818'
const OLD_LOG = '19191919-1919-4191-8191-191919191919'
const PATH = `${MEMBER}/${DECK}/source.pdf`
const OLD_PATH = `${MEMBER}/${OLD_DECK}/source.pdf`
const NEW_PATH = `${MEMBER}/${NEW_DECK}/source.pptx`

test('deck hint stays current until dd_retention_copy is on', () => {
  assert.equal(deckHintText(false), DD_COPY.deckHint)
  assert.match(deckHintText(false), /Do not upload inside information\./)
  assert.equal(deckHintText(false).includes('Deleted automatically after 30 days.'), false)
  assert.match(deckHintText(true), /Deleted automatically after 30 days\./)
  assert.match(deckHintText(true), /Do not upload inside information\./)
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /dd_retention_copy/)
  assert.match(sql, /interval '7 days'/)
  assert.match(sql, /interval '120 days'/)
  assert.match(sql, /interval '12 months'/)
  assert.match(sql, /interval '24 months'/)
  assert.match(sql, /interval '13 months'/)
  assert.match(sql, /staff_access_log/)
  assert.match(sql, /due_diligence_decks/)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.match(sql, /20261127120000_staff_aal2_private_files\.sql is applied live/)
  assert.match(sql, /Apply this file only after that migration/)
  assert.equal(deskIntroLine({ kind: 'member', status: 'pending', direction: 'incoming', ask_desk: true }, 'member'), 'They asked admin to introduce you.')
})

test('sweep deletes due diligence storage paths and leaves newer paths out', async () => {
  const removed: string[] = []
  const cleared: string[] = []
  const result = await purgeStoragePaths(
    async (file) => {
      removed.push(file)
      return true
    },
    async (file) => {
      cleared.push(file)
      return true
    },
    [OLD_PATH, 'not-a-deck', NEW_PATH],
    (file) => file === OLD_PATH && ddDeckPathOk(file),
  )
  assert.deepEqual(removed, [OLD_PATH])
  assert.deepEqual(cleared, [OLD_PATH])
  assert.equal(result.removed, 1)
  assert.equal(result.failed, true)
  assert.equal(ddDeckPathOk(NEW_PATH), true)
  assert.equal(ddDeckPathOk(OLD_PATH), true)
  const edge = readFileSync(path.join(root, 'supabase/functions/retention-sweep/index.ts'), 'utf8')
  assert.match(edge, /due-diligence-decks/)
  assert.match(edge, /dd_decks/)
  assert.match(edge, /dd_files/)
  assert.match(edge, /staff_access_13m/)
})

test('shared AI status logs through the staff read hook', async () => {
  const noted: { table: string; rowId: string }[] = []
  const job: JobRow = {
    id: AI_JOB,
    member_id: MEMBER,
    tool_key: 'cfo_check',
    status: 'ready',
    step: 'done',
    storage_path: `${MEMBER}/${AI_JOB}/source.pdf`,
    file_name: 'notes.pdf',
    mime_type: 'application/pdf',
    byte_size: 12,
    error: null,
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
    shared_with_admin_at: '2026-10-06T00:00:00.000Z',
  }
  const store = {
    memberLive: async () => true,
    isStaff: async (userId: string) => userId === STAFF,
    jobById: async () => job,
    outputByJob: async () => ({
      id: AI_OUT,
      job_id: job.id,
      body: { title: 'Example', summary: 'Short', findings: [], questions: [], sources: [] },
      created_at: job.created_at,
    }),
    noteSharedRead: async (input: { staffId: string; table: string; rowId: string }) => {
      noted.push({ table: input.table, rowId: input.rowId })
    },
  } as unknown as AiToolStore
  const shared = await handleAiToolJob(
    new Request('https://example.com/ai-tool-job', {
      method: 'POST',
      body: JSON.stringify({ action: 'status', job_id: job.id }),
    }),
    {
      resolveUser: async () => ({ ok: true, userId: STAFF, aal: 'aal2' }),
      store: () => store,
      now: () => new Date('2026-10-06T00:00:00.000Z'),
    },
  )
  assert.equal(shared.status, 200)
  assert.deepEqual(noted, [
    { table: 'ai_tool_jobs', rowId: AI_JOB },
    { table: 'ai_tool_outputs', rowId: AI_OUT },
  ])
  noted.length = 0
  job.shared_with_admin_at = null
  const hidden = await handleAiToolJob(
    new Request('https://example.com/ai-tool-job', {
      method: 'POST',
      body: JSON.stringify({ action: 'status', job_id: job.id }),
    }),
    {
      resolveUser: async () => ({ ok: true, userId: STAFF, aal: 'aal2' }),
      store: () => store,
      now: () => new Date('2026-10-06T00:00:00.000Z'),
    },
  )
  assert.equal(hidden.status, 404)
  assert.equal(noted.length, 0)
})

test('retention, directory hide, download, and audit log run in postgres', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-privacy-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_privacy_${process.pid}`
  writeFileSync(script, `${fixtureSql}\n\\i ${priorMigration}\n\\i ${migrationPath}\n${assertSql}\n`)
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
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
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
  headline text,
  company text,
  location text,
  sector_tags text[],
  vision_themes text[],
  availability text,
  avatar_path text,
  avatar_style text,
  phone text,
  linkedin_url text,
  bio text,
  investable_capacity_usd numeric,
  fo_aum_usd numeric,
  turnover_usd numeric
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

do $rls$
declare
  name text;
begin
  foreach name in array array[
    'due_diligence_decks', 'due_diligence_jobs', 'due_diligence_reports',
    'ai_tool_jobs', 'ai_tool_outputs', 'ai_tool_notes', 'ai_tool_consents'
  ]
  loop
    execute format('alter table public.%I enable row level security', name);
    execute format('alter table public.%I force row level security', name);
    execute format('grant select on public.%I to authenticated', name);
  end loop;
end
$rls$;

alter table storage.objects enable row level security;
alter table storage.objects force row level security;
grant select on storage.objects to authenticated;

create policy due_diligence_decks_select_own on public.due_diligence_decks
  for select to authenticated using (member_id = auth.uid());
create policy due_diligence_jobs_select_own on public.due_diligence_jobs
  for select to authenticated using (member_id = auth.uid());
create policy due_diligence_reports_select_own on public.due_diligence_reports
  for select to authenticated using (member_id = auth.uid());
create policy ai_tool_jobs_select_own on public.ai_tool_jobs
  for select to authenticated using (member_id = auth.uid());
create policy ai_tool_outputs_select_own on public.ai_tool_outputs
  for select to authenticated using (member_id = auth.uid());
create policy ai_tool_notes_select_own on public.ai_tool_notes
  for select to authenticated using (member_id = auth.uid());
create policy ai_tool_consents_select_own on public.ai_tool_consents
  for select to authenticated using (member_id = auth.uid());
create policy ai_tool_consents_select_staff on public.ai_tool_consents
  for select to authenticated using (private.is_staff());
create policy member_avatars_select_staff on storage.objects
  for select to authenticated using (bucket_id = 'member-avatars' and private.is_staff());

insert into public.staff_users (user_id, role, email) values
  ('${STAFF}', 'staff', 'staff@example.com');
insert into public.due_diligence_decks (id, member_id, storage_path) values
  ('${DECK}', '${MEMBER}', '${PATH}');
insert into public.due_diligence_jobs (id, member_id, status) values
  ('${JOB}', '${MEMBER}', 'ready');
insert into public.due_diligence_reports (id, member_id, job_id, deck_id) values
  ('${REPORT}', '${MEMBER}', '${JOB}', '${DECK}');
insert into public.ai_tool_jobs (id, member_id, status) values
  ('${AI_JOB}', '${MEMBER}', 'ready');
insert into public.ai_tool_outputs (id, job_id, member_id) values
  ('${AI_OUT}', '${AI_JOB}', '${MEMBER}');
insert into public.ai_tool_notes (id, job_id, member_id) values
  ('${AI_NOTE}', '${AI_JOB}', '${MEMBER}');
insert into public.ai_tool_consents (id, member_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${MEMBER}');
insert into storage.objects (id, bucket_id, name) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'due-diligence-decks', '${PATH}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'member-avatars', '${MEMBER}/avatar');
`

const assertSql = `
create table public.candidates (
  user_id uuid primary key,
  email text,
  full_name text,
  role text,
  region text,
  request_state text,
  email_verified_at timestamptz,
  created_at timestamptz,
  decided_at timestamptz,
  retention_reminded_at timestamptz,
  invite_token_id uuid,
  analytics_id text,
  company_name text,
  job_title text,
  company_website text,
  linkedin_url text,
  statement text,
  cr_number text,
  referral_name text,
  phone text,
  free_webmail boolean,
  linkedin_checked boolean,
  cr_checked boolean,
  ft_source text,
  ft_medium text
);
create table public.candidate_notes (
  id uuid primary key,
  candidate_user_id uuid,
  body text,
  created_at timestamptz
);
create table public.candidate_events (
  id uuid primary key,
  candidate_user_id uuid,
  kind text,
  detail jsonb,
  created_at timestamptz
);
create table public.applications (
  id uuid primary key,
  status text,
  decision_at timestamptz,
  email text,
  full_name text
);
create table public.consent_log (
  id uuid primary key,
  created_at timestamptz,
  user_id uuid,
  choice text
);
create table public.member_invites (
  id uuid primary key,
  status text
);
create table public.ai_tool_file_purge (
  storage_path text primary key,
  created_at timestamptz not null default now()
);
create table public.member_intros (
  id uuid primary key,
  requester_id uuid,
  target_id uuid,
  status text,
  reason text,
  ask_desk boolean,
  desk_status text,
  desk_note text,
  requested_at timestamptz,
  decided_at timestamptz
);
create table public.member_tier_audits (
  id uuid primary key,
  member_user_id uuid,
  before_tiers text[],
  after_tiers text[],
  created_at timestamptz
);
create table public.directory_entries (
  id uuid primary key,
  full_name text,
  headline text,
  company text,
  location text,
  sector text,
  vision_themes text[],
  availability text,
  seat text,
  portrait_asset text,
  sort_order int,
  is_demo boolean
);
alter table public.ai_tool_consents add column if not exists tool_key text;
alter table public.ai_tool_consents add column if not exists accepted_at timestamptz;

create or replace function private.can_read_member_room() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m
    where m.user_id = auth.uid() and m.status in ('invited', 'active')
  );
$$;

create or replace function private.demo_rows_visible(p_surface text, p_count int) returns boolean
language sql stable as $$
  select false;
$$;

insert into public.members (user_id, status, seat, email, directory_hidden) values
  ('${MEMBER}', 'active', 'ksa', 'member@example.com', true),
  ('${OTHER}', 'active', 'intl', 'other@example.com', false),
  ('${VISIBLE}', 'active', 'ksa', 'visible@example.com', false);
insert into public.profiles (user_id, full_name, headline, company, location, phone) values
  ('${MEMBER}', 'Hidden Member', 'Chair', 'Example Co', 'Riyadh', '+10000000000'),
  ('${OTHER}', 'Other Member', 'Director', 'Example Co', 'London', '+10000000001'),
  ('${VISIBLE}', 'Visible Member', 'Director', 'Example Co', 'Jeddah', '+10000000002');
insert into public.candidates (user_id, email, full_name, request_state, created_at) values
  ('${MEMBER}', 'member@example.com', 'Hidden Member', 'submitted', now());
insert into public.member_intros (id, requester_id, target_id, status, reason, ask_desk, requested_at) values
  ('${INTRO}', '${MEMBER}', '${OTHER}', 'pending', 'A short reason', true, now());
insert into public.due_diligence_decks (id, member_id, storage_path, created_at) values
  ('${OLD_DECK}', '${MEMBER}', '${OLD_PATH}', now() - interval '40 days'),
  ('${NEW_DECK}', '${MEMBER}', '${NEW_PATH}', now() - interval '1 day');
insert into public.due_diligence_jobs (id, member_id, status, deck_id, created_at) values
  ('${OLD_JOB}', '${MEMBER}', 'ready', '${OLD_DECK}', now() - interval '40 days'),
  ('${NEW_JOB}', '${MEMBER}', 'ready', '${NEW_DECK}', now() - interval '1 day');
insert into public.due_diligence_reports (id, member_id, job_id, deck_id, created_at) values
  ('${OLD_REPORT}', '${MEMBER}', '${OLD_JOB}', '${OLD_DECK}', now() - interval '40 days'),
  ('${NEW_REPORT}', '${MEMBER}', '${NEW_JOB}', '${NEW_DECK}', now() - interval '1 day');
insert into public.staff_access_log (id, staff_user_id, member_id, object_type, object_id, action, created_at) values
  ('${OLD_LOG}', '${STAFF}', '${MEMBER}', 'member', '${MEMBER}', 'read', now() - interval '14 months');

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
  plan jsonb;
  listed jsonb;
  payload jsonb;
  intro jsonb;
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  plan := public.retention_sweep_plan(false);
  if not (plan -> 'dd_decks') ? '${OLD_DECK}' then perform pg_temp.fail('old deck missing'); end if;
  if (plan -> 'dd_decks') ? '${NEW_DECK}' then perform pg_temp.fail('new deck listed'); end if;
  if (plan -> 'dd_decks') ? '${DECK}' then perform pg_temp.fail('fresh deck listed'); end if;
  if not (plan -> 'dd_jobs') ? '${OLD_JOB}' then perform pg_temp.fail('old job missing'); end if;
  if (plan -> 'dd_jobs') ? '${NEW_JOB}' then perform pg_temp.fail('new job listed'); end if;
  if not (plan -> 'dd_reports') ? '${OLD_REPORT}' then perform pg_temp.fail('old report missing'); end if;
  if (plan -> 'dd_reports') ? '${NEW_REPORT}' then perform pg_temp.fail('new report listed'); end if;
  if not (plan -> 'dd_files') ? '${OLD_PATH}' then perform pg_temp.fail('old path missing'); end if;
  if (plan -> 'dd_files') ? '${NEW_PATH}' then perform pg_temp.fail('new path listed'); end if;
  if not (plan -> 'staff_access_log') ? '${OLD_LOG}' then perform pg_temp.fail('old access log missing'); end if;
  if plan ? 'unverified' and plan ? 'consent' and plan ? 'members' then
    null;
  else
    perform pg_temp.fail('retention keys');
  end if;

  perform pg_temp.assume('${OTHER}', 'aal1', 'authenticated');
  listed := public.list_directory();
  if listed::text like '%${MEMBER}%' then perform pg_temp.fail('hidden member listed'); end if;
  if listed::text not like '%${VISIBLE}%' then perform pg_temp.fail('visible member missing'); end if;
  if listed::text like '%other@example.com%' or listed::text like '%+10000000002%' then
    perform pg_temp.fail('directory contact');
  end if;

  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  intro := public.staff_read_desk_intro('${INTRO}'::uuid);
  if intro ->> 'requester_id' is distinct from '${MEMBER}' then perform pg_temp.fail('hidden intro requester'); end if;
  if (intro ->> 'requester_hidden')::boolean is distinct from true then perform pg_temp.fail('hidden flag'); end if;
  perform public.staff_read_member('${MEMBER}'::uuid);
  perform public.staff_read_membership_request('${MEMBER}'::uuid);
  set role postgres;
  update public.due_diligence_reports set shared_with_admin_at = now() where id = '${REPORT}';
  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  perform public.staff_read_shared_item('due_diligence_reports', '${REPORT}'::uuid);
  perform set_config('request.jwt.claims', json_build_object('sub', '${STAFF}', 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role postgres;
  perform private.note_staff_shared_read('ai_tool_jobs', '${AI_JOB}'::uuid);

  select count(*) into n from public.staff_access_log where object_type = 'membership_request' and member_id = '${MEMBER}';
  if n < 1 then perform pg_temp.fail('membership log'); end if;
  select count(*) into n from public.staff_access_log where object_type = 'member' and member_id = '${MEMBER}';
  if n < 1 then perform pg_temp.fail('member log'); end if;
  select count(*) into n from public.staff_access_log where object_type = 'desk_intro' and member_id = '${MEMBER}';
  if n < 1 then perform pg_temp.fail('intro log'); end if;
  select count(*) into n from public.staff_access_log where object_type = 'due_diligence_reports' and object_id = '${REPORT}';
  if n < 1 then perform pg_temp.fail('shared report log'); end if;
  select count(*) into n from public.staff_access_log where object_type = 'ai_tool_jobs' and object_id = '${AI_JOB}';
  if n < 1 then perform pg_temp.fail('shared ai log'); end if;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  if (select count(*) from public.staff_access_log) <> 0 then perform pg_temp.fail('member read log'); end if;
  perform pg_temp.assume('${STAFF}', 'aal1', 'authenticated');
  if (select count(*) from public.staff_access_log) <> 0 then perform pg_temp.fail('aal1 read log'); end if;
  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  if (select count(*) from public.staff_access_log) < 1 then perform pg_temp.fail('aal2 read log'); end if;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  begin
    insert into public.staff_access_log (staff_user_id, member_id, object_type, action)
    values ('${MEMBER}', '${MEMBER}', 'member', 'read');
    perform pg_temp.fail('member insert');
  exception when insufficient_privilege then
    null;
  end;
  begin
    update public.staff_access_log set action = 'read';
    perform pg_temp.fail('member update');
  exception when insufficient_privilege then
    null;
  end;
  begin
    delete from public.staff_access_log;
    perform pg_temp.fail('member delete');
  exception when insufficient_privilege then
    null;
  end;
  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  begin
    insert into public.staff_access_log (staff_user_id, member_id, object_type, action)
    values ('${STAFF}', '${MEMBER}', 'member', 'read');
    perform pg_temp.fail('staff insert');
  exception when insufficient_privilege then
    null;
  end;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  payload := public.download_my_data();
  if payload #>> '{member,email}' is distinct from 'member@example.com' then perform pg_temp.fail('own email'); end if;
  if payload::text like '%other@example.com%' then perform pg_temp.fail('other email leaked'); end if;
  if payload::text like '%+10000000001%' then perform pg_temp.fail('other phone leaked'); end if;
  begin
    perform public.download_my_data();
    perform pg_temp.fail('rate limit');
  exception when insufficient_privilege then
    if sqlerrm not like '%rate_limited%' then perform pg_temp.fail('rate message'); end if;
  end;

  perform pg_temp.assume('${OTHER}', 'aal1', 'authenticated');
  payload := public.download_my_data();
  if payload::text like '%member@example.com%' then perform pg_temp.fail('caller rows leaked'); end if;
  if payload #>> '{member,email}' is distinct from 'other@example.com' then perform pg_temp.fail('other own email'); end if;

  set role anon;
  begin
    perform public.download_my_data();
    perform pg_temp.fail('anon download');
  exception when insufficient_privilege then
    null;
  end;
end
$checks$;
`
