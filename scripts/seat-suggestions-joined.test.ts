import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20270114120000_seat_suggestions_joined.sql'
const priorName = '20270113120000_seat_matching.sql'
const migration = readFileSync(path.join(migrationsDir, migrationName), 'utf8')

const POSTER = '22222222-2222-4222-8222-222222222222'
const JOINED = '11111111-1111-4111-8111-111111111111'
const INVITED = '33333333-3333-4333-8333-333333333333'
const STAFF = '99999999-9999-4999-8999-999999999999'
const ACTIVE_SEAT = 'c1111111-1111-4111-8111-111111111111'
const INVITED_SEAT = 'c2222222-2222-4222-8222-222222222222'

test('joined seat suggestions are the newest migration and stay inert', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.at(-1), migrationName)
  assert.ok(names.indexOf(migrationName) > names.indexOf(priorName))
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/\bcron\b|pg_cron|net\.http|send_email/i.test(migration), false)
  assert.equal(/\bto anon\b/i.test(migration), false)
  assert.equal(/grant\s+(all|execute)\s+on\s+[^;]*\bto\s+public\b/i.test(migration), false)
  assert.deepEqual(migration.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [], [])
  assert.match(migration, /m\.status = 'active'/)
  assert.match(migration, /poster\.status = 'active'/)
  assert.match(migration, /caller\.status = 'active'/)
  assert.equal(migration.includes("m.status in ('invited', 'active')"), false)
  const headers = migration.split(/create or replace function /i).slice(1)
  assert.equal(headers.length, 3)
  for (const header of headers) {
    assert.match(header.slice(0, header.indexOf('as $$')), /set search_path = ''/)
    assert.match(header.slice(0, header.indexOf('as $$')), /security definer/)
  }
})

const fixtureSql = `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
exception when duplicate_object then null;
end
$roles$;

create schema if not exists auth;
create schema if not exists private;
grant usage on schema public, private, auth to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant execute on function auth.uid() to public;
grant execute on function auth.jwt() to public;

create table public.members (
  user_id uuid primary key,
  seat text,
  status text,
  is_demo boolean not null default false,
  show_card_to_sponsors boolean not null default false,
  directory_hidden boolean not null default false,
  email text,
  tiers text[] not null default '{}'::text[]
);
create table public.profiles (
  user_id uuid primary key,
  full_name text,
  headline text,
  company text,
  phone text,
  sector_tags text[] not null default '{}',
  looking_for text[] not null default '{}',
  looking_for_line text,
  can_help_with text[] not null default '{}',
  can_help_line text
);
create table public.profile_boardroom (
  user_id uuid primary key references public.profiles(user_id),
  open_to_seats boolean not null default false,
  seat_types text[] not null default '{}',
  seat_where text[] not null default '{}',
  expertise text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create table public.profile_board_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  organisation text not null,
  role text not null,
  org_type text not null,
  position smallint not null
);
create table public.staff_users (user_id uuid primary key, role text not null);
create table public.re_board_roles (
  id uuid primary key default gen_random_uuid(),
  is_demo boolean not null default false,
  published boolean not null default false,
  scope text not null default 'general',
  status text not null default 'draft',
  seat_kind text not null,
  title text not null,
  sector text not null,
  capacity text not null,
  city text,
  asset_class text,
  sector_tags text[] not null default '{}',
  regions text[] not null default '{}',
  posted_by_member_id uuid,
  organisation_name text not null,
  terms text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  narrative text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table public.re_board_role_intros (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.re_board_roles(id) on delete cascade,
  member_id uuid not null,
  status text not null,
  note text
);
create table public.member_intros (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  target_id uuid not null,
  reason text not null,
  status text not null
);

create or replace function private.board_expertise() returns text[] language sql immutable security definer set search_path = '' as $$
  select array['Governance','Strategy']::text[];
$$;
create or replace function private.board_seat_types() returns text[] language sql immutable security definer set search_path = '' as $$
  select array['Chair','Independent director','Non-executive director','Adviser']::text[];
$$;
create or replace function private.board_seat_where() returns text[] language sql immutable security definer set search_path = '' as $$
  select array['Saudi Arabia','GCC','International']::text[];
$$;
create or replace function private.text_list_ok(p_items text[], p_allowed text[], p_max integer)
returns boolean language sql immutable security definer set search_path = '' as $$
  select p_items is not null and p_allowed is not null
    and coalesce(cardinality(p_items), 0) <= p_max and p_items <@ p_allowed
    and (select count(*) from unnest(p_items) item) = (select count(distinct item) from unnest(p_items) item);
$$;
create or replace function private.board_seat_has_phone(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_text, '') ~ '[0-9]{8}';
$$;
create or replace function private.board_seat_text_array(p_value jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce((select array_agg(item) from jsonb_array_elements_text(coalesce(p_value, '[]'::jsonb)) item), '{}'::text[]);
$$;
create or replace function private.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.role in ('staff', 'master'))
    and (auth.jwt() ->> 'aal') = 'aal2';
$$;
create or replace function private.is_sponsor(p_uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = p_uid and m.seat = 'sponsor');
$$;
create or replace function private.sample_subject(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = p_id and m.is_demo);
$$;
create or replace function private.assert_board_seat_member(p_allow_sponsor boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.sample_subject(auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members m
    where m.user_id = auth.uid() and m.is_demo = false and m.status in ('invited', 'active')
      and m.seat in ('ksa', 'intl')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;
create or replace function private.assert_boardroom_owner() returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;
create or replace function private.touch_profile_updated(p_user uuid) returns void language sql security definer set search_path = '' as $$
  select null::void;
$$;
create or replace function private.prepare_member_board_seat(
  p_seat_kind text, p_title text, p_sector text, p_capacity text, p_sector_tags text[], p_regions text[],
  p_organisation_name text, p_terms text, p_narrative text
) returns jsonb language sql security definer set search_path = '' as $$
  select '{}'::jsonb;
$$;

insert into public.members (user_id, seat, status, is_demo, show_card_to_sponsors, directory_hidden, email) values
  ('${POSTER}', 'ksa', 'active', false, false, false, 'poster.seat@example.com'),
  ('${JOINED}', 'ksa', 'active', false, false, false, 'joined.seat@example.com'),
  ('${INVITED}', 'ksa', 'invited', false, false, false, 'invited.seat@example.com'),
  ('${STAFF}', 'ksa', 'active', false, false, false, 'staff.seat@example.com');
insert into public.staff_users (user_id, role) values ('${STAFF}', 'staff');
insert into public.profiles (user_id, full_name, headline, company, sector_tags, looking_for, can_help_with) values
  ('${POSTER}', 'Example Poster', 'Chair', 'Poster Court', array['Health'], '{}', '{}'),
  ('${JOINED}', 'Joined Member', 'Director', 'Joined Court', array['Health'], array['Board seat'], array['Board experience']),
  ('${INVITED}', 'Invited Member', 'Director', 'Invited Court', array['Health'], array['Board seat'], array['Board experience']),
  ('${STAFF}', 'Staff Member', 'Director', 'Staff Court', '{}', '{}', '{}');
insert into public.profile_boardroom (user_id, open_to_seats, seat_types, seat_where, expertise) values
  ('${JOINED}', true, array['Chair'], array['Saudi Arabia'], array['Governance']),
  ('${INVITED}', true, array['Chair'], array['Saudi Arabia'], array['Governance']);
`

