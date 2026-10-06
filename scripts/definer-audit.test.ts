import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261130120000_definer_audit.sql'
const priorName = '20261129150000_staff_access_log_rpc_only.sql'

test('definer audit migration sorts after the access log lock and checks the caller', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.indexOf(migrationName) > names.indexOf(priorName))
  const text = readFileSync(path.join(migrationsDir, migrationName), 'utf8')
  assert.match(text, /private\.is_staff\(\)/)
  assert.match(text, /m\.user_id = auth\.uid\(\)/)
  assert.match(text, /m\.status in \('invited', 'active'\)/)
  assert.match(text, /revoke all on function public\.read_dd_retention_copy\(\) from public, anon/)
  assert.match(text, /grant execute on function public\.read_dd_retention_copy\(\) to authenticated/)
  assert.equal(/to anon/.test(text), false)
  assert.equal(text.includes('\u2014'), false)
  assert.equal(text.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), false)
})

test('anon allowlist stays closed and read_dd_retention_copy checks the caller', { timeout: 180_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-definer-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_definer_${process.pid}`
  writeFileSync(script, [stubSql, ...names.map(include), include(migrationName), assertSql].join('\n'))

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
do $checks$
declare
  member_id uuid;
  staff_id uuid;
  guest_id uuid;
  anon_found text[];
  flag boolean;
begin
  insert into auth.users (id, email) values
    (gen_random_uuid(), 'member.audit@example.com'),
    (gen_random_uuid(), 'staff.audit@example.com'),
    (gen_random_uuid(), 'guest.audit@example.com');
  select id into member_id from auth.users where email = 'member.audit@example.com';
  select id into staff_id from auth.users where email = 'staff.audit@example.com';
  select id into guest_id from auth.users where email = 'guest.audit@example.com';

  insert into public.members (user_id, email, seat, status)
  values (member_id, 'member.audit@example.com', 'ksa', 'active');
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.audit@example.com', 'staff');
  update public.ai_tool_settings set dd_retention_copy = true where id;

  select coalesce(array_agg(sig order by sig), '{}')
    into anon_found
  from (
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and has_function_privilege('anon', p.oid, 'execute')
  ) listed;
  if anon_found is distinct from array[
    'public.landing_platform_totals()',
    'public.list_landing_preview_deals()',
    'public.list_partner_categories()',
    'public.list_trusted_partners()',
    'public.lookup_member_invite(p_token text)',
    'public.submit_partner_interest(p_name text, p_firm text, p_category text, p_note text)'
  ]::text[] then
    raise exception 'anon allowlist changed: %', anon_found;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', member_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  flag := public.read_dd_retention_copy();
  if flag is distinct from true then
    raise exception 'member read failed';
  end if;

  set role postgres;
  update public.members set status = 'invited' where user_id = member_id;
  set role authenticated;
  flag := public.read_dd_retention_copy();
  if flag is distinct from true then
    raise exception 'invited member read failed';
  end if;

  set role postgres;
  update public.members set status = 'suspended' where user_id = member_id;
  set role authenticated;
  begin
    perform public.read_dd_retention_copy();
    raise exception 'suspended member was allowed';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'suspended member error: %', sqlerrm;
      end if;
  end;

  set role postgres;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', guest_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.read_dd_retention_copy();
    raise exception 'guest was allowed';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'guest error: %', sqlerrm;
      end if;
  end;

  set role postgres;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.read_dd_retention_copy();
    raise exception 'aal1 staff was allowed';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'aal1 staff error: %', sqlerrm;
      end if;
  end;

  set role postgres;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  flag := public.read_dd_retention_copy();
  if flag is distinct from true then
    raise exception 'aal2 staff read failed';
  end if;

  set role postgres;
  if has_function_privilege('anon', 'public.read_dd_retention_copy()'::regprocedure, 'execute') then
    raise exception 'anon can execute read_dd_retention_copy';
  end if;
  set role anon;
  begin
    perform public.read_dd_retention_copy();
    raise exception 'anon executed read_dd_retention_copy';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached the function body';
      end if;
      if sqlerrm not ilike '%permission denied%' then
        raise exception 'anon error: %', sqlerrm;
      end if;
  end;
  set role postgres;
end
$checks$;
`
