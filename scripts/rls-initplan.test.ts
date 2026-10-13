import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261213120000_rls_initplan_select_auth_uid.sql'
const migrationPath = path.join(migrationsDir, migrationName)

const MEMBER_A = '11111111-1111-4111-8111-111111111111'
const MEMBER_B = '22222222-2222-4222-8222-222222222222'
const STAFF = '33333333-3333-4333-8333-333333333333'
const STAFF_2 = '44444444-4444-4444-8444-444444444444'
const CANDIDATE = '55555555-5555-4555-8555-555555555555'
const CLOSED = '66666666-6666-4666-8666-666666666666'

type Policy = {
  name: string
  table: string
  cmd: string
  roles: string
  using: string | null
  check: string | null
}

const EXPECTED: { policy: string; table: string; cmd: string; roles: string; file: string | null }[] = [
  { policy: 'members_select_own', table: 'members', cmd: 'select', roles: 'authenticated', file: '20260922170000_wave1_members_profiles.sql' },
  { policy: 'members_clear_password_flag', table: 'members', cmd: 'update', roles: 'authenticated', file: '20260922170000_wave1_members_profiles.sql' },
  { policy: 'profiles_select_own', table: 'profiles', cmd: 'select', roles: 'authenticated', file: '20260922170000_wave1_members_profiles.sql' },
  { policy: 'profiles_update_own', table: 'profiles', cmd: 'update', roles: 'authenticated', file: '20260922170000_wave1_members_profiles.sql' },
  { policy: 'member_invites_select_own', table: 'member_invites', cmd: 'select', roles: 'authenticated', file: '20260922201000_member_invite_wallet.sql' },
  { policy: 'candidates_select_own', table: 'candidates', cmd: 'select', roles: 'authenticated', file: '20261104120000_two_tier_candidates.sql' },
  { policy: 'candidates_update_own', table: 'candidates', cmd: 'update', roles: 'authenticated', file: '20261104120000_two_tier_candidates.sql' },
  { policy: 'candidate_events_select', table: 'candidate_events', cmd: 'select', roles: 'authenticated', file: '20261104120000_two_tier_candidates.sql' },
  { policy: 'candidate_notes_staff', table: 'candidate_notes', cmd: 'all', roles: 'authenticated', file: '20261104120000_two_tier_candidates.sql' },
  { policy: 'intro_suggestions_select_own', table: 'intro_suggestions', cmd: 'select', roles: 'authenticated', file: '20261119120000_intros_b_suggestions_nudges.sql' },
  { policy: 'intro_meet_outcomes_select_own', table: 'intro_meet_outcomes', cmd: 'select', roles: 'authenticated', file: '20261119120000_intros_b_suggestions_nudges.sql' },
  { policy: 're_appetite_select', table: 're_appetite', cmd: 'select', roles: 'authenticated', file: '20261122120000_re_appetite.sql' },
  { policy: 're_appetite_insert', table: 're_appetite', cmd: 'insert', roles: 'authenticated', file: '20261122120000_re_appetite.sql' },
  { policy: 're_appetite_update', table: 're_appetite', cmd: 'update', roles: 'authenticated', file: '20261122120000_re_appetite.sql' },
  { policy: 'majlis_events_insert_own_pending', table: 'majlis_events', cmd: 'insert', roles: 'authenticated', file: '20261202120000_majlis_rsvp_calendar.sql' },
  { policy: 'majlis_rsvps_select_own', table: 'majlis_rsvps', cmd: 'select', roles: 'authenticated', file: '20261202120000_majlis_rsvp_calendar.sql' },
  { policy: 'staff_users_select_own', table: 'staff_users', cmd: 'select', roles: 'authenticated', file: null },
]

// Live qual recorded by Code PM. Not present in an earlier migration.
const LIVE_STAFF_SELECT_OWN = `
create policy staff_users_select_own on public.staff_users
  for select to authenticated
  using (user_id = auth.uid());
`

function stripComments(sql: string) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    if (sql[i] === "'") {
      const start = i
      i += 1
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2
          continue
        }
        if (sql[i] === "'") {
          i += 1
          break
        }
        i += 1
      }
      out += sql.slice(start, i)
      continue
    }
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1
      out += '\n'
      continue
    }
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1
      i = Math.min(sql.length, i + 2)
      out += ' '
      continue
    }
    out += sql[i]
    i += 1
  }
  return out
}

function skipWs(sql: string, index: number) {
  let i = index
  while (i < sql.length && /\s/.test(sql[i])) i += 1
  return i
}

function keyword(sql: string, index: number, word: string) {
  if (sql.slice(index, index + word.length).toLowerCase() !== word) return null
  const next = sql[index + word.length]
  if (next && /[A-Za-z0-9_]/.test(next)) return null
  return index + word.length
}

function readIdent(sql: string, index: number) {
  const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(index))
  if (!match) throw new Error(`expected identifier at ${index}`)
  return { ident: match[0], end: index + match[0].length }
}

function readBalanced(sql: string, openIndex: number) {
  let depth = 0
  let i = openIndex
  for (; i < sql.length; i += 1) {
    const char = sql[i]
    if (char === "'") {
      i += 1
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 1
          continue
        }
        if (sql[i] === "'") break
        i += 1
      }
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return { inner: sql.slice(openIndex + 1, i), end: i + 1 }
    }
  }
  throw new Error('unbalanced parentheses')
}

