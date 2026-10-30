import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SEAT_SUGGESTION_COPY, presentSuggestedPeople, seatIntroReason, seatReasonText } from '../src/lib/seatMatch.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20270113120000_seat_matching.sql'
const migrationPath = path.join(migrationsDir, migrationName)
const migration = readFileSync(migrationPath, 'utf8')

const SEEKER = '11111111-1111-4111-8111-111111111111'
const POSTER = '22222222-2222-4222-8222-222222222222'
const HIDDEN = '33333333-3333-4333-8333-333333333333'
const INTL = '44444444-4444-4444-8444-444444444444'
const PARTNER = '55555555-5555-4555-8555-555555555555'
const QUIET = '66666666-6666-4666-8666-666666666666'
const SAMPLE = '77777777-7777-4777-8777-777777777777'
const STAFF = '99999999-9999-4999-8999-999999999999'
const APPLIED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WEAK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function sliceFn(name: string) {
  const start = migration.indexOf(`function ${name}`)
  assert.ok(start >= 0, name)
  const end = migration.indexOf('\n$$;', start)
  assert.ok(end > start, name)
  return migration.slice(start, end)
}

test('seat matching migration is the newest slot and stays inert', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.at(-1), migrationName)
  assert.ok(migrationName > '20270112120000')
  assert.ok(migrationName > '20270111120000_application_withdrawn_closed_retention.sql')
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/\bcron\b|pg_cron|net\.http|send_email|raise_member_notification/i.test(migration), false)
  assert.equal(/\b(price|fee|usd|sar)\b/i.test(migration), false)
  assert.equal(/\bto anon\b/i.test(migration), false)
  assert.equal(/grant\s+(all|execute)\s+on\s+[^;]*\bto\s+public\b/i.test(migration), false)
  assert.equal(/nammco/i.test(migration), false)
  assert.equal(migration.toLowerCase().includes('the desk'), false)
  assert.equal(migration.toLowerCase().includes('endorsement'), false)
  assert.deepEqual(migration.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [], [])
  const headers = migration.split(/create or replace function /i).slice(1)
  for (const header of headers) {
    assert.match(header.slice(0, header.indexOf('as $$')), /set search_path = ''/)
    assert.match(header.slice(0, header.indexOf('as $$')), /security definer/)
  }
  for (const name of [
    'private.seat_match_reasons',
    'public.list_my_seat_suggestions',
    'public.my_seat_match',
    'public.list_people_for_my_seat',
  ]) {
    const body = sliceFn(name)
    assert.equal(body.includes('looking_for_line'), false, name)
    assert.equal(body.includes('can_help_line'), false, name)
    assert.equal(/\bnarrative\b/.test(body), false, name)
    assert.equal(/\bturnover\b/.test(body), false, name)
    assert.equal(body.includes('contact_email'), false, name)
    assert.equal(body.includes('.email'), false, name)
    assert.equal(body.includes('.phone'), false, name)
  }
  assert.match(migration, /enabled boolean not null default false/)
  assert.match(migration, /assert_board_seat_member\(false\)/)
  assert.match(migration, /boardroom_place/)
  assert.match(migration, /seat_match_clear_on_close/)
  assert.equal(SEAT_SUGGESTION_COPY.disclaimer.includes('endorsement'), false)
  assert.equal(SEAT_SUGGESTION_COPY.disclaimer.includes('\u2014'), false)
})

