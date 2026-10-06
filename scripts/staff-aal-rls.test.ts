import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(root, 'supabase/migrations/20261127120000_staff_aal2_private_files.sql')

const STAFF = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const DECK = '44444444-4444-4444-8444-444444444444'
const JOB = '55555555-5555-4555-8555-555555555555'
const REPORT = '66666666-6666-4666-8666-666666666666'
const AI_JOB = '77777777-7777-4777-8777-777777777777'
const AI_OUT = '88888888-8888-4888-8888-888888888888'
const AI_NOTE = '99999999-9999-4999-8999-999999999999'
const PATH = `${MEMBER}/${DECK}/source.pdf`

test('staff aal policies and share RPCs run in postgres', () => {
  const migration = readFileSync(migrationPath, 'utf8')
  assert.match(migration, /note_staff_shared_read/)
  assert.match(migration, /ai_tool_consents_select_staff/)
  assert.match(migration, /member_avatars_select_staff/)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)

  const dir = mkdtempSync(path.join(tmpdir(), 'ba-aal-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_aal_${process.pid}`
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
  n integer;
  counts jsonb;
begin
  perform pg_temp.assume('${STAFF}', 'aal1', 'authenticated');
  begin
    perform public.staff_private_work_counts();
    perform pg_temp.fail('staff aal1 rpc');
  exception when insufficient_privilege then
    null;
  end;
  if private.is_staff() then
    perform pg_temp.fail('staff aal1 is_staff');
  end if;
  if (select count(*) from public.due_diligence_decks) <> 0 then perform pg_temp.fail('aal1 decks'); end if;
  if (select count(*) from public.due_diligence_reports) <> 0 then perform pg_temp.fail('aal1 reports'); end if;
  if (select count(*) from public.due_diligence_jobs) <> 0 then perform pg_temp.fail('aal1 jobs'); end if;
  if (select count(*) from public.ai_tool_outputs) <> 0 then perform pg_temp.fail('aal1 outputs'); end if;
  if (select count(*) from public.ai_tool_notes) <> 0 then perform pg_temp.fail('aal1 notes'); end if;
  if (select count(*) from public.ai_tool_jobs) <> 0 then perform pg_temp.fail('aal1 ai jobs'); end if;
  if (select count(*) from public.ai_tool_consents) <> 0 then perform pg_temp.fail('aal1 consents'); end if;
  if (select count(*) from storage.objects) <> 0 then perform pg_temp.fail('aal1 storage'); end if;

  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  if not private.is_staff() then perform pg_temp.fail('staff aal2 is_staff'); end if;
  if (select count(*) from public.ai_tool_consents) <> 1 then perform pg_temp.fail('aal2 consents kept'); end if;
  if (select count(*) from storage.objects where bucket_id = 'member-avatars') <> 1 then
    perform pg_temp.fail('aal2 avatars kept');
  end if;
  if (select count(*) from public.due_diligence_reports) <> 0 then perform pg_temp.fail('aal2 unshared report'); end if;
  if (select count(*) from public.due_diligence_decks) <> 0 then perform pg_temp.fail('aal2 unshared deck'); end if;
  if (select count(*) from public.due_diligence_jobs) <> 0 then perform pg_temp.fail('aal2 unshared job'); end if;
  if (select count(*) from public.ai_tool_outputs) <> 0 then perform pg_temp.fail('aal2 unshared output'); end if;
  if (select count(*) from public.ai_tool_notes) <> 0 then perform pg_temp.fail('aal2 unshared note'); end if;
  if (select count(*) from public.ai_tool_jobs) <> 0 then perform pg_temp.fail('aal2 unshared ai job'); end if;
  if (select count(*) from storage.objects where bucket_id = 'due-diligence-decks') <> 0 then
    perform pg_temp.fail('aal2 unshared deck file');
  end if;
  counts := public.staff_private_work_counts();
  if counts ? 'file_name' or counts ? 'member_id' or counts::text like '%${MEMBER}%' then
    perform pg_temp.fail('counts leaked');
  end if;
  if (counts ->> 'due_diligence_reports')::int <> 1 then perform pg_temp.fail('report count'); end if;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  perform public.set_due_diligence_report_admin_share('${REPORT}'::uuid, true);
  perform public.set_ai_tool_result_admin_share('${AI_JOB}'::uuid, true);

  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  if (select count(*) from public.due_diligence_reports) <> 1 then perform pg_temp.fail('shared report'); end if;
  if (select count(*) from public.due_diligence_jobs) <> 1 then perform pg_temp.fail('shared job'); end if;
  if (select count(*) from public.due_diligence_decks) <> 0 then perform pg_temp.fail('report share leaked deck'); end if;
  if (select count(*) from public.ai_tool_outputs) <> 1 then perform pg_temp.fail('shared output'); end if;
  if (select count(*) from public.ai_tool_notes) <> 1 then perform pg_temp.fail('shared note'); end if;
  if (select count(*) from public.ai_tool_jobs) <> 1 then perform pg_temp.fail('shared ai job'); end if;
  if (select count(*) from storage.objects where bucket_id = 'due-diligence-decks') <> 0 then
    perform pg_temp.fail('deck file still private');
  end if;

  perform pg_temp.assume('${STAFF}', 'aal1', 'authenticated');
  if (select count(*) from public.due_diligence_reports) <> 0 then perform pg_temp.fail('aal1 shared report'); end if;

  perform pg_temp.assume('${OTHER}', 'aal2', 'authenticated');
  if (select count(*) from public.due_diligence_reports) <> 0 then perform pg_temp.fail('other member report'); end if;
  if (select count(*) from public.ai_tool_outputs) <> 0 then perform pg_temp.fail('other member output'); end if;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  perform public.set_due_diligence_deck_admin_share('${DECK}'::uuid, true);
  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  if (select count(*) from public.due_diligence_decks) <> 1 then perform pg_temp.fail('shared deck'); end if;
  if (select count(*) from storage.objects where bucket_id = 'due-diligence-decks') <> 1 then
    perform pg_temp.fail('shared deck file');
  end if;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  perform public.set_due_diligence_report_admin_share('${REPORT}'::uuid, false);
  perform public.set_due_diligence_deck_admin_share('${DECK}'::uuid, false);
  perform public.set_ai_tool_result_admin_share('${AI_JOB}'::uuid, false);
  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  if (select count(*) from public.due_diligence_reports) <> 0 then perform pg_temp.fail('withdrawn report'); end if;
  if (select count(*) from public.due_diligence_jobs) <> 0 then perform pg_temp.fail('withdrawn job'); end if;
  if (select count(*) from public.due_diligence_decks) <> 0 then perform pg_temp.fail('withdrawn deck'); end if;
  if (select count(*) from public.ai_tool_outputs) <> 0 then perform pg_temp.fail('withdrawn output'); end if;
  if (select count(*) from public.ai_tool_notes) <> 0 then perform pg_temp.fail('withdrawn note'); end if;
  if (select count(*) from storage.objects where bucket_id = 'due-diligence-decks') <> 0 then
    perform pg_temp.fail('withdrawn deck file');
  end if;

  perform pg_temp.assume('${OTHER}', 'aal2', 'authenticated');
  begin
    perform public.set_due_diligence_report_admin_share('${REPORT}'::uuid, true);
    perform pg_temp.fail('other member share');
  exception when insufficient_privilege then
    null;
  end;

  set role anon;
  begin
    perform count(*) from public.due_diligence_reports;
    perform pg_temp.fail('anon select');
  exception when insufficient_privilege then
    null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', '${STAFF}', 'aal', 'aal1', 'role', 'authenticated')::text, false);
  set role postgres;
  if private.actor_is_staff('${STAFF}'::uuid) then perform pg_temp.fail('actor aal1'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', '${STAFF}', 'aal', 'aal2', 'role', 'authenticated')::text, false);
  if not private.actor_is_staff('${STAFF}'::uuid) then perform pg_temp.fail('actor aal2'); end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role', 'aal', 'aal1')::text, false);
  begin
    perform public.list_all_deal_rooms('${STAFF}'::uuid, 'aal1');
    perform pg_temp.fail('list aal1');
  exception when insufficient_privilege then
    null;
  end;
  perform public.list_all_deal_rooms('${STAFF}'::uuid, 'aal2');
end
$checks$;
`