function parsePolicies(sql: string): Policy[] {
  const source = stripComments(sql)
  const found: Policy[] = []
  const re = /create\s+policy\s+/gi
  for (const match of source.matchAll(re)) {
    let i = skipWs(source, match.index + match[0].length)
    const name = readIdent(source, i)
    i = skipWs(source, name.end)
    const onAt = keyword(source, i, 'on')
    if (onAt == null) throw new Error(`policy ${name.ident} missing on`)
    i = skipWs(source, onAt)
    const schemaOrTable = readIdent(source, i)
    i = schemaOrTable.end
    let table = schemaOrTable.ident
    if (source[i] === '.') {
      const tableName = readIdent(source, i + 1)
      table = tableName.ident
      i = tableName.end
    }
    i = skipWs(source, i)
    let cmd = 'all'
    const forAt = keyword(source, i, 'for')
    if (forAt != null) {
      i = skipWs(source, forAt)
      const cmdIdent = readIdent(source, i)
      cmd = cmdIdent.ident.toLowerCase()
      i = skipWs(source, cmdIdent.end)
    }
    let roles = 'public'
    const toAt = keyword(source, i, 'to')
    if (toAt != null) {
      i = skipWs(source, toAt)
      const roleNames: string[] = []
      while (i < source.length) {
        const role = readIdent(source, i)
        roleNames.push(role.ident.toLowerCase())
        i = skipWs(source, role.end)
        if (source[i] === ',') {
          i = skipWs(source, i + 1)
          continue
        }
        break
      }
      roles = roleNames.join(',')
    }
    let using: string | null = null
    let check: string | null = null
    const usingAt = keyword(source, i, 'using')
    if (usingAt != null) {
      i = skipWs(source, usingAt)
      if (source[i] !== '(') throw new Error(`policy ${name.ident} using missing paren`)
      const expr = readBalanced(source, i)
      using = expr.inner
      i = skipWs(source, expr.end)
    }
    const withAt = keyword(source, i, 'with')
    if (withAt != null) {
      i = skipWs(source, withAt)
      const checkAt = keyword(source, i, 'check')
      if (checkAt == null) throw new Error(`policy ${name.ident} missing check`)
      i = skipWs(source, checkAt)
      if (source[i] !== '(') throw new Error(`policy ${name.ident} check missing paren`)
      const expr = readBalanced(source, i)
      check = expr.inner
      i = skipWs(source, expr.end)
    }
    if (source[i] !== ';') throw new Error(`policy ${name.ident} missing semicolon`)
    found.push({ name: name.ident, table, cmd, roles, using, check })
  }
  return found
}

function policyByName(sql: string, name: string) {
  const found = parsePolicies(sql).filter((policy) => policy.name === name)
  assert.equal(found.length, 1, name)
  return found[0]
}

function norm(expr: string | null) {
  return expr == null ? null : expr.replace(/\s+/g, '').toLowerCase()
}

function wrapUid(expr: string | null) {
  if (expr == null) return null
  return expr.replace(/auth\.uid\(\)/g, '(select auth.uid())')
}

function readMigrationFile(name: string) {
  return readFileSync(path.join(migrationsDir, name), 'utf8')
}

test('initplan migration wraps the 17 policies and keeps their expressions', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes(migrationName))
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261212120000_weekly_digest.sql'))
  assert.equal(names.includes('20261212120000_weekly_digest.sql'), true)

  const migration = readFileSync(migrationPath, 'utf8')
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(migration), false)
  assert.equal(migration.includes('the desk'), false)
  assert.equal(/nammco/i.test(migration), false)
  assert.match(migration, /trusted_partners/)
  assert.match(migration, /member_intro_desk_audits/)
  assert.equal(/create\s+policy[\s\S]*trusted_partners/i.test(migration), false)
  assert.equal(/on\s+public\.member_intro_desk_audits/i.test(migration), false)
  assert.equal(/on\s+public\.trusted_partners/i.test(migration), false)

  const code = stripComments(migration)
  assert.equal(/\bgrant\b/i.test(code), false)
  assert.equal(/\brevoke\b/i.test(code), false)
  assert.equal(/\balter\s+table\b/i.test(code), false)
  assert.equal(/\bcreate\s+(or\s+replace\s+)?function\b/i.test(code), false)
  assert.equal(/security\s+definer/i.test(code), false)
  assert.equal(/\bto\s+anon\b/i.test(code), false)
  assert.equal(/disable\s+row\s+level\s+security/i.test(code), false)
  assert.equal(/no\s+force\s+row\s+level\s+security/i.test(code), false)

  const statements = code.split(';').map((part) => part.trim()).filter(Boolean)
  assert.equal(statements.length, 34)
  for (const statement of statements) {
    assert.match(statement, /^(drop policy if exists|create policy)\b/i)
  }

  for (const match of migration.matchAll(/auth\.uid\(\)/g)) {
    const prior = migration.slice(Math.max(0, match.index - 20), match.index)
    assert.match(prior, /\(\s*select\s*$/i)
  }

  const parsed = parsePolicies(migration)
  assert.equal(parsed.length, 17)
  assert.deepEqual(
    parsed.map((policy) => `${policy.table}|${policy.name}|${policy.cmd}|${policy.roles}`),
    EXPECTED.map((policy) => `${policy.table}|${policy.policy}|${policy.cmd}|${policy.roles}`),
  )

  for (const expected of EXPECTED) {
    const next = parsed.find((policy) => policy.name === expected.policy)
    assert.ok(next, expected.policy)
    const sourceSql = expected.file ? readMigrationFile(expected.file) : LIVE_STAFF_SELECT_OWN
    const source = policyByName(sourceSql, expected.policy)
    assert.equal(source.table, expected.table)
    assert.equal(source.cmd, expected.cmd)
    assert.equal(source.roles, expected.roles)
    assert.equal(norm(next.using), norm(wrapUid(source.using)), `${expected.policy} using`)
    assert.equal(norm(next.check), norm(wrapUid(source.check)), `${expected.policy} check`)
    assert.equal(source.using?.includes('(select auth.uid())') ?? false, false)
    assert.equal(source.check?.includes('(select auth.uid())') ?? false, false)
  }

  const older = policyByName(
    readMigrationFile('20260926103000_majlis_rsvp.sql'),
    'majlis_events_insert_own_pending',
  )
  const current = parsed.find((policy) => policy.name === 'majlis_events_insert_own_pending')
  assert.notEqual(norm(current?.check), norm(wrapUid(older.check)))
  assert.match(current?.check ?? '', /created_by_staff is null/)
})