test('reason lines use one stored chip and the intro names the seat', () => {
  assert.equal(
    seatReasonText({ code: 'looking_for', value: 'Board seat' }, 'seeker'),
    'Matches what you are looking for: Board seat',
  )
  assert.equal(
    seatReasonText({ code: 'expertise', value: 'Governance' }, 'poster'),
    'Has expertise you asked for: Governance',
  )
  assert.equal(
    seatReasonText({ code: 'where', value: 'GCC' }, 'poster'),
    'Open to seats in: GCC',
  )
  const named = seatIntroReason('Independent director', '')
  assert.equal(named.ok, true)
  if (named.ok) assert.equal(named.reason, 'Board seat: Independent director')
  const leaked = seatIntroReason('Independent director', 'Write name@example.com')
  assert.equal(leaked.ok, false)
  const people = presentSuggestedPeople({
    people: [
      {
        user_id: SEEKER,
        name: 'Example Member',
        headline: 'Director',
        company: 'Example Holdings',
        intro_status: 'pending',
        reasons: [{ code: 'sector', value: 'Health' }],
        email: 'hidden.person@example.com',
        phone: '5550100199',
        turnover: 'large',
      },
    ],
  })
  assert.equal(people.length, 1)
  assert.equal(JSON.stringify(people).includes('@'), false)
  assert.equal(JSON.stringify(people).includes('555'), false)
  assert.equal(JSON.stringify(people).includes('turnover'), false)
  assert.equal(JSON.stringify(people).includes('large'), false)
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
exception when duplicate_object then
  null;
end
$roles$;

create schema if not exists auth;
create schema if not exists private;
grant usage on schema public, private, auth to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$
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
create table public.staff_users (
  user_id uuid primary key,
  role text not null
);
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.re_board_role_intros (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.re_board_roles(id) on delete cascade,
  member_id uuid not null,
  status text not null,
  note text,
  requested_at timestamptz not null default now()
);
create table public.member_intros (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  target_id uuid not null,
  reason text not null,
  status text not null,
  requested_at timestamptz not null default now()
);

create or replace function private.board_expertise()
returns text[] language sql immutable security definer set search_path = '' as $$
  select array['Governance','Audit and risk','M&A','Strategy']::text[];
$$;
create or replace function private.board_seat_types()
returns text[] language sql immutable security definer set search_path = '' as $$
  select array['Chair','Independent director','Non-executive director','Committee: Audit','Committee: Risk','Committee: Nomination and remuneration','Adviser']::text[];
$$;
create or replace function private.board_seat_where()
returns text[] language sql immutable security definer set search_path = '' as $$
  select array['Saudi Arabia','GCC','International']::text[];
$$;
create or replace function private.text_list_ok(p_items text[], p_allowed text[], p_max integer)
returns boolean language sql immutable security definer set search_path = '' as $$
  select p_items is not null and p_allowed is not null
    and coalesce(cardinality(p_items), 0) <= p_max
    and p_items <@ p_allowed
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
create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_users s where s.user_id = auth.uid() and s.role in ('staff', 'master'))
    and (auth.jwt() ->> 'aal') = 'aal2';
$$;
create or replace function private.is_sponsor(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.user_id = p_uid and (m.seat = 'sponsor' or 'sponsor' = any (coalesce(m.tiers, '{}'))));
$$;
create or replace function private.sample_subject(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
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
      and (m.seat in ('ksa', 'intl') or (p_allow_sponsor and private.is_sponsor(m.user_id)))
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;
create or replace function private.assert_boardroom_owner()
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
create or replace function private.touch_profile_updated(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  select null::void;
$$;
create or replace function private.prepare_member_board_seat(
  p_seat_kind text, p_title text, p_sector text, p_capacity text, p_sector_tags text[], p_regions text[],
  p_organisation_name text, p_terms text, p_narrative text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_seat_kind not in ('company_board', 'ned', 'adviser') then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'seat_kind', p_seat_kind, 'title', p_title, 'sector', p_sector, 'capacity', p_capacity,
    'sector_tags', to_jsonb(coalesce(p_sector_tags, '{}'::text[])),
    'regions', to_jsonb(coalesce(p_regions, '{}'::text[])),
    'organisation_name', p_organisation_name, 'terms', p_terms, 'narrative', p_narrative
  );
end;
$$;

insert into public.members (user_id, seat, status, is_demo, show_card_to_sponsors, directory_hidden, email) values
  ('${SEEKER}', 'ksa', 'active', false, false, false, 'seeker.seat@example.com'),
  ('${POSTER}', 'ksa', 'active', false, false, false, 'poster.seat@example.com'),
  ('${HIDDEN}', 'ksa', 'active', false, true, true, 'hidden.seat@example.com'),
  ('${INTL}', 'intl', 'active', false, true, false, 'intl.seat@example.com'),
  ('${PARTNER}', 'sponsor', 'active', false, false, false, 'partner.seat@example.com'),
  ('${QUIET}', 'ksa', 'active', false, false, false, 'quiet.seat@example.com'),
  ('${SAMPLE}', 'ksa', 'active', true, true, false, 'sample.seat@example.com'),
  ('${APPLIED}', 'ksa', 'active', false, true, false, 'applied.seat@example.com'),
  ('${WEAK}', 'ksa', 'active', false, true, false, 'weak.seat@example.com'),
  ('${STAFF}', 'ksa', 'active', false, false, false, 'staff.seat@example.com');
insert into public.staff_users (user_id, role) values ('${STAFF}', 'staff');
insert into public.profiles (user_id, full_name, headline, company, phone, sector_tags, looking_for, looking_for_line, can_help_with, can_help_line) values
  ('${SEEKER}', 'Example Seeker', 'Director', 'Seeker Court', '5550100101', array['Health'], array['Board seat'], 'A long free text line about a board seat.', '{}', 'Free text help'),
  ('${POSTER}', 'Example Poster', 'Chair', 'Poster Court', null, array['Health'], '{}', 'Poster line', '{}', null),
  ('${HIDDEN}', 'Hidden Member', 'Director', 'Quiet Court', '5550100102', array['Health'], array['Board seat'], 'Hidden line', array['Board experience'], null),
  ('${INTL}', 'Intl Member', 'Director', 'Intl Court', null, array['Health'], array['Board seat'], 'Intl line', '{}', null),
  ('${PARTNER}', 'Example Partner', 'Partner', 'Partner Court', null, '{}', '{}', null, '{}', null),
  ('${QUIET}', 'Quiet Member', 'Director', 'No Card Court', '5550100103', array['Health'], array['Board seat'], 'Quiet line', array['Board experience'], null),
  ('${SAMPLE}', 'Sample Card', 'Director', 'Sample Court', null, array['Health'], array['Board seat'], 'Sample line', '{}', null),
  ('${APPLIED}', 'Applied Member', 'Director', 'Applied Court', null, array['Health'], array['Board seat'], 'Applied line', '{}', null),
  ('${WEAK}', 'Weak Member', 'Director', 'Weak Court', null, array['Tourism'], '{}', 'Weak line should not match', '{}', null),
  ('${STAFF}', 'Staff Member', 'Director', 'Staff Court', null, '{}', '{}', null, '{}', null);
`

const assertSql = `
insert into public.profile_boardroom (user_id, open_to_seats, seat_types, seat_where, expertise) values
  ('${SEEKER}', true, array['Chair','Committee: Audit'], array['Saudi Arabia','GCC'], array['Governance']),
  ('${HIDDEN}', true, array['Chair'], array['Saudi Arabia'], array['Governance']),
  ('${INTL}', true, array['Chair'], array['International'], array['Governance']),
  ('${QUIET}', true, array['Independent director'], array['GCC'], array['Strategy']),
  ('${SAMPLE}', true, array['Chair'], array['Saudi Arabia'], array['Governance']),
  ('${APPLIED}', true, array['Chair'], array['Saudi Arabia'], array['Governance']),
  ('${WEAK}', true, array['Chair'], array['Saudi Arabia'], array['M&A']);
insert into public.profile_board_roles (user_id, organisation, role, org_type, position) values
  ('${QUIET}', 'Example Holdings', 'Chair', 'Private', 1),
  ('${QUIET}', 'Example Holdings', 'Vice chair', 'Private', 2);

insert into public.re_board_roles (
  id, is_demo, published, scope, status, seat_kind, title, sector, capacity, sector_tags, regions,
  posted_by_member_id, organisation_name, terms, narrative, created_at
) values
  ('c1111111-1111-4111-8111-111111111111', false, true, 'general', 'published', 'company_board', 'Audit chair', 'Ignore this free text sector', 'Time', array['Health'], array['Riyadh'], '${POSTER}', 'North Court', 'Seat terms that must not be read', 'Narrative that must not be read', '2026-01-01'),
  ('c2222222-2222-4222-8222-222222222222', false, true, 'general', 'published', 'company_board', 'Older strong seat', 'Other words', 'Time', array['Health'], array['Riyadh'], '${POSTER}', 'Older Court', 'Terms', 'Narrative two', '2026-01-02'),
  ('c3333333-3333-4333-8333-333333333333', false, true, 'general', 'published', 'ned', 'Newer single seat', 'Other words', 'Time', array['Health'], array['Riyadh'], '${POSTER}', 'Newer Court', 'Terms', 'Narrative three', '2026-03-01'),
  ('c4444444-4444-4444-8444-444444444444', false, true, 'general', 'published', 'adviser', 'Advisory seat', 'Other words', 'Time', array['Health'], array['Riyadh'], '${POSTER}', 'Advice Court', 'Terms', 'Narrative four', '2026-04-01'),
  ('c5555555-5555-4555-8555-555555555555', false, true, 'general', 'published', 'company_board', 'Own seat', 'Other words', 'Time', array['Health'], array['Riyadh'], '${SEEKER}', 'Own Court', 'Terms', 'Narrative five', '2026-05-01'),
  ('c6666666-6666-4666-8666-666666666666', false, false, 'general', 'pending_review', 'company_board', 'Pending seat', 'Other words', 'Time', array['Health'], array['Riyadh'], '${POSTER}', 'Pending Court', 'Terms', 'Narrative six', '2026-06-01');

update public.re_board_roles
set skills_wanted = array['Governance']
where id in (
  'c1111111-1111-4111-8111-111111111111',
  'c2222222-2222-4222-8222-222222222222',
  'c5555555-5555-4555-8555-555555555555',
  'c6666666-6666-4666-8666-666666666666'
);

insert into public.re_board_role_intros (role_id, member_id, status) values
  ('c2222222-2222-4222-8222-222222222222', '${APPLIED}', 'pending'),
  ('c2222222-2222-4222-8222-222222222222', '${SEEKER}', 'pending');

insert into public.member_intros (requester_id, target_id, reason, status) values
  ('${POSTER}', '${QUIET}', 'Board seat: Audit chair', 'pending');

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
  v_codes text;
  v_count int;
  v_id uuid;
begin
  if has_function_privilege('anon', 'public.list_my_seat_suggestions()', 'execute') then
    perform pg_temp.fail('anon can list suggestions');
  end if;
  if has_function_privilege('anon', 'public.list_people_for_my_seat(uuid)', 'execute') then
    perform pg_temp.fail('anon can list people');
  end if;
  if has_function_privilege('anon', 'public.staff_set_seat_suggestions(boolean)', 'execute') then
    perform pg_temp.fail('anon can set the switch');
  end if;

  perform pg_temp.assume('${SEEKER}', 'aal1');
  v_payload := public.list_my_seat_suggestions();
  if v_payload->>'enabled' is distinct from 'false' or v_payload->>'state' is distinct from 'off' or jsonb_array_length(v_payload->'seats') <> 0 then
    perform pg_temp.fail('switch off still returned seats');
  end if;
  begin
    perform public.dismiss_seat_match('c1111111-1111-4111-8111-111111111111', null);
    perform pg_temp.fail('dismiss worked while off');
  exception when sqlstate '42501' then
    null;
  end;

  perform pg_temp.assume('${STAFF}', 'aal1');
  begin
    perform public.staff_set_seat_suggestions(true);
    perform pg_temp.fail('aal1 turned the switch on');
  exception when sqlstate '42501' then
    null;
  end;
  perform pg_temp.assume('${STAFF}', 'aal2');
  v_payload := public.staff_set_seat_suggestions(true);
  if v_payload->>'enabled' is distinct from 'true' then
    perform pg_temp.fail('switch did not turn on');
  end if;

  execute 'reset role';
  update public.profiles set looking_for_line = 'Completely different free text' where user_id = '${SEEKER}';
  update public.re_board_roles set narrative = 'A different narrative', terms = 'Different terms', sector = 'Not Health' where id = 'c1111111-1111-4111-8111-111111111111';
  perform pg_temp.assume('${SEEKER}', 'aal1');
  v_payload := public.list_my_seat_suggestions();
  if v_payload->>'state' is distinct from 'ready' then
    perform pg_temp.fail('seeker state ' || coalesce(v_payload->>'state', 'null'));
  end if;
  if jsonb_array_length(v_payload->'seats') <> 1 then
    perform pg_temp.fail('seeker seat count ' || jsonb_array_length(v_payload->'seats')::text || ' ' || v_payload::text);
  end if;
  if (v_payload->'seats'->0->>'id') is distinct from 'c1111111-1111-4111-8111-111111111111' then
    perform pg_temp.fail('wrong top seat ' || v_payload::text);
  end if;
  select string_agg(item->>'code', ',' order by ord) into v_codes
  from jsonb_array_elements(v_payload->'seats'->0->'reasons') with ordinality as listed(item, ord);
  if v_codes is distinct from 'looking_for,expertise,sector,seat_type,seat_type,where,where' then
    perform pg_temp.fail('reason order ' || coalesce(v_codes, 'null'));
  end if;
  if v_payload::text like '%@%' or v_payload::text ilike '%narrative%' or v_payload::text ilike '%turnover%' or v_payload::text like '%555%' then
    perform pg_temp.fail('seeker payload leaked');
  end if;

  v_payload := public.my_seat_match('c3333333-3333-4333-8333-333333333333');
  if v_payload->>'state' is distinct from 'none' then
    perform pg_temp.fail('ned should not match a chair only seeker');
  end if;
  v_payload := public.my_seat_match('c4444444-4444-4444-8444-444444444444');
  if v_payload->>'state' is distinct from 'none' then
    perform pg_temp.fail('adviser matched the wrong type');
  end if;
  v_payload := public.my_seat_match('c5555555-5555-4555-8555-555555555555');
  if v_payload->>'state' is distinct from 'own' then
    perform pg_temp.fail('own seat was suggested');
  end if;
  v_payload := public.my_seat_match('c2222222-2222-4222-8222-222222222222');
  if v_payload->>'state' is distinct from 'none' then
    perform pg_temp.fail('applied seat still matched');
  end if;
  begin
    perform public.my_seat_match('c6666666-6666-4666-8666-666666666666');
    perform pg_temp.fail('pending seat was readable as a match');
  exception when sqlstate 'P0002' then
    null;
  end;

  execute 'reset role';
  update public.profile_boardroom set open_to_seats = false where user_id = '${SEEKER}';
  perform pg_temp.assume('${SEEKER}', 'aal1');
  v_payload := public.list_my_seat_suggestions();
  if v_payload->>'state' is distinct from 'not_open' or jsonb_array_length(v_payload->'seats') <> 0 then
    perform pg_temp.fail('closed opt in still suggested');
  end if;
  execute 'reset role';
  update public.profile_boardroom set open_to_seats = true, seat_where = array['International'] where user_id = '${SEEKER}';
  perform pg_temp.assume('${SEEKER}', 'aal1');
  v_payload := public.list_my_seat_suggestions();
  if v_payload->>'state' is distinct from 'ready' or jsonb_array_length(v_payload->'seats') <> 0 then
    perform pg_temp.fail('international alone matched a Saudi seat');
  end if;
  execute 'reset role';
  update public.profile_boardroom set seat_where = array['Saudi Arabia','GCC'], seat_types = array['Adviser'] where user_id = '${SEEKER}';
  perform pg_temp.assume('${SEEKER}', 'aal1');
  v_payload := public.my_seat_match('c4444444-4444-4444-8444-444444444444');
  if v_payload->>'state' is distinct from 'match' then
    perform pg_temp.fail('adviser type did not match');
  end if;
  execute 'reset role';
  update public.profile_boardroom
  set seat_types = array['Chair','Committee: Audit'], seat_where = array['GCC']
  where user_id = '${SEEKER}';
  update public.profiles set sector_tags = array['Tourism'], looking_for = '{}' where user_id = '${SEEKER}';
  update public.profile_boardroom set expertise = array['M&A'] where user_id = '${SEEKER}';
  perform pg_temp.assume('${SEEKER}', 'aal1');
  v_payload := public.my_seat_match('c1111111-1111-4111-8111-111111111111');
  if v_payload->>'state' is distinct from 'none' then
    perform pg_temp.fail('no signal still matched');
  end if;
  execute 'reset role';
  update public.profiles
  set sector_tags = array['Health'], looking_for = array['Board seat'], looking_for_line = 'Still not a match key'
  where user_id = '${SEEKER}';
  update public.profile_boardroom set expertise = array['Governance'] where user_id = '${SEEKER}';
  perform pg_temp.assume('${SEEKER}', 'aal1');

  perform public.dismiss_seat_match('c1111111-1111-4111-8111-111111111111', null);
  v_payload := public.list_my_seat_suggestions();
  if jsonb_array_length(v_payload->'seats') <> 0 then
    perform pg_temp.fail('dismissed seat remained');
  end if;
  perform public.restore_seat_match('c1111111-1111-4111-8111-111111111111', null);
  v_payload := public.list_my_seat_suggestions();
  if jsonb_array_length(v_payload->'seats') <> 1 then
    perform pg_temp.fail('undo did not restore');
  end if;

  perform pg_temp.assume('${HIDDEN}', 'aal1');
  v_payload := public.list_my_seat_suggestions();
  if v_payload->>'state' is distinct from 'hidden' or jsonb_array_length(v_payload->'seats') <> 0 then
    perform pg_temp.fail('hidden seeker saw seats');
  end if;

  perform pg_temp.assume('${POSTER}', 'aal1');
  v_payload := public.list_people_for_my_seat('c6666666-6666-4666-8666-666666666666');
  if v_payload->>'state' is distinct from 'not_published' then
    perform pg_temp.fail('pending seat listed people');
  end if;
  v_payload := public.list_people_for_my_seat('c1111111-1111-4111-8111-111111111111');
  if v_payload->>'state' is distinct from 'ready' then
    perform pg_temp.fail('poster state ' || coalesce(v_payload->>'state', 'null'));
  end if;
  if v_payload::text like '%@%' or v_payload::text like '%555%' or v_payload::text ilike '%turnover%' or v_payload::text ilike '%hidden line%' or v_payload::text ilike '%quiet line%' then
    perform pg_temp.fail('poster payload leaked ' || v_payload::text);
  end if;
  if v_payload::text like '%${HIDDEN}%' or v_payload::text like '%${INTL}%' or v_payload::text like '%${SAMPLE}%' or v_payload::text like '%${WEAK}%' then
    perform pg_temp.fail('a gated person was listed ' || v_payload::text);
  end if;
  if jsonb_array_length(v_payload->'people') <> 3 then
    perform pg_temp.fail('poster count ' || v_payload::text);
  end if;
  if (v_payload->'people'->0->>'user_id') is distinct from '${SEEKER}' then
    perform pg_temp.fail('more reasons should sort first ' || v_payload::text);
  end if;
  select item->>'intro_status' into v_codes
  from jsonb_array_elements(v_payload->'people') item
  where item->>'user_id' = '${QUIET}';
  if v_codes is distinct from 'pending' then
    perform pg_temp.fail('intro status missing');
  end if;
  select string_agg(reason.item->>'code' || ':' || (reason.item->>'value'), ',' order by reason.ord) into v_codes
  from jsonb_array_elements(v_payload->'people') person,
       jsonb_array_elements(person->'reasons') with ordinality as reason(item, ord)
  where person->>'user_id' = '${QUIET}';
  if v_codes not like 'looking_for%' or v_codes not like '%help_with:Board experience%' or v_codes not like '%role:Chair%' or v_codes like '%Vice chair%' then
    perform pg_temp.fail('poster reasons ' || coalesce(v_codes, 'null'));
  end if;

  perform public.dismiss_seat_match('c1111111-1111-4111-8111-111111111111', '${QUIET}');
  v_payload := public.list_people_for_my_seat('c1111111-1111-4111-8111-111111111111');
  if v_payload::text like '%${QUIET}%' then
    perform pg_temp.fail('dismissed person remained');
  end if;
  execute 'reset role';
  update public.re_board_roles set status = 'closed' where id = 'c1111111-1111-4111-8111-111111111111';
  select count(*) into v_count from public.seat_match_dismissals where role_id = 'c1111111-1111-4111-8111-111111111111';
  if v_count <> 0 then
    perform pg_temp.fail('close kept a dismissal');
  end if;

  execute 'reset role';
  insert into public.re_board_roles (
    id, is_demo, published, scope, status, seat_kind, title, sector, capacity, sector_tags, regions,
    posted_by_member_id, organisation_name, terms, narrative, skills_wanted
  ) values (
    'c7777777-7777-4777-8777-777777777777', false, true, 'general', 'published', 'company_board',
    'Partner posted seat', 'Health', 'Time', array['Health'], array['Riyadh'], '${PARTNER}',
    'Partner Court', 'Terms', 'Narrative', array['Governance']
  );
  perform pg_temp.assume('${PARTNER}', 'aal1');
  v_payload := public.list_people_for_my_seat('c7777777-7777-4777-8777-777777777777');
  if v_payload::text like '%${SEEKER}%' or v_payload::text like '%${QUIET}%' or v_payload::text not like '%${APPLIED}%' then
    perform pg_temp.fail('partner poster saw a card that is not shown to partners ' || v_payload::text);
  end if;

  begin
    perform public.submit_member_board_seat(
      'adviser', 'Partner seat', 'Health', 'Time', array['Health'], array['Riyadh'],
      'Partner Court', 'Terms', 'Narrative', array['Governance']
    );
    perform pg_temp.fail('partner posted a seat');
  exception when sqlstate '42501' then
    null;
  end;

  perform pg_temp.assume('${SEEKER}', 'aal1');
  begin
    perform public.submit_member_board_seat(
      'ned', 'Bad skills', 'Health', 'Time', array['Health'], array['Riyadh'],
      'North Court', 'Terms', 'Narrative', array['Not a chip']
    );
    perform pg_temp.fail('bad skill was stored');
  exception when sqlstate '22023' then
    null;
  end;
  v_payload := public.submit_member_board_seat(
    'ned', 'Skills seat', 'Health', 'Time', array['Health'], array['Riyadh'],
    'North Court', 'Terms', 'Narrative', array['Governance']
  );
  v_id := (v_payload->>'id')::uuid;
  execute 'reset role';
  if not exists (select 1 from public.re_board_roles where id = v_id and skills_wanted = array['Governance'] and status = 'pending_review' and contact_email is null) then
    perform pg_temp.fail('skills were not stored');
  end if;

  perform pg_temp.assume('${SEEKER}', 'aal1');
  begin
    perform public.save_my_board_focus(true, '{}'::text[], array['GCC'], array['Governance']);
    perform pg_temp.fail('yes without a type was stored');
  exception when sqlstate '22023' then
    null;
  end;

  perform pg_temp.assume('${SEEKER}', 'aal1');
  begin
    perform public.list_people_for_my_seat('c3333333-3333-4333-8333-333333333333');
    perform pg_temp.fail('stranger listed people');
  exception when sqlstate 'P0002' then
    null;
  end;

  execute 'reset role';
  set role authenticated;
  begin
    perform 1 from public.seat_match_dismissals;
    perform pg_temp.fail('member read dismissals');
  exception when insufficient_privilege then
    null;
  end;
end
$checks$;
`

test('seat gates, signals, privacy, and the switch', () => {
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
