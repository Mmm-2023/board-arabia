import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')

const searchName = '20261129120000_function_search_path.sql'
const masterName = '20261129130000_master_admin_user_id.sql'
const purgeName = '20261129140000_due_diligence_file_purge_rls.sql'
const accessName = '20261129150000_staff_access_log_rpc_only.sql'

test('search_path, master guard, purge tables, and access log hold in postgres', { timeout: 180_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.deepEqual(names.slice(-4), [searchName, masterName, purgeName, accessName])
  const prior = names.filter((name) => name < searchName)
  assert.ok(prior.includes('20261128120000_retention_privacy_audit.sql'))
  assert.ok(prior.includes('20261127120000_staff_aal2_private_files.sql'))

  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-hygiene-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_hygiene_${process.pid}`
  writeFileSync(script, [
    stubSql,
    ...prior.map(include),
    setupSql,
    include(searchName),
    compareSql,
    include(searchName),
    compareSql,
    seedSql,
    include(masterName),
    lockoutSql,
    include(masterName),
    rootStillSql,
    include(purgeName),
    include(purgeName),
    include(accessName),
    include(accessName),
    closingSql,
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
`

const setupSql = `
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'ada.hygiene@example.com');

insert into public.candidates (
  user_id, email, full_name, role, region,
  company_name, job_title, linkedin_url,
  scale_kind, scale_band, sector_tags, vision_tags,
  statement, cr_number, referral_name, investable_capacity_usd, phone
) values (
  '11111111-1111-4111-8111-111111111111',
  'ada.hygiene@example.com',
  'Ada Example',
  'chairperson',
  'ksa_gcc',
  'Example Co',
  'Chair',
  'https://www.linkedin.com/in/ada-example/',
  'turnover',
  't_under_10m',
  array['energy'],
  array['growth'],
  repeat('a', 200),
  '1234567890',
  'Sam Example',
  1000,
  '0500000000'
);

create function pg_temp.samples() returns jsonb
language plpgsql
as $$
declare
  result jsonb;
  checks jsonb;
begin
  select coalesce(jsonb_object_agg(step, private.checklist_complete(c, step)), '{}'::jsonb)
    into checks
  from public.candidates c
  cross join unnest(array[
    'role', 'company_title', 'linkedin', 'scale_band', 'sectors', 'statement',
    'cr_number', 'referral', 'capacity', 'phone', 'nope'
  ]) as step
  where c.user_id = '11111111-1111-4111-8111-111111111111';

  result := jsonb_build_object(
    'attribution', jsonb_build_array(
      private.attribution_token(null),
      private.attribution_token('ok_token'),
      private.attribution_token('Bad'),
      private.attribution_token('has space'),
      private.attribution_token('abc@x'),
      private.attribution_token('1234567'),
      private.attribution_token('')
    ),
    'paid', jsonb_build_array(
      private.marketing_is_paid('cpc'),
      private.marketing_is_paid(' CPC '),
      private.marketing_is_paid('organic'),
      private.marketing_is_paid(null)
    ),
    'channel', jsonb_build_array(
      private.marketing_channel_match('cpc', 'paid'),
      private.marketing_channel_match('cpc', 'organic'),
      private.marketing_channel_match('newsletter', 'organic'),
      private.marketing_channel_match('x', 'all'),
      private.marketing_channel_match(null, null)
    ),
    'bucket', jsonb_build_array(
      private.marketing_bucket(0),
      private.marketing_bucket(null),
      private.marketing_bucket(4),
      private.marketing_bucket(5),
      private.marketing_bucket(12)
    ),
    'catalog', to_jsonb(private.membership_tier_catalog()),
    'norm', to_jsonb(private.normalize_membership_tiers(array['sponsor', 'founding', 'nope', 'founding'])),
    'norm_null', to_jsonb(private.normalize_membership_tiers(null)),
    'valid', jsonb_build_array(
      private.membership_tiers_valid(array['founding', 'sponsor']),
      private.membership_tiers_valid(array['founding', 'member']),
      private.membership_tiers_valid(array['member']),
      private.membership_tiers_valid(null)
    ),
    'checklist', checks
  );
  return result;
end
$$;

create temp table before_samples (payload jsonb);
insert into before_samples values (pg_temp.samples());

create temp table kept_definer (name text primary key, src text);
insert into kept_definer
select p.proname, md5(p.prosrc)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'set_due_diligence_report_admin_share',
    'set_due_diligence_deck_admin_share',
    'set_ai_tool_result_admin_share',
    'staff_private_work_counts',
    'own_admin_share_state'
  );
do $kept$
begin
  if (select count(*) from kept_definer) <> 5 then
    raise exception 'expected five share and count functions';
  end if;
end
$kept$;
`

const compareSql = `
do $cmp$
declare
  before jsonb;
  after jsonb;
  pinned int;
  missing int;
begin
  select payload into before from before_samples;
  after := pg_temp.samples();
  if before is distinct from after then
    raise exception 'search_path changed function results';
  end if;

  select count(*) into pinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in (
      'attribution_token',
      'checklist_complete',
      'marketing_is_paid',
      'marketing_channel_match',
      'marketing_bucket',
      'membership_tier_catalog',
      'normalize_membership_tiers',
      'membership_tiers_valid'
    )
    and exists (
      select 1 from unnest(p.proconfig) cfg where cfg = 'search_path=""'
    );
  if pinned <> 8 then
    raise exception 'expected 8 empty search_path settings, found %', pinned;
  end if;

  select count(*) into missing
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
      where cfg like 'search_path=%'
    );
  if missing <> 0 then
    raise exception 'functions still missing search_path: %', missing;
  end if;
end
$cmp$;
`

const seedSql = `
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'master@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'staff@example.com'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'member@example.com');

insert into public.staff_users (user_id, email, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'master@example.com', 'master'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'staff@example.com', 'staff');

insert into public.members (user_id, email, seat, status, must_set_password)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'member@example.com', 'ksa', 'active', false);
`

const lockoutSql = `
create or replace function pg_temp.assume(p_user uuid, p_aal text, p_role text)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'aal', p_aal, 'role', p_role)::text,
    false
  );
end
$$;

do $checks$
begin
  if (select count(*) from private.root_master) <> 1 then
    raise exception 'root master was not copied';
  end if;
  if (select user_id from private.root_master) <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'root master is not the example master';
  end if;

  perform pg_temp.assume('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2', 'authenticated');
  if not private.is_staff() then raise exception 'master aal2 staff denied'; end if;
  if not private.is_master() then raise exception 'master aal2 master denied'; end if;

  perform pg_temp.assume('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1', 'authenticated');
  if private.is_staff() then raise exception 'master aal1 staff allowed'; end if;
  if private.is_master() then raise exception 'master aal1 master allowed'; end if;

  perform pg_temp.assume('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aal2', 'authenticated');
  if not private.is_staff() then raise exception 'staff aal2 denied'; end if;
  if private.is_master() then raise exception 'staff aal2 passed master'; end if;

  perform pg_temp.assume('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aal2', 'authenticated');
  if private.is_staff() then raise exception 'member passed staff'; end if;
  if private.is_master() then raise exception 'member passed master'; end if;

  perform set_config('request.jwt.claims', '{}', false);
end
$checks$;

do $writes$
begin
  begin
    update public.staff_users set role = 'staff'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'demote root allowed';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.staff_users set email = 'moved@example.com'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'rename root allowed';
  exception when insufficient_privilege then
    null;
  end;

  begin
    delete from public.staff_users
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'delete root allowed';
  exception when insufficient_privilege then
    null;
  end;

  update public.staff_users set email = 'staff2@example.com'
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  insert into auth.users (id, email) values
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'second@example.com');
  insert into public.staff_users (user_id, email, role)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'second@example.com', 'master');
  update public.staff_users set role = 'staff'
  where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  begin
    update public.staff_users set role = 'staff'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'demote root with another master allowed';
  exception when insufficient_privilege then
    null;
  end;
end
$writes$;
`

const rootStillSql = `
do $still$
begin
  if (select user_id from private.root_master) <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'reapply moved the root master';
  end if;
  if (select role from public.staff_users where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'master' then
    raise exception 'example master lost the master role';
  end if;
  perform pg_temp.assume('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2', 'authenticated');
  if not private.is_staff() or not private.is_master() then
    raise exception 'example master no longer passes after reapply';
  end if;
end
$still$;
`

const closingSql = `
do $purge$
declare
  rec record;
  priv text;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('due_diligence_file_purge', 'ai_tool_file_purge')
    group by n.nspname
    having count(*) = 2
  ) then
    raise exception 'purge tables missing';
  end if;

  for rec in
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like '%\\_purge' escape '\\'
  loop
    if not rec.relrowsecurity or not rec.relforcerowsecurity then
      raise exception 'purge table % is missing forced rls', rec.relname;
    end if;
    foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    loop
      if has_table_privilege('anon', format('public.%I', rec.relname), priv)
         or has_table_privilege('authenticated', format('public.%I', rec.relname), priv) then
        raise exception 'purge table % grants % to anon or authenticated', rec.relname, priv;
      end if;
    end loop;
  end loop;

  if not has_table_privilege('service_role', 'public.due_diligence_file_purge', 'SELECT')
     or not has_table_privilege('service_role', 'public.ai_tool_file_purge', 'DELETE') then
    raise exception 'service_role lost purge access';
  end if;
end
$purge$;

do $allrls$
declare
  missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;
  if missing is not null then
    raise exception 'public tables missing rls: %', missing;
  end if;
end
$allrls$;

do $kept2$
begin
  if (
    select count(*)
    from kept_definer k
    join pg_proc p on p.proname = k.name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where md5(p.prosrc) = k.src
  ) <> 5 then
    raise exception 'share or count function body changed';
  end if;
end
$kept2$;

set role service_role;
insert into public.staff_access_log (staff_user_id, member_id, object_type, object_id, action)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'member',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'read'
);
reset role;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'aal', 'aal2',
    'role', 'authenticated'
  )::text,
  false
);
set role authenticated;

do $stafflog$
declare
  payload jsonb;
begin
  begin
    perform count(*) from public.staff_access_log;
    raise exception 'aal2 staff direct select allowed';
  exception when insufficient_privilege then
    null;
  end;
  payload := public.staff_list_access_log('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  if payload::text like '%staff_user_id%' then
    raise exception 'access log rpc returned a staff id key';
  end if;
  if payload::text like '%bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb%' then
    raise exception 'access log rpc returned the staff id';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(payload) entry
    where entry->>'actor_role' = 'Admin'
      and entry->>'action' = 'read'
      and entry ? 'actor_name'
  ) then
    raise exception 'aal2 staff rpc did not return the read';
  end if;
end
$stafflog$;

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'aal', 'aal2',
    'role', 'authenticated'
  )::text,
  false
);
set role authenticated;

do $memberlog$
begin
  begin
    perform count(*) from public.staff_access_log;
    raise exception 'member direct select allowed';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.staff_list_access_log('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    raise exception 'member rpc allowed';
  exception when insufficient_privilege then
    null;
  end;
end
$memberlog$;

reset role;
select set_config('request.jwt.claims', '{}', false);
set role anon;

do $anonlog$
begin
  begin
    perform count(*) from public.staff_access_log;
    raise exception 'anon direct select allowed';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.staff_list_access_log('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    raise exception 'anon rpc allowed';
  exception when insufficient_privilege then
    null;
  end;
end
$anonlog$;

reset role;
`