test('wrapped policies allow and deny the same rows as the unwrapped policies', { timeout: 120_000 }, () => {
  const migration = readFileSync(migrationPath, 'utf8')
  const reversed = migration.replaceAll('(select auth.uid())', 'auth.uid()')
  assert.equal(reversed.includes('(select auth.uid())'), false)
  assert.match(reversed, /auth\.uid\(\)/)

  const dir = mkdtempSync(path.join(tmpdir(), 'ba-initplan-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_initplan_${process.pid}`
  writeFileSync(script, [
    fixtureSql,
    reversed,
    "insert into probe_snapshots (label, body) values ('before', pg_temp.probe());",
    `\\i ${migrationPath}`,
    "insert into probe_snapshots (label, body) values ('after', pg_temp.probe());",
    `\\i ${migrationPath}`,
    "insert into probe_snapshots (label, body) values ('again', pg_temp.probe());",
    assertSql,
  ].join('\n'))

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
exception
  when unique_violation then
    null;
end
$roles$;
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
create schema if not exists private;
grant usage on schema public, auth, private to anon, authenticated;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to anon, authenticated;

create table public.members (
  user_id uuid primary key,
  email text not null,
  seat text not null,
  status text not null,
  must_set_password boolean not null default true
);
create table public.profiles (
  user_id uuid primary key,
  full_name text,
  headline text,
  company text,
  location text,
  linkedin_url text,
  bio text,
  phone text
);
create table public.member_invites (
  id uuid primary key,
  inviter_member_id uuid not null
);
create table public.candidates (
  user_id uuid primary key,
  request_state text not null,
  full_name text
);
create table public.candidate_events (
  id uuid primary key,
  candidate_user_id uuid not null
);
create table public.candidate_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_user_id uuid not null,
  author_id uuid not null,
  body text not null
);
create table public.intro_suggestions (
  id uuid primary key,
  member_id uuid not null
);
create table public.intro_meet_outcomes (
  intro_id uuid not null,
  member_id uuid not null,
  primary key (intro_id, member_id)
);
create table public.re_appetite (
  member_id uuid primary key
);
create table public.majlis_events (
  id uuid primary key default gen_random_uuid(),
  host_member_id uuid,
  created_by_staff uuid,
  status text,
  approved_by uuid,
  approved_at timestamptz,
  rejection_feedback text,
  admin_note text
);
create table public.majlis_rsvps (
  id uuid primary key,
  member_id uuid not null
);
create table public.staff_users (
  user_id uuid primary key,
  role text not null,
  email text not null
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
  );
$$;
revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated;

do $force$
declare
  name text;
begin
  foreach name in array array[
    'members', 'profiles', 'member_invites', 'candidates', 'candidate_events',
    'candidate_notes', 'intro_suggestions', 'intro_meet_outcomes', 're_appetite',
    'majlis_events', 'majlis_rsvps', 'staff_users'
  ]
  loop
    execute format('alter table public.%I enable row level security', name);
    execute format('alter table public.%I force row level security', name);
    execute format('revoke all on table public.%I from public, anon', name);
  end loop;
end
$force$;

grant select, update on public.members to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.member_invites to authenticated;
grant select, update on public.candidates to authenticated;
grant select on public.candidate_events to authenticated;
grant select, insert, update, delete on public.candidate_notes to authenticated;
grant select on public.intro_suggestions to authenticated;
grant select on public.intro_meet_outcomes to authenticated;
grant select, insert, update on public.re_appetite to authenticated;
grant insert on public.majlis_events to authenticated;
grant select on public.majlis_rsvps to authenticated;
grant select on public.staff_users to authenticated;

create policy members_select_staff on public.members
  for select to authenticated
  using (private.is_staff());
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (private.is_staff());
create policy member_invites_select_staff on public.member_invites
  for select to authenticated
  using (private.is_staff());
create policy candidates_update_staff on public.candidates
  for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

insert into public.members (user_id, email, seat, status, must_set_password) values
  ('${MEMBER_A}', 'member.a@example.com', 'ksa', 'active', true),
  ('${MEMBER_B}', 'member.b@example.com', 'sponsor', 'active', true);
insert into public.profiles (user_id) values
  ('${MEMBER_A}'),
  ('${MEMBER_B}');
insert into public.staff_users (user_id, role, email) values
  ('${STAFF}', 'staff', 'staff@example.com'),
  ('${STAFF_2}', 'staff', 'staff.two@example.com');
insert into public.candidates (user_id, request_state, full_name) values
  ('${CANDIDATE}', 'open', 'Open Example'),
  ('${CLOSED}', 'closed', 'Closed Example');
insert into public.candidate_events (id, candidate_user_id) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '${CANDIDATE}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '${CLOSED}');
insert into public.candidate_notes (id, candidate_user_id, author_id, body) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '${CANDIDATE}', '${STAFF}', 'seed');
insert into public.member_invites (id, inviter_member_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${MEMBER_A}'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '${MEMBER_B}');
insert into public.intro_suggestions (id, member_id) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '${MEMBER_A}'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '${MEMBER_B}');
insert into public.intro_meet_outcomes (intro_id, member_id) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '${MEMBER_A}'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '${MEMBER_B}');
insert into public.re_appetite (member_id) values
  ('${MEMBER_A}'),
  ('${MEMBER_B}');
insert into public.majlis_rsvps (id, member_id) values
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', '${MEMBER_A}'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff2', '${MEMBER_B}');

