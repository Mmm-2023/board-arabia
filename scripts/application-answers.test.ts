import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261209120000_application_answers_at_admission.sql'
const migrationPath = path.join(migrationsDir, migrationName)

test('application answers migration bans search_path public', () => {
  const migration = readFileSync(migrationPath, 'utf8')
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes(migrationName))
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261207120000_sponsor_directory_opt_in.sql'))
  assert.equal(/search_path\s*=\s*public/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(migration), false)
  assert.equal(/nammco/i.test(migration), false)
  assert.equal(migration.toLowerCase().includes('the desk'), false)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /force row level security/)
  assert.match(migration, /revoke all on table public\.member_application_answers from public, anon, authenticated, service_role/)
  assert.equal(/grant\s+(select|insert|update|delete|all)[^;]*member_application_answers/i.test(migration), false)
  assert.equal(/to anon/.test(migration), false)
  assert.match(migration, /grant execute on function public\.get_my_application_answers\(\) to authenticated/)
  assert.match(migration, /grant execute on function public\.dismiss_my_application_answer\(text\) to authenticated/)
  assert.match(migration, /when \(new\.kind = 'state_change' and \(new\.detail ->> 'to'\) = 'approved'\)/)
  assert.match(migration, /perform private\.carry_application_answers\(new\.candidate_user_id\)/)
  assert.match(migration, /function private\.purge_application_answers_on_anonymise\(\)/)
  assert.match(migration, /revoke all on function private\.purge_application_answers_on_anonymise\(\) from public, anon, authenticated/)
  assert.equal(/grant execute on function private\.purge_application_answers_on_anonymise/i.test(migration), false)
  assert.match(migration, /after update of anonymised_at on public\.members/)
  assert.match(migration, /when \(old\.anonymised_at is null and new\.anonymised_at is not null\)/)
  assert.equal(/create or replace function public\.transition_candidate/i.test(migration), false)

  const headers = migration.split(/create or replace function /i).slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('as $$')))
  assert.equal(headers.length, 5)
  for (const header of headers) {
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }

  const updates = migration.match(/update public\.profiles[\s\S]*?;/g) ?? []
  assert.equal(updates.length, 2)
  assert.match(updates[0], /set sector_tags = v_sectors/)
  assert.match(updates[1], /set vision_themes = v_themes/)
  for (const statement of updates) {
    assert.equal(/\blocation\b|\bbio\b|\bstatement\b|company_website|board_seats|\bregion\b/.test(statement), false)
  }
})

