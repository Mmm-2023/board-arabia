import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')

test('sponsor seat stays in step with the tier on postgres', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes('20261204120000_sponsor_seat_sync.sql'))
  assert.ok(names.at(-1)! >= '20261204120000_sponsor_seat_sync.sql')
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-sponsor-sync-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_sponsor_sync_${process.pid}`
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
do $sync$
declare
  staff_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  open_id uuid := gen_random_uuid();
  claim_id uuid := gen_random_uuid();
  third_id uuid := gen_random_uuid();
  seat text;
  prior text;
  granted int;
  remaining int;
  tiers text[];
  sponsor_n int;
  once_n int;
  forced boolean;
begin
  insert into auth.users (id, email) values
    (staff_id, 'staff.sync@example.com'),
    (member_id, 'member.region@example.com'),
    (open_id, 'sponsor.open@example.com'),
    (claim_id, 'sponsor.claim@example.com'),
    (third_id, 'sponsor.third@example.com');

  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.sync@example.com', 'staff');

  insert into public.members (user_id, email, seat, status, must_set_password, tiers)
  values
    (member_id, 'member.region@example.com', 'ksa', 'active', false, array['member']::text[]),
    (open_id, 'sponsor.open@example.com', 'sponsor', 'active', false, array['member', 'sponsor']::text[]);

  if has_column_privilege('anon', 'public.members', 'prior_seat', 'SELECT')
     or has_column_privilege('authenticated', 'public.members', 'prior_seat', 'SELECT') then
    raise exception 'prior_seat is on a member select list';
  end if;
  if has_function_privilege('anon', 'private.is_sponsor(uuid)', 'EXECUTE')
     or has_function_privilege('public', 'private.is_sponsor(uuid)', 'EXECUTE') then
    raise exception 'is_sponsor is callable by anon or public';
  end if;

  select c.relrowsecurity and c.relforcerowsecurity into forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'sponsor_handovers';
  if forced is distinct from true then
    raise exception 'handover table is missing forced row security';
  end if;
  select c.relrowsecurity and c.relforcerowsecurity into forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'sponsor_welcome_dismissals';
  if forced is distinct from true then
    raise exception 'welcome table is missing forced row security';
  end if;
  if has_table_privilege('anon', 'public.sponsor_handovers', 'SELECT')
     or has_table_privilege('authenticated', 'public.sponsor_handovers', 'SELECT')
     or has_table_privilege('anon', 'public.sponsor_welcome_dismissals', 'SELECT')
     or has_table_privilege('authenticated', 'public.sponsor_welcome_dismissals', 'INSERT') then
    raise exception 'client grant on a sponsor table';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  begin
    perform public.set_member_tiers(member_id, array['member', 'sponsor']::text[]);
    raise exception 'aal1 was allowed to change tiers';
  exception
    when others then
      if position('not_allowed' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set role authenticated;
  begin
    perform public.set_member_tiers(member_id, array['member', 'sponsor']::text[]);
    raise exception 'a member was allowed to change tiers';
  exception
    when others then
      if position('not_allowed' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set role authenticated;
  perform public.set_member_tiers(member_id, array['member', 'sponsor']::text[]);
  set role postgres;

  select m.seat, m.prior_seat, m.invites_granted, m.invites_remaining
    into seat, prior, granted, remaining
  from public.members m
  where m.user_id = member_id;
  if seat is distinct from 'sponsor' or prior is distinct from 'ksa' or granted is distinct from 0 or remaining is distinct from 0 then
    raise exception 'sponsor add did not save the region and zero the wallet';
  end if;

  set role authenticated;
  perform public.set_member_tiers(member_id, array['member']::text[]);
  set role postgres;
  select m.seat, m.prior_seat, m.invites_granted, m.invites_remaining
    into seat, prior, granted, remaining
  from public.members m
  where m.user_id = member_id;
  if seat is distinct from 'ksa' or prior is not null or granted is distinct from 2 or remaining is distinct from 2 then
    raise exception 'sponsor removal did not restore the region and the weekly wallet';
  end if;

  set role authenticated;
  begin
    perform public.set_member_tiers(open_id, array['member']::text[]);
    raise exception 'removal without a region was allowed';
  exception
    when others then
      if position('This sponsor has no saved region. Set the region before removing the Sponsor tier.' in sqlerrm) = 0 then
        raise;
      end if;
  end;
  begin
    perform public.set_member_tiers(open_id, array['founding', 'sponsor']::text[]);
    raise exception 'founding on a sponsor seat was allowed';
  exception
    when others then
      if position('A sponsor seat cannot also hold the Founding tier.' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'role', 'service_role', 'aal', 'aal2')::text, true);
  set role service_role;
  perform public.claim_sponsor_seat(claim_id, 'sponsor.claim@example.com', staff_id, null, null);
  perform public.claim_sponsor_seat(third_id, 'sponsor.third@example.com', staff_id, null, null);
  set role postgres;

  select m.seat, m.tiers, m.invites_granted, m.invites_remaining, m.prior_seat
    into seat, tiers, granted, remaining, prior
  from public.members m
  where m.user_id = claim_id;
  if seat is distinct from 'sponsor'
     or not ('sponsor' = any (tiers))
     or granted is distinct from 0
     or remaining is distinct from 0
     or prior is not null then
    raise exception 'invite path did not set the sponsor tier';
  end if;

  select count(*)::int into once_n
  from public.members m
  where m.user_id = open_id
    and m.seat = 'sponsor'
    and 'sponsor' = any (m.tiers)
    and private.is_sponsor(m.user_id);
  if once_n is distinct from 1 then
    raise exception 'a tier and seat sponsor was counted more than once';
  end if;

  select count(*)::int into sponsor_n
  from public.members m
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and private.is_sponsor(m.user_id);
  if sponsor_n is distinct from 3 then
    raise exception 'sponsor cap count was %', sponsor_n;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set role authenticated;
  begin
    perform public.set_member_tiers(member_id, array['member', 'sponsor']::text[]);
    raise exception 'a fourth sponsor was allowed';
  exception
    when others then
      if position('sponsor_cap' in sqlerrm) = 0 then
        raise;
      end if;
  end;
  set role postgres;
end
$sync$;
`