create temp table probe_snapshots (
  label text primary key,
  body jsonb not null
);

create or replace function pg_temp.assume(p_sub uuid, p_role text)
returns void
language plpgsql
as $assume$
begin
  execute 'reset role';
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', p_role)::text,
    true
  );
  execute format('set role %I', p_role);
end;
$assume$;

create or replace function pg_temp.see(p_sql text)
returns jsonb
language plpgsql
as $see$
declare
  seen jsonb;
begin
  execute p_sql into seen;
  return seen;
exception
  when others then
    return to_jsonb(sqlstate);
end;
$see$;

create or replace function pg_temp.change(p_sql text)
returns text
language plpgsql
as $change$
declare
  n integer;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    raise exception 'ok:%', n;
  exception
    when others then
      if sqlerrm like 'ok:%' then
        return 'rows:' || substring(sqlerrm from 4);
      end if;
      return sqlstate;
  end;
end;
$change$;

create or replace function pg_temp.actor_view()
returns jsonb
language plpgsql
as $view$
begin
  return jsonb_build_object(
    'members', pg_temp.see($q$select coalesce(jsonb_agg(user_id order by user_id), '[]'::jsonb) from public.members$q$),
    'profiles', pg_temp.see($q$select coalesce(jsonb_agg(user_id order by user_id), '[]'::jsonb) from public.profiles$q$),
    'member_invites', pg_temp.see($q$select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.member_invites$q$),
    'candidates', pg_temp.see($q$select coalesce(jsonb_agg(user_id order by user_id), '[]'::jsonb) from public.candidates$q$),
    'candidate_events', pg_temp.see($q$select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.candidate_events$q$),
    'candidate_notes', pg_temp.see($q$select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.candidate_notes$q$),
    'intro_suggestions', pg_temp.see($q$select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.intro_suggestions$q$),
    'intro_meet_outcomes', pg_temp.see($q$select coalesce(jsonb_agg(member_id order by member_id), '[]'::jsonb) from public.intro_meet_outcomes$q$),
    're_appetite', pg_temp.see($q$select coalesce(jsonb_agg(member_id order by member_id), '[]'::jsonb) from public.re_appetite$q$),
    'majlis_rsvps', pg_temp.see($q$select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.majlis_rsvps$q$),
    'staff_users', pg_temp.see($q$select coalesce(jsonb_agg(user_id order by user_id), '[]'::jsonb) from public.staff_users$q$)
  );
end;
$view$;

create or replace function pg_temp.probe()
returns jsonb
language plpgsql
as $probe$
declare
  selected jsonb := '{}'::jsonb;
  mutated jsonb := '{}'::jsonb;