test('profile tag fixture shows the carried sectors and themes', () => {
  const fixture = readFileSync(path.join(root, 'scripts/smoke/application-answers-profile-main.tsx'), 'utf8')
  assert.match(fixture, /sector_tags: \['Energy transition', 'Health', 'Tourism'\]/)
  assert.match(fixture, /vision_themes: \['Thriving economy', 'Vibrant society', 'Renewable energy'\]/)
  assert.match(fixture, /location: null/)
  assert.match(fixture, /bio: null/)
  assert.match(fixture, /#profile-tags/)
  assert.equal(fixture.includes('\u2014'), false)
  assert.equal(fixture.includes('\u2013'), false)
  assert.equal(/nammco/i.test(fixture), false)
  assert.equal(fixture.toLowerCase().includes('the desk'), false)
  const emails = fixture.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
  assert.ok(emails.length > 0)
  for (const email of emails) assert.match(email, /@example\.com$/)
})

test('admission carries filtered tags and keeps private answers', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-pf2-answers-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_pf2_answers_${process.pid}`
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
do $answers$
declare
  one_id uuid;
  two_id uuid;
  three_id uuid;
  actor_id uuid;
  staff_id uuid;
  result jsonb;
  mine jsonb;
  sectors text[];
  themes text[];
  loc text;
  bio text;
  company text;
  headline text;
  linkedin text;
  region text;
  board text;
  statement text;
  website text;
  forced boolean;
  enabled boolean;
  answer_count int;
  config text[];
  definer boolean;
begin
  insert into auth.users (id, email) values
    (gen_random_uuid(), 'applicant.one@example.com'),
    (gen_random_uuid(), 'applicant.two@example.com'),
    (gen_random_uuid(), 'applicant.three@example.com'),
    (gen_random_uuid(), 'actor.review@example.com'),
    (gen_random_uuid(), 'staff.reader@example.com');
  select id into one_id from auth.users where email = 'applicant.one@example.com';
  select id into two_id from auth.users where email = 'applicant.two@example.com';
  select id into three_id from auth.users where email = 'applicant.three@example.com';
  select id into actor_id from auth.users where email = 'actor.review@example.com';
  select id into staff_id from auth.users where email = 'staff.reader@example.com';

  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.reader@example.com', 'staff');

  insert into public.candidates (
    user_id, email, full_name, role, region, request_state,
    company_name, job_title, linkedin_url, board_seats, company_website,
    sector_tags, vision_tags, statement, include_in_public_aggregates
  ) values (
    one_id,
    'applicant.one@example.com',
    'Example Applicant',
    'chairperson',
    'ksa_gcc',
    'in_review',
    'Example House',
    'Independent chair',
    'https://www.linkedin.com/in/example-applicant',
    'Two private company boards',
    'https://example.com',
    array['Energy transition', 'Not a sector', 'Health', 'Tourism', 'Logistics'],
    array['Not a theme', 'Thriving economy', 'Vibrant society', 'Renewable energy', 'Housing'],
    'I chair boards in energy and health.',
    false
  );

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  set role service_role;
  result := public.transition_candidate(
    one_id, actor_id, 'approved', 'fit', null, null, null, 'ksa', 'member', false
  );
  set role postgres;
  if result->>'status' is distinct from 'ok' then
    raise exception 'approve one failed: %', result;
  end if;

  select p.sector_tags, p.vision_themes, p.location, p.bio, p.company, p.headline, p.linkedin_url
    into sectors, themes, loc, bio, company, headline, linkedin
  from public.profiles p
  where p.user_id = one_id;
  if sectors is distinct from array['Energy transition', 'Health', 'Tourism']::text[] then
    raise exception 'filtered sectors: %', sectors;
  end if;
  if themes is distinct from array['Thriving economy', 'Vibrant society', 'Renewable energy']::text[] then
    raise exception 'filtered themes: %', themes;
  end if;
  if loc is not null or bio is not null then
    raise exception 'region or statement landed on the profile';
  end if;
  if company is distinct from 'Example House' or headline is distinct from 'Independent chair' then
    raise exception 'profile identity changed';
  end if;
  if linkedin is distinct from 'https://www.linkedin.com/in/example-applicant' then
    raise exception 'website replaced linkedin: %', linkedin;
  end if;

  select a.region, a.board_seats, a.statement, a.company_website
    into region, board, statement, website
  from public.member_application_answers a
  where a.member_id = one_id;
  if region is distinct from 'ksa_gcc'
     or board is distinct from 'Two private company boards'
     or statement is distinct from 'I chair boards in energy and health.'
     or website is distinct from 'https://example.com'
  then
    raise exception 'answers row: % % % %', region, board, statement, website;
  end if;

  update public.profiles
  set sector_tags = array['Mining']::text[],
      vision_themes = array['Housing']::text[]
  where user_id = one_id;
  update public.candidates
  set sector_tags = array['Health', 'Logistics']::text[],
      vision_tags = array['Tourism']::text[]
  where user_id = one_id;
  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values (one_id, 'state_change', jsonb_build_object('from', 'approved', 'to', 'approved'), actor_id);
  select p.sector_tags, p.vision_themes into sectors, themes
  from public.profiles p where p.user_id = one_id;
  if sectors is distinct from array['Mining']::text[] or themes is distinct from array['Housing']::text[] then
    raise exception 'existing tags overwritten: % %', sectors, themes;
  end if;

  update public.profiles set vision_themes = '{}'::text[] where user_id = one_id;
  update public.candidates
  set vision_tags = array['Not a theme', 'Tourism']::text[]
  where user_id = one_id;
  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values (one_id, 'state_change', jsonb_build_object('to', 'approved'), actor_id);
  select p.sector_tags, p.vision_themes into sectors, themes
  from public.profiles p where p.user_id = one_id;
  if sectors is distinct from array['Mining']::text[] or themes is distinct from array['Tourism']::text[] then
    raise exception 'partial copy failed: % %', sectors, themes;
  end if;

  update public.profiles set sector_tags = '{}'::text[] where user_id = one_id;
  update public.candidates
  set sector_tags = array['Health', 'Health', 'Mining', 'Food security', 'Digital infrastructure']::text[]
  where user_id = one_id;
  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values (one_id, 'state_change', jsonb_build_object('to', 'approved'), actor_id);
  select p.sector_tags, p.vision_themes, p.location, p.bio, p.linkedin_url
    into sectors, themes, loc, bio, linkedin
  from public.profiles p where p.user_id = one_id;
  if sectors is distinct from array['Health', 'Mining', 'Food security']::text[] then
    raise exception 'deduped sectors: %', sectors;
  end if;
  if themes is distinct from array['Tourism']::text[] then
    raise exception 'themes changed while copying sectors: %', themes;
  end if;
  if loc is not null or bio is not null or linkedin is distinct from 'https://www.linkedin.com/in/example-applicant' then
    raise exception 'later carry wrote profile text';
  end if;

  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values
    (one_id, 'state_change', jsonb_build_object('to', 'declined'), actor_id),
    (one_id, 'note', jsonb_build_object('to', 'approved'), actor_id);
  select p.sector_tags into sectors from public.profiles p where p.user_id = one_id;
  if sectors is distinct from array['Health', 'Mining', 'Food security']::text[] then
    raise exception 'non approval event changed tags: %', sectors;
  end if;

  insert into public.candidates (
    user_id, email, full_name, role, region, request_state, statement
  ) values (
    two_id,
    'applicant.two@example.com',
    'Example Second',
    'board_member',
    'intl',
    'submitted',
    'A second example statement.'
  );
  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values (two_id, 'state_change', jsonb_build_object('to', 'approved'), actor_id);
  if exists (select 1 from public.members m where m.user_id = two_id)
     or exists (select 1 from public.member_application_answers a where a.member_id = two_id)
  then
    raise exception 'approval event before admission created a member or answers';
  end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  set role service_role;
  result := public.transition_candidate(two_id, actor_id, 'in_review', null, null, null, null, null, null, false);
  set role postgres;
  if result->>'status' is distinct from 'ok' then
    raise exception 'in review failed: %', result;
  end if;
  if exists (select 1 from public.member_application_answers a where a.member_id = two_id)
     or exists (select 1 from public.profiles p where p.user_id = two_id)
  then
    raise exception 'in review carried answers';
  end if;

  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values
    (two_id, 'state_change', jsonb_build_object('to', 'declined'), actor_id),
    (two_id, 'note', jsonb_build_object('to', 'approved'), actor_id);
  if exists (select 1 from public.member_application_answers a where a.member_id = two_id) then
    raise exception 'non approval event carried answers';
  end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  set role service_role;
  result := public.transition_candidate(
    two_id, actor_id, 'approved', 'fit', null, null, null, 'intl', 'member', false
  );
  set role postgres;
  if result->>'status' is distinct from 'ok' then
    raise exception 'approve two failed: %', result;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', one_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  mine := public.get_my_application_answers();
  set role postgres;
  if mine->>'region' is distinct from 'ksa_gcc'
     or mine->>'board_seats' is distinct from 'Two private company boards'
     or mine->>'statement' is distinct from 'I chair boards in energy and health.'
     or mine->>'company_website' is distinct from 'https://example.com'
     or mine->>'copied_at' is null
  then
    raise exception 'own answers: %', mine;
  end if;
  if mine::text like '%second example%' then
    raise exception 'own answers included the other member';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', two_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  mine := public.get_my_application_answers();
  set role postgres;
  if mine->>'statement' is distinct from 'A second example statement.'
     or mine->>'region' is distinct from 'intl'
     or mine ? 'board_seats'
     or mine ? 'company_website'
  then
    raise exception 'other member answers: %', mine;
  end if;
  if mine::text like '%energy and health%' then
    raise exception 'other member saw the first answers';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', two_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  perform public.dismiss_my_application_answer('statement');
  set role postgres;
  if not exists (
    select 1 from public.member_application_answers a
    where a.member_id = one_id
      and a.statement = 'I chair boards in energy and health.'
  ) then
    raise exception 'dismiss changed another member';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', one_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  perform public.dismiss_my_application_answer('region');
  mine := public.get_my_application_answers();
  set role postgres;
  if mine ? 'region' or mine->>'statement' is distinct from 'I chair boards in energy and health.' then
    raise exception 'dismiss region failed: %', mine;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', one_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  perform public.dismiss_my_application_answer('board_seats');
  perform public.dismiss_my_application_answer('statement');
  perform public.dismiss_my_application_answer('company_website');
  mine := public.get_my_application_answers();
  set role postgres;
  if mine is not null then
    raise exception 'row remained after every field was reviewed: %', mine;
  end if;
  select count(*) into answer_count from public.member_application_answers where member_id = one_id;
  if answer_count <> 0 then
    raise exception 'answers row was not deleted';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', one_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.dismiss_my_application_answer('region');
    raise exception 'dismiss without a row was allowed';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'dismiss error: %', sqlerrm;
      end if;
  end;
  begin
    perform public.dismiss_my_application_answer('city');
    raise exception 'unknown field was allowed';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'unknown field error: %', sqlerrm;
      end if;
  end;
  set role postgres;

  insert into public.candidates (
    user_id, email, full_name, role, region, request_state,
    board_seats, statement, company_website, sector_tags, vision_tags
  ) values (
    three_id,
    'applicant.three@example.com',
    'Example Third',
    'c_suite',
    'ksa_gcc',
    'in_review',
    '   ',
    '  ',
    null,
    array['Nope']::text[],
    array['Nope']::text[]
  );
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  set role service_role;
  result := public.transition_candidate(
    three_id, actor_id, 'approved', 'fit', null, null, null, 'ksa', 'member', false
  );
  set role postgres;
  if result->>'status' is distinct from 'ok' then
    raise exception 'approve three failed: %', result;
  end if;
  select p.sector_tags, p.vision_themes, a.region, a.board_seats, a.statement, a.company_website
    into sectors, themes, region, board, statement, website
  from public.profiles p
  join public.member_application_answers a on a.member_id = p.user_id
  where p.user_id = three_id;
  if sectors is distinct from '{}'::text[] or themes is distinct from '{}'::text[] then
    raise exception 'disallowed tags copied: % %', sectors, themes;
  end if;
  if region is distinct from 'ksa_gcc' or board is not null or statement is not null or website is not null then
    raise exception 'blank answers stored: % % % %', region, board, statement, website;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', three_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  perform public.dismiss_my_application_answer('region');
  set role postgres;
  if exists (select 1 from public.member_application_answers a where a.member_id = three_id) then
    raise exception 'region only row was not deleted';
  end if;

  alter table public.candidates drop constraint candidates_region_check;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  update public.candidates
  set region = ' ',
      board_seats = ' ',
      statement = ' ',
      company_website = null
  where user_id = three_id;
  insert into public.candidate_events (candidate_user_id, kind, detail, actor_id)
  values (three_id, 'state_change', jsonb_build_object('to', 'approved'), actor_id);
  if exists (select 1 from public.member_application_answers a where a.member_id = three_id) then
    raise exception 'all empty answers created a row';
  end if;
  update public.candidates set region = 'ksa_gcc' where user_id = three_id;
  alter table public.candidates
    add constraint candidates_region_check check (region in ('ksa_gcc', 'intl'));

  if exists (select 1 from public.members m where m.user_id = staff_id)
     or exists (select 1 from public.profiles p where p.user_id = staff_id)
  then
    raise exception 'staff fixture has a member or profile row';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
    into enabled, forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'member_application_answers';
  if enabled is distinct from true or forced is distinct from true then
    raise exception 'row security not forced';
  end if;
  if exists (
    select 1 from pg_policy
    where polrelid = 'public.member_application_answers'::regclass
  ) then
    raise exception 'answers table has a policy';
  end if;
  if has_table_privilege('anon', 'public.member_application_answers', 'select')
     or has_table_privilege('anon', 'public.member_application_answers', 'insert')
     or has_table_privilege('anon', 'public.member_application_answers', 'update')
     or has_table_privilege('anon', 'public.member_application_answers', 'delete')
     or has_table_privilege('authenticated', 'public.member_application_answers', 'select')
     or has_table_privilege('authenticated', 'public.member_application_answers', 'insert')
     or has_table_privilege('authenticated', 'public.member_application_answers', 'update')
     or has_table_privilege('authenticated', 'public.member_application_answers', 'delete')
     or has_table_privilege('public', 'public.member_application_answers', 'select')
  then
    raise exception 'table grant leaked';
  end if;
  if has_function_privilege('anon', 'public.get_my_application_answers()', 'execute')
     or has_function_privilege('anon', 'public.dismiss_my_application_answer(text)', 'execute')
     or has_function_privilege('anon', 'private.carry_application_answers(uuid)', 'execute')
     or has_function_privilege('anon', 'private.tg_carry_application_answers()', 'execute')
     or has_function_privilege('anon', 'private.purge_application_answers_on_anonymise()', 'execute')
  then
    raise exception 'anon can execute an answers function';
  end if;

  select p.proconfig, p.prosecdef
    into config, definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'carry_application_answers';
  if definer is distinct from true
     or not exists (
       select 1 from unnest(config) as item
       where item like 'search_path=%' and item not like '%public%'
     )
  then
    raise exception 'carry search path: %', config;
  end if;

  set role anon;
  begin
    perform 1 from public.member_application_answers;
    raise exception 'anon read the answers table';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached a function body';
      end if;
  end;
  begin
    perform public.get_my_application_answers();
    raise exception 'anon called get_my_application_answers';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached get_my';
      end if;
  end;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', two_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform 1 from public.member_application_answers;
    raise exception 'another member read the answers table';
  exception
    when insufficient_privilege then
      null;
  end;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform 1 from public.member_application_answers;
    raise exception 'aal1 staff read the answers table';
  exception
    when insufficient_privilege then
      null;
  end;
  mine := public.get_my_application_answers();
  if mine is not null then
    raise exception 'aal1 staff received answers: %', mine;
  end if;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform 1 from public.member_application_answers;
    raise exception 'aal2 staff read the answers table';
  exception
    when insufficient_privilege then
      null;
  end;
  mine := public.get_my_application_answers();
  if mine is not null then
    raise exception 'aal2 staff received answers: %', mine;
  end if;
  set role postgres;

  insert into public.member_application_answers (member_id, region, statement)
  values
    (one_id, 'ksa_gcc', 'Kept until anonymised.'),
    (two_id, 'intl', 'Stays with the other member.')
  on conflict (member_id) do update
  set region = excluded.region,
      statement = excluded.statement;

  update public.members
  set directory_hidden = true
  where user_id = one_id
    and anonymised_at is null;
  if not exists (select 1 from public.member_application_answers where member_id = one_id)
     or not exists (select 1 from public.member_application_answers where member_id = two_id)
  then
    raise exception 'a non anonymise update deleted answers';
  end if;

  update public.members
  set anonymised_at = pg_catalog.now()
  where user_id = one_id;
  if exists (select 1 from public.member_application_answers where member_id = one_id) then
    raise exception 'anonymised member kept answers';
  end if;
  if not exists (
    select 1 from public.member_application_answers a
    where a.member_id = two_id
      and a.statement = 'Stays with the other member.'
  ) then
    raise exception 'other member answers were deleted';
  end if;

  update public.members
  set anonymised_at = pg_catalog.now()
  where user_id = one_id;
  if exists (select 1 from public.member_application_answers where member_id = one_id) then
    raise exception 'second anonymise stamp recreated answers';
  end if;
  if not exists (
    select 1 from public.member_application_answers a
    where a.member_id = two_id
      and a.statement = 'Stays with the other member.'
  ) then
    raise exception 'second anonymise stamp deleted the other member';
  end if;

  select p.proconfig, p.prosecdef
    into config, definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'purge_application_answers_on_anonymise';
  if definer is distinct from true
     or not exists (
       select 1 from unnest(config) as item
       where item like 'search_path=%' and item not like '%public%'
     )
  then
    raise exception 'purge search path: %', config;
  end if;
end
$answers$;
`