const assertSql = `
insert into public.re_board_roles (
  id, is_demo, published, scope, status, seat_kind, title, sector, capacity, sector_tags, regions,
  posted_by_member_id, organisation_name, terms, narrative, skills_wanted
) values
  ('${ACTIVE_SEAT}', false, true, 'general', 'published', 'company_board', 'Joined poster seat', 'Health', 'Time', array['Health'], array['Riyadh'], '${POSTER}', 'North Court', 'Terms', 'Narrative', array['Governance']),
  ('${INVITED_SEAT}', false, true, 'general', 'published', 'company_board', 'Invited poster seat', 'Health', 'Time', array['Health'], array['Riyadh'], '${INVITED}', 'Quiet Court', 'Terms', 'Narrative', array['Governance']);

create or replace function pg_temp.fail(msg text) returns void language plpgsql as $$
begin
  raise exception '%', msg;
end;
$$;
create or replace function pg_temp.assume(p_sub uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', p_aal, 'role', 'authenticated')::text, false);
  set role authenticated;
end;
$$;

do $checks$
declare
  v_payload jsonb;
begin
  perform pg_temp.assume('${STAFF}', 'aal2');
  perform public.staff_set_seat_suggestions(true);

  perform pg_temp.assume('${JOINED}', 'aal1');
  v_payload := public.list_my_seat_suggestions();
  if v_payload->>'state' is distinct from 'ready' then
    perform pg_temp.fail('joined state ' || coalesce(v_payload->>'state', 'null'));
  end if;
  if v_payload::text like '%${INVITED_SEAT}%' then
    perform pg_temp.fail('may fit you included a seat posted by an invited member');
  end if;
  if v_payload::text not like '%${ACTIVE_SEAT}%' then
    perform pg_temp.fail('may fit you missed the joined poster ' || v_payload::text);
  end if;
  v_payload := public.my_seat_match('${INVITED_SEAT}');
  if v_payload->>'state' is distinct from 'none' then
    perform pg_temp.fail('why box for an invited poster ' || coalesce(v_payload->>'state', 'null'));
  end if;

  perform pg_temp.assume('${INVITED}', 'aal1');
  v_payload := public.list_my_seat_suggestions();
  if jsonb_array_length(v_payload->'seats') <> 0 then
    perform pg_temp.fail('invited caller received suggestions ' || v_payload::text);
  end if;

  perform pg_temp.assume('${POSTER}', 'aal1');
  v_payload := public.list_people_for_my_seat('${ACTIVE_SEAT}');
  if v_payload::text like '%${INVITED}%' then
    perform pg_temp.fail('people who may fit included an invited member ' || v_payload::text);
  end if;
  if v_payload::text not like '%${JOINED}%' then
    perform pg_temp.fail('people who may fit missed the joined member ' || v_payload::text);
  end if;
  if v_payload::text like '%@%' or v_payload::text ilike '%turnover%' then
    perform pg_temp.fail('people payload leaked');
  end if;
end
$checks$;
`

test('an invited member is left out of both suggestion lists', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-sm2-joined-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_sm2j_${process.pid}`
  const prior = path.join(migrationsDir, priorName)
  const next = path.join(migrationsDir, migrationName)
  writeFileSync(script, `${fixtureSql}\n\\i ${prior}\n\\i ${next}\n${assertSql}\n`)
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