begin
  perform pg_temp.assume('${MEMBER_A}'::uuid, 'authenticated');
  selected := selected || jsonb_build_object('member_a', pg_temp.actor_view());
  mutated := mutated || jsonb_build_object(
    'member_a_clear_own', pg_temp.change($q$update public.members set must_set_password = false where user_id = '${MEMBER_A}'$q$),
    'member_a_set_password_true', pg_temp.change($q$update public.members set must_set_password = true where user_id = '${MEMBER_A}'$q$),
    'member_a_clear_other', pg_temp.change($q$update public.members set must_set_password = false where user_id = '${MEMBER_B}'$q$),
    'member_a_profile_ok', pg_temp.change($q$update public.profiles set headline = 'Ok' where user_id = '${MEMBER_A}'$q$),
    'member_a_profile_long', pg_temp.change($q$update public.profiles set headline = repeat('x', 161) where user_id = '${MEMBER_A}'$q$),
    'member_a_profile_other', pg_temp.change($q$update public.profiles set headline = 'Ok' where user_id = '${MEMBER_B}'$q$),
    'member_a_appetite_update', pg_temp.change($q$update public.re_appetite set member_id = member_id where member_id = '${MEMBER_A}'$q$),
    'member_a_appetite_other', pg_temp.change($q$update public.re_appetite set member_id = member_id where member_id = '${MEMBER_B}'$q$),
    'member_a_appetite_insert', pg_temp.change($q$insert into public.re_appetite (member_id) values ('${MEMBER_A}')$q$),
    'member_a_majlis', pg_temp.change($q$insert into public.majlis_events (host_member_id, created_by_staff, status) values ('${MEMBER_A}', null, 'pending_approval')$q$),
    'member_a_majlis_other_host', pg_temp.change($q$insert into public.majlis_events (host_member_id, created_by_staff, status) values ('${MEMBER_B}', null, 'pending_approval')$q$),
    'member_a_majlis_staff_created', pg_temp.change($q$insert into public.majlis_events (host_member_id, created_by_staff, status) values ('${MEMBER_A}', '${STAFF}', 'pending_approval')$q$),
    'member_a_majlis_published', pg_temp.change($q$insert into public.majlis_events (host_member_id, created_by_staff, status) values ('${MEMBER_A}', null, 'published')$q$),
    'member_a_candidate', pg_temp.change($q$update public.candidates set full_name = 'Nope' where user_id = '${CANDIDATE}'$q$),
    'member_a_note_insert', pg_temp.change($q$insert into public.candidate_notes (candidate_user_id, author_id, body) values ('${CANDIDATE}', '${MEMBER_A}', 'nope')$q$),
    'member_a_note_delete', pg_temp.change($q$delete from public.candidate_notes where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$q$)
  );

  perform pg_temp.assume('${MEMBER_B}'::uuid, 'authenticated');
  selected := selected || jsonb_build_object('member_b', pg_temp.actor_view());
  mutated := mutated || jsonb_build_object(
    'member_b_clear_own', pg_temp.change($q$update public.members set must_set_password = false where user_id = '${MEMBER_B}'$q$),
    'member_b_appetite_update', pg_temp.change($q$update public.re_appetite set member_id = member_id where member_id = '${MEMBER_B}'$q$),
    'member_b_appetite_insert', pg_temp.change($q$insert into public.re_appetite (member_id) values ('${MEMBER_B}')$q$),
    'member_b_majlis', pg_temp.change($q$insert into public.majlis_events (host_member_id, created_by_staff, status) values ('${MEMBER_B}', null, 'pending_approval')$q$)
  );

  perform pg_temp.assume('${STAFF}'::uuid, 'authenticated');
  selected := selected || jsonb_build_object('staff', pg_temp.actor_view());
  mutated := mutated || jsonb_build_object(
    'staff_update_open', pg_temp.change($q$update public.candidates set full_name = 'Staff edit' where user_id = '${CANDIDATE}'$q$),
    'staff_update_closed', pg_temp.change($q$update public.candidates set full_name = 'Staff edit' where user_id = '${CLOSED}'$q$),
    'staff_note_insert', pg_temp.change($q$insert into public.candidate_notes (candidate_user_id, author_id, body) values ('${CANDIDATE}', '${STAFF}', 'added')$q$),
    'staff_note_other_author', pg_temp.change($q$insert into public.candidate_notes (candidate_user_id, author_id, body) values ('${CANDIDATE}', '${MEMBER_A}', 'added')$q$),
    'staff_note_update', pg_temp.change($q$update public.candidate_notes set body = 'edited' where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$q$),
    'staff_note_reauthor', pg_temp.change($q$update public.candidate_notes set author_id = '${MEMBER_A}' where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$q$),
    'staff_note_delete', pg_temp.change($q$delete from public.candidate_notes where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$q$),
    'staff_appetite_insert', pg_temp.change($q$insert into public.re_appetite (member_id) values ('${STAFF}')$q$),
    'staff_appetite_update', pg_temp.change($q$update public.re_appetite set member_id = member_id where member_id = '${MEMBER_A}'$q$),
    'staff_majlis', pg_temp.change($q$insert into public.majlis_events (host_member_id, created_by_staff, status) values ('${STAFF}', null, 'pending_approval')$q$),
    'staff_clear_member', pg_temp.change($q$update public.members set must_set_password = false where user_id = '${MEMBER_A}'$q$)
  );

  perform pg_temp.assume('${CANDIDATE}'::uuid, 'authenticated');
  selected := selected || jsonb_build_object('candidate', pg_temp.actor_view());
  mutated := mutated || jsonb_build_object(
    'candidate_update_own', pg_temp.change($q$update public.candidates set full_name = 'Mine' where user_id = '${CANDIDATE}'$q$),
    'candidate_update_closed', pg_temp.change($q$update public.candidates set full_name = 'Mine' where user_id = '${CLOSED}'$q$),
    'candidate_close_own', pg_temp.change($q$update public.candidates set request_state = 'closed' where user_id = '${CANDIDATE}'$q$),
    'candidate_note_delete', pg_temp.change($q$delete from public.candidate_notes where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$q$),
    'candidate_majlis', pg_temp.change($q$insert into public.majlis_events (host_member_id, created_by_staff, status) values ('${CANDIDATE}', null, 'pending_approval')$q$),
    'candidate_appetite', pg_temp.change($q$insert into public.re_appetite (member_id) values ('${CANDIDATE}')$q$)
  );

  perform pg_temp.assume('${CLOSED}'::uuid, 'authenticated');
  selected := selected || jsonb_build_object('closed', pg_temp.actor_view());
  mutated := mutated || jsonb_build_object(
    'closed_update_own', pg_temp.change($q$update public.candidates set full_name = 'Mine' where user_id = '${CLOSED}'$q$)
  );

  perform pg_temp.assume(null, 'authenticated');
  selected := selected || jsonb_build_object('nobody', pg_temp.actor_view());
  mutated := mutated || jsonb_build_object(
    'nobody_clear', pg_temp.change($q$update public.members set must_set_password = false where user_id = '${MEMBER_A}'$q$),
    'nobody_majlis', pg_temp.change($q$insert into public.majlis_events (host_member_id, created_by_staff, status) values ('${MEMBER_A}', null, 'pending_approval')$q$)
  );

  perform pg_temp.assume(null, 'anon');
  selected := selected || jsonb_build_object('anon', pg_temp.actor_view());

  execute 'reset role';
  return jsonb_build_object('select', selected, 'mutate', mutated);
exception
  when others then
    execute 'reset role';
    raise;
end;
$probe$;

do $temp_grant$
declare
  temp_schema text;
begin
  select nspname into temp_schema from pg_namespace where oid = pg_my_temp_schema();
  execute format('grant usage on schema %I to authenticated, anon', temp_schema);
  execute format('grant execute on all functions in schema %I to authenticated, anon', temp_schema);
end
$temp_grant$;
`

const assertSql = `
do $checks$
declare
  before_body jsonb;
  after_body jsonb;
  again_body jsonb;
  member_a uuid := '${MEMBER_A}';
  member_b uuid := '${MEMBER_B}';
  staff uuid := '${STAFF}';
  candidate uuid := '${CANDIDATE}';
  closed uuid := '${CLOSED}';
  rec record;
  bare text;
begin
  select body into before_body from probe_snapshots where label = 'before';
  select body into after_body from probe_snapshots where label = 'after';
  select body into again_body from probe_snapshots where label = 'again';
  if before_body is null or after_body is null or again_body is null then
    raise exception 'missing snapshot';
  end if;
  if before_body is distinct from after_body then
    raise exception 'access changed %', jsonb_pretty(jsonb_build_object('before', before_body, 'after', after_body));
  end if;
  if after_body is distinct from again_body then
    raise exception 'second apply changed access';
  end if;

  if before_body #> '{select,member_a,members}' is distinct from jsonb_build_array(member_a) then
    raise exception 'member_a members %', before_body #> '{select,member_a,members}';
  end if;
  if before_body #> '{select,member_b,members}' is distinct from jsonb_build_array(member_b) then
    raise exception 'member_b members %', before_body #> '{select,member_b,members}';
  end if;
  if before_body #> '{select,staff,members}' is distinct from jsonb_build_array(member_a, member_b) then
    raise exception 'staff members %', before_body #> '{select,staff,members}';
  end if;
  if before_body #> '{select,candidate,members}' is distinct from '[]'::jsonb then
    raise exception 'candidate members %', before_body #> '{select,candidate,members}';
  end if;
  if before_body #> '{select,nobody,members}' is distinct from '[]'::jsonb then
    raise exception 'nobody members %', before_body #> '{select,nobody,members}';
  end if;
  if before_body #> '{select,anon,members}' is distinct from to_jsonb('42501'::text) then
    raise exception 'anon members %', before_body #> '{select,anon,members}';
  end if;

  if before_body #> '{select,member_a,profiles}' is distinct from jsonb_build_array(member_a) then
    raise exception 'member_a profiles %', before_body #> '{select,member_a,profiles}';
  end if;
  if before_body #> '{select,staff,profiles}' is distinct from jsonb_build_array(member_a, member_b) then
    raise exception 'staff profiles %', before_body #> '{select,staff,profiles}';
  end if;
  if before_body #> '{select,member_a,member_invites}' is distinct from jsonb_build_array('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid) then
    raise exception 'member_a invites %', before_body #> '{select,member_a,member_invites}';
  end if;
  if before_body #> '{select,staff,member_invites}' is distinct from jsonb_build_array('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid) then
    raise exception 'staff invites %', before_body #> '{select,staff,member_invites}';
  end if;

  if before_body #> '{select,candidate,candidates}' is distinct from jsonb_build_array(candidate) then
    raise exception 'candidate rows %', before_body #> '{select,candidate,candidates}';
  end if;
  if before_body #> '{select,closed,candidates}' is distinct from jsonb_build_array(closed) then
    raise exception 'closed rows %', before_body #> '{select,closed,candidates}';
  end if;
  if before_body #> '{select,staff,candidates}' is distinct from jsonb_build_array(candidate, closed) then
    raise exception 'staff candidates %', before_body #> '{select,staff,candidates}';
  end if;
  if before_body #> '{select,member_a,candidates}' is distinct from '[]'::jsonb then
    raise exception 'member candidates %', before_body #> '{select,member_a,candidates}';
  end if;
  if before_body #> '{select,candidate,candidate_events}' is distinct from jsonb_build_array('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid) then
    raise exception 'candidate events %', before_body #> '{select,candidate,candidate_events}';
  end if;
  if before_body #> '{select,staff,candidate_events}' is distinct from jsonb_build_array('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid) then
    raise exception 'staff events %', before_body #> '{select,staff,candidate_events}';
  end if;
  if before_body #> '{select,staff,candidate_notes}' is distinct from jsonb_build_array('cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid) then
    raise exception 'staff notes %', before_body #> '{select,staff,candidate_notes}';
  end if;
  if before_body #> '{select,candidate,candidate_notes}' is distinct from '[]'::jsonb then
    raise exception 'candidate notes %', before_body #> '{select,candidate,candidate_notes}';
  end if;
  if before_body #> '{select,member_a,intro_suggestions}' is distinct from jsonb_build_array('dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid) then
    raise exception 'suggestions %', before_body #> '{select,member_a,intro_suggestions}';
  end if;
  if before_body #> '{select,staff,intro_suggestions}' is distinct from '[]'::jsonb then
    raise exception 'staff suggestions %', before_body #> '{select,staff,intro_suggestions}';
  end if;
  if before_body #> '{select,member_a,intro_meet_outcomes}' is distinct from jsonb_build_array(member_a) then
    raise exception 'outcomes %', before_body #> '{select,member_a,intro_meet_outcomes}';
  end if;
  if before_body #> '{select,member_a,re_appetite}' is distinct from jsonb_build_array(member_a) then
    raise exception 'member_a appetite %', before_body #> '{select,member_a,re_appetite}';
  end if;
  if before_body #> '{select,member_b,re_appetite}' is distinct from jsonb_build_array(member_b) then
    raise exception 'member_b appetite %', before_body #> '{select,member_b,re_appetite}';
  end if;
  if before_body #> '{select,staff,re_appetite}' is distinct from jsonb_build_array(member_a, member_b) then
    raise exception 'staff appetite %', before_body #> '{select,staff,re_appetite}';
  end if;
  if before_body #> '{select,member_a,majlis_rsvps}' is distinct from jsonb_build_array('ffffffff-ffff-4fff-8fff-fffffffffff1'::uuid) then
    raise exception 'rsvps %', before_body #> '{select,member_a,majlis_rsvps}';
  end if;
  if before_body #> '{select,staff,majlis_rsvps}' is distinct from '[]'::jsonb then
    raise exception 'staff rsvps %', before_body #> '{select,staff,majlis_rsvps}';
  end if;
  if before_body #> '{select,staff,staff_users}' is distinct from jsonb_build_array(staff) then
    raise exception 'staff users %', before_body #> '{select,staff,staff_users}';
  end if;
  if before_body #> '{select,member_a,staff_users}' is distinct from '[]'::jsonb then
    raise exception 'member staff users %', before_body #> '{select,member_a,staff_users}';
  end if;

  if before_body #>> '{mutate,member_a_clear_own}' is distinct from 'rows:1' then
    raise exception 'clear own %', before_body #>> '{mutate,member_a_clear_own}';
  end if;
  if before_body #>> '{mutate,member_a_set_password_true}' is distinct from '42501' then
    raise exception 'set password %', before_body #>> '{mutate,member_a_set_password_true}';
  end if;
  if before_body #>> '{mutate,member_a_clear_other}' is distinct from 'rows:0' then
    raise exception 'clear other %', before_body #>> '{mutate,member_a_clear_other}';
  end if;
  if before_body #>> '{mutate,member_a_profile_ok}' is distinct from 'rows:1' then
    raise exception 'profile ok %', before_body #>> '{mutate,member_a_profile_ok}';
  end if;
  if before_body #>> '{mutate,member_a_profile_long}' is distinct from '42501' then
    raise exception 'profile long %', before_body #>> '{mutate,member_a_profile_long}';
  end if;
  if before_body #>> '{mutate,member_a_profile_other}' is distinct from 'rows:0' then
    raise exception 'profile other %', before_body #>> '{mutate,member_a_profile_other}';
  end if;
  if before_body #>> '{mutate,member_a_appetite_update}' is distinct from 'rows:1' then
    raise exception 'appetite update %', before_body #>> '{mutate,member_a_appetite_update}';
  end if;
  if before_body #>> '{mutate,member_a_appetite_other}' is distinct from 'rows:0' then
    raise exception 'appetite other %', before_body #>> '{mutate,member_a_appetite_other}';
  end if;
  if before_body #>> '{mutate,member_a_appetite_insert}' is distinct from '23505' then
    raise exception 'appetite insert %', before_body #>> '{mutate,member_a_appetite_insert}';
  end if;
  if before_body #>> '{mutate,member_b_appetite_update}' is distinct from '42501' then
    raise exception 'sponsor appetite %', before_body #>> '{mutate,member_b_appetite_update}';
  end if;
  if before_body #>> '{mutate,member_a_majlis}' is distinct from 'rows:1' then
    raise exception 'majlis %', before_body #>> '{mutate,member_a_majlis}';
  end if;
  if before_body #>> '{mutate,member_a_majlis_other_host}' is distinct from '42501' then
    raise exception 'majlis host %', before_body #>> '{mutate,member_a_majlis_other_host}';
  end if;
  if before_body #>> '{mutate,member_a_majlis_staff_created}' is distinct from '42501' then
    raise exception 'majlis staff created %', before_body #>> '{mutate,member_a_majlis_staff_created}';
  end if;
  if before_body #>> '{mutate,member_a_majlis_published}' is distinct from '42501' then
    raise exception 'majlis published %', before_body #>> '{mutate,member_a_majlis_published}';
  end if;
  if before_body #>> '{mutate,member_b_majlis}' is distinct from '42501' then
    raise exception 'sponsor majlis %', before_body #>> '{mutate,member_b_majlis}';
  end if;
  if before_body #>> '{mutate,candidate_update_own}' is distinct from 'rows:1' then
    raise exception 'candidate update %', before_body #>> '{mutate,candidate_update_own}';
  end if;
  if before_body #>> '{mutate,candidate_close_own}' is distinct from '42501' then
    raise exception 'candidate close %', before_body #>> '{mutate,candidate_close_own}';
  end if;
  if before_body #>> '{mutate,candidate_update_closed}' is distinct from 'rows:0' then
    raise exception 'candidate closed row %', before_body #>> '{mutate,candidate_update_closed}';
  end if;
  if before_body #>> '{mutate,closed_update_own}' is distinct from 'rows:0' then
    raise exception 'closed update %', before_body #>> '{mutate,closed_update_own}';
  end if;
  if before_body #>> '{mutate,staff_update_closed}' is distinct from 'rows:1' then
    raise exception 'staff closed %', before_body #>> '{mutate,staff_update_closed}';
  end if;
  if before_body #>> '{mutate,staff_note_insert}' is distinct from 'rows:1' then
    raise exception 'staff note %', before_body #>> '{mutate,staff_note_insert}';
  end if;
  if before_body #>> '{mutate,staff_note_other_author}' is distinct from '42501' then
    raise exception 'staff other author %', before_body #>> '{mutate,staff_note_other_author}';
  end if;
  if before_body #>> '{mutate,staff_note_delete}' is distinct from 'rows:1' then
    raise exception 'staff delete %', before_body #>> '{mutate,staff_note_delete}';
  end if;
  if before_body #>> '{mutate,member_a_note_insert}' is distinct from '42501' then
    raise exception 'member note %', before_body #>> '{mutate,member_a_note_insert}';
  end if;
  if before_body #>> '{mutate,member_a_note_delete}' is distinct from 'rows:0' then
    raise exception 'member note delete %', before_body #>> '{mutate,member_a_note_delete}';
  end if;
  if before_body #>> '{mutate,candidate_note_delete}' is distinct from 'rows:0' then
    raise exception 'candidate note delete %', before_body #>> '{mutate,candidate_note_delete}';
  end if;
  if before_body #>> '{mutate,staff_majlis}' is distinct from '42501' then
    raise exception 'staff majlis %', before_body #>> '{mutate,staff_majlis}';
  end if;
  if before_body #>> '{mutate,staff_appetite_insert}' is distinct from '42501' then
    raise exception 'staff appetite %', before_body #>> '{mutate,staff_appetite_insert}';
  end if;
  if before_body #>> '{mutate,staff_clear_member}' is distinct from 'rows:0' then
    raise exception 'staff clear %', before_body #>> '{mutate,staff_clear_member}';
  end if;
  if before_body #>> '{mutate,nobody_clear}' is distinct from 'rows:0' then
    raise exception 'nobody clear %', before_body #>> '{mutate,nobody_clear}';
  end if;
  if before_body #>> '{mutate,nobody_majlis}' is distinct from '42501' then
    raise exception 'nobody majlis %', before_body #>> '{mutate,nobody_majlis}';
  end if;

  for rec in
    select policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'members_select_own', 'members_clear_password_flag',
        'profiles_select_own', 'profiles_update_own',
        'member_invites_select_own',
        'candidates_select_own', 'candidates_update_own',
        'candidate_events_select', 'candidate_notes_staff',
        'intro_suggestions_select_own', 'intro_meet_outcomes_select_own',
        're_appetite_select', 're_appetite_insert', 're_appetite_update',
        'majlis_events_insert_own_pending', 'majlis_rsvps_select_own',
        'staff_users_select_own'
      )
  loop
    if rec.qual like '%auth.uid%' and rec.qual !~ 'SELECT auth\\.uid\\(\\)' then
      raise exception 'qual not wrapped %: %', rec.policyname, rec.qual;
    end if;
    if rec.with_check like '%auth.uid%' and rec.with_check !~ 'SELECT auth\\.uid\\(\\)' then
      raise exception 'check not wrapped %: %', rec.policyname, rec.with_check;
    end if;
    bare := coalesce(rec.qual, '') || ' ' || coalesce(rec.with_check, '');
    if bare ~ 'auth\\.uid\\(\\)' and bare !~ 'SELECT auth\\.uid\\(\\)' then
      raise exception 'bare call %: %', rec.policyname, bare;
    end if;
  end loop;

  if (select count(*) from pg_policies where schemaname = 'public' and policyname in (
    'members_select_own', 'members_clear_password_flag',
    'profiles_select_own', 'profiles_update_own',
    'member_invites_select_own',
    'candidates_select_own', 'candidates_update_own',
    'candidate_events_select', 'candidate_notes_staff',
    'intro_suggestions_select_own', 'intro_meet_outcomes_select_own',
    're_appetite_select', 're_appetite_insert', 're_appetite_update',
    'majlis_events_insert_own_pending', 'majlis_rsvps_select_own',
    'staff_users_select_own'
  )) <> 17 then
    raise exception 'expected 17 wrapped policies';
  end if;

  if (select qual from pg_policies where policyname = 'members_select_staff') not like '%is_staff%' then
    raise exception 'members staff companion changed';
  end if;
  if (select qual from pg_policies where policyname = 'profiles_select_staff') not like '%is_staff%' then
    raise exception 'profiles staff companion changed';
  end if;
  if (select qual from pg_policies where policyname = 'member_invites_select_staff') not like '%is_staff%' then
    raise exception 'invites staff companion changed';
  end if;
  if (select qual from pg_policies where policyname = 'candidates_update_staff') not like '%is_staff%' then
    raise exception 'candidates staff companion changed';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'members', 'profiles', 'member_invites', 'candidates', 'candidate_events',
        'candidate_notes', 'intro_suggestions', 'intro_meet_outcomes', 're_appetite',
        'majlis_events', 'majlis_rsvps', 'staff_users'
      )
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'rls is not forced';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
  ) then
    raise exception 'anon has a table grant';
  end if;
end
$checks$;
`
