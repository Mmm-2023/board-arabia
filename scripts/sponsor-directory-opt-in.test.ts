import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { PRIVACY_EN } from '../src/content/legal/privacy.en.ts'
import { TERMS_EN } from '../src/content/legal/terms.en.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261207120000_sponsor_directory_opt_in.sql'
const migrationPath = path.join(migrationsDir, migrationName)

const privacyBefore =
  'Other members and sponsors. Signed-in members and sponsors can see directory profiles. Contact details are shared only with the two parties, and only after an intro is accepted. Members you add to a deal room can see what is shared there. Members can see mandate details once unlocked.'
const privacyAfter =
  "Other members and sponsors. Signed-in members can see directory profiles. A sponsor sees a member's card only if that member chooses to show it. Contact details are shared only with the two parties, and only after an intro is accepted. Members you add to a deal room can see what is shared there. Members can see mandate details once unlocked."
const termsBefore =
  'Member directory. Signed in members and sponsors can see member profiles. Profiles show the details described in the Privacy Notice. Email and phone details are not shown in the directory.'
const termsAfter =
  "Member directory. Signed in members can see member profiles. A sponsor sees a member's card only if that member chooses to show it. Profiles show the details described in the Privacy Notice. Email and phone details are not shown in the directory."
const partnersBefore =
  'A partner does not receive the directory and does not message members around our admin team.'
const partnersAfter =
  "A partner does not receive the directory. A sponsor sees a member's directory card only when that member chooses to show it. No partner or sponsor messages members around our admin team."

function clause(doc: { blocks: { id?: string; text?: string }[] }, id: string) {
  const block = doc.blocks.find((item) => item.id === id)
  assert.ok(block?.text, id)
  return block.text
}

function panel(View: (props: Record<string, unknown>) => unknown, showSponsors: boolean) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(View, {
        hidden: false,
        showSponsors,
        twoStepOn: false,
        analyticsOn: false,
        privacyContact: 'privacy@example.com',
        downloadState: 'idle',
        onHidden: () => undefined,
        onShowSponsors: () => undefined,
        onDownload: () => undefined,
      }),
    ),
  )
}

test('the sponsor card toggle is off unless the member turns it on', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
  const viewMod = await vite.ssrLoadModule('/src/components/privacy/PrivacyPanelView.tsx')
  const off = panel(viewMod.PrivacyPanelView, false)
  const on = panel(viewMod.PrivacyPanelView, true)
  assert.match(off, /Show my card to sponsors/)
  assert.match(off, /Sponsors cannot see your directory card\./)
  assert.match(off, /data-sponsor-card="off"/)
  assert.match(off, /aria-pressed="true"/)
  assert.match(off, /Off unless you turn it on\. A sponsor sees your directory card only when this is on and you are visible to members\./)
  assert.match(on, /Sponsors can see your directory card\./)
  assert.match(on, /data-sponsor-card="on"/)
  assert.match(off, /privacy@example\.com/)
  assert.equal(off.includes('\u2014'), false)
  assert.equal(on.includes('\u2014'), false)
  assert.equal(/nammco/i.test(off), false)
  assert.equal(off.includes('the desk'), false)
  } finally {
    await vite.close()
  }
})

test('opt-in definers set an empty search_path', () => {
  const migration = readFileSync(migrationPath, 'utf8')
  assert.equal(/search_path\s*=\s*public/i.test(migration), false)
  const headers = migration.split(/create or replace function /i).slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('as $$')))
  assert.equal(headers.length, 8)
  for (const header of headers) {
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }
})

test('legal copy says a sponsor sees a card only when the member chooses', () => {
  assert.equal(clause(PRIVACY_EN, 'c-5-1'), privacyAfter)
  assert.equal(clause(TERMS_EN, 'c-5-1'), termsAfter)
  assert.notEqual(clause(PRIVACY_EN, 'c-5-1'), privacyBefore)
  assert.notEqual(clause(TERMS_EN, 'c-5-1'), termsBefore)
  assert.equal(
    clause(PRIVACY_EN, 'c-3-10'),
    'Sponsors and payments. Sponsorship package, intro credits and other allowances used, invoices and payment records. We do not take card details on the public pages.',
  )
  assert.match(clause(PRIVACY_EN, 'c-1-1'), /\[BA ENTITY\], commercial registration number \[CR\]/)
  const partnersSource = readFileSync(path.join(root, 'src/pages/PartnersPage.tsx'), 'utf8')
  assert.equal(partnersSource.includes(partnersAfter), true)
  assert.equal(partnersSource.includes(partnersBefore), false)
  assert.equal(partnersSource.includes('\u2014'), false)
  assert.equal(/nammco/i.test(`${privacyAfter}\n${termsAfter}\n${partnersAfter}`), false)
  const migration = readFileSync(migrationPath, 'utf8')
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(migration), false)
  assert.match(migration, /show_card_to_sponsors boolean not null default false/)
  assert.match(migration, /where show_card_to_sponsors is null/)
  assert.match(migration, /revoke all \(show_card_to_sponsors\) on table public\.members from public, anon, authenticated/)
  assert.equal(/search_path\s*=\s*public/i.test(migration), false)
  assert.match(migration, /where user_id = auth\.uid\(\)/)
  assert.match(migration, /revoke all on function public\.set_show_card_to_sponsors\(boolean\) from public, anon/)
  assert.match(migration, /grant execute on function public\.set_show_card_to_sponsors\(boolean\) to authenticated/)
  assert.equal(/grant execute on function public\.set_show_card_to_sponsors\(boolean\) to anon/.test(migration), false)
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261204120000_sponsor_seat_sync.sql'))
})

test('sponsor directory opt-in holds in postgres', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-sponsor-opt-in-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_sponsor_optin_${process.pid}`
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
create or replace function pg_temp.card_ids(p jsonb, p_demo boolean)
returns text[]
language sql
as $fn$
  select coalesce(array_agg(item->>'id' order by item->>'id'), '{}'::text[])
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) item
  where coalesce((item->>'is_demo')::boolean, false) = p_demo
$fn$;

do $opt$
declare
  member_id uuid := gen_random_uuid();
  shown_id uuid := gen_random_uuid();
  private_id uuid := gen_random_uuid();
  hidden_id uuid := gen_random_uuid();
  sponsor_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  listed jsonb;
  member_ids text[];
  staff_ids text[];
  sponsor_ids text[];
  names text;
  flag boolean;
  year_n int;
  week_n int;
  seen int;
begin
  if has_column_privilege('anon', 'public.members', 'show_card_to_sponsors', 'SELECT')
     or has_column_privilege('anon', 'public.members', 'show_card_to_sponsors', 'UPDATE')
     or has_column_privilege('authenticated', 'public.members', 'show_card_to_sponsors', 'SELECT')
     or has_column_privilege('authenticated', 'public.members', 'show_card_to_sponsors', 'UPDATE') then
    raise exception 'show_card_to_sponsors is granted to a client';
  end if;
  if has_function_privilege('anon', 'public.set_show_card_to_sponsors(boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.list_directory()', 'EXECUTE')
     or has_function_privilege('public', 'public.set_show_card_to_sponsors(boolean)', 'EXECUTE') then
    raise exception 'anon or public can call the sponsor card setter or the directory';
  end if;
  if not has_function_privilege('authenticated', 'public.set_show_card_to_sponsors(boolean)', 'EXECUTE') then
    raise exception 'authenticated cannot call the setter';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in (
        'caller_sees_member_card',
        'set_show_card_to_sponsors',
        'own_directory_visibility',
        'list_directory',
        'search_deal_room_directory',
        'list_my_intro_suggestions',
        'list_my_intros',
        'request_member_intro'
      )
      and (
        not p.prosecdef
        or not ('search_path=""' = any (p.proconfig))
      )
  ) then
    raise exception 'a sponsor opt-in definer is missing an empty search_path';
  end if;

  insert into auth.users (id, email) values
    (member_id, 'member.optin@example.com'),
    (shown_id, 'shown.optin@example.com'),
    (private_id, 'private.optin@example.com'),
    (hidden_id, 'hidden.optin@example.com'),
    (sponsor_id, 'sponsor.optin@example.com'),
    (staff_id, 'staff.optin@example.com');
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.optin@example.com', 'staff');
  insert into public.members (user_id, email, seat, status, must_set_password, tiers)
  values
    (member_id, 'member.optin@example.com', 'ksa', 'active', false, array['member']::text[]),
    (shown_id, 'shown.optin@example.com', 'ksa', 'active', false, array['member']::text[]),
    (private_id, 'private.optin@example.com', 'intl', 'active', false, array['member']::text[]),
    (hidden_id, 'hidden.optin@example.com', 'ksa', 'active', false, array['member']::text[]),
    (sponsor_id, 'sponsor.optin@example.com', 'sponsor', 'active', false, array['member', 'sponsor']::text[]),
    (staff_id, 'staff.optin@example.com', 'ksa', 'active', false, array['member']::text[]);
  insert into public.profiles (user_id, full_name, headline, company, location) values
    (member_id, 'Open Member', 'Director', 'Example Co', 'Riyadh'),
    (shown_id, 'Shown Member', 'Director', 'Example Co', 'Jeddah'),
    (private_id, 'Private Member', 'Director', 'Example Co', 'London'),
    (hidden_id, 'Hidden Member', 'Director', 'Example Co', 'Dammam'),
    (sponsor_id, 'Sponsor Example', 'Partner', 'Example Co', 'Riyadh'),
    (staff_id, 'Staff Example', 'Admin', 'Example Co', 'Riyadh');

  if exists (
    select 1 from public.members m
    where m.user_id in (member_id, shown_id, private_id, hidden_id, sponsor_id, staff_id)
      and m.show_card_to_sponsors
  ) then
    raise exception 'new members were not backfilled to false';
  end if;

  update public.members set show_card_to_sponsors = true where user_id = shown_id;
  update public.members
  set show_card_to_sponsors = true, directory_hidden = true
  where user_id = hidden_id;

  insert into storage.objects (bucket_id, name) values
    ('member-avatars', shown_id::text || '/avatar'),
    ('member-avatars', private_id::text || '/avatar');

  select extract(isoyear from timezone('UTC', now()))::int,
         extract(week from timezone('UTC', now()))::int
    into year_n, week_n;
  insert into public.intro_suggestions (member_id, suggested_id, iso_year, iso_week, rank, reason)
  values
    (sponsor_id, shown_id, year_n, week_n, 1, 'A useful introduction'),
    (sponsor_id, private_id, year_n, week_n, 2, 'Another useful introduction'),
    (member_id, private_id, year_n, week_n, 1, 'A useful introduction');

  set role anon;
  begin
    perform public.list_directory();
    raise exception 'anon listed the directory';
  exception
    when insufficient_privilege then
      null;
  end;
  select count(*)::int into seen from storage.objects;
  if seen is distinct from 0 then
    raise exception 'anon saw avatar objects';
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  member_ids := pg_temp.card_ids(listed, false);
  if not (shown_id::text = any (member_ids) and private_id::text = any (member_ids) and sponsor_id::text = any (member_ids) and staff_id::text = any (member_ids) and member_id::text = any (member_ids)) then
    raise exception 'member directory changed: %', member_ids;
  end if;
  if hidden_id::text = any (member_ids) then
    raise exception 'member saw a hidden card';
  end if;
  if coalesce(pg_temp.card_ids(listed, true), '{}'::text[]) = '{}'::text[] then
    raise exception 'member lost sample cards';
  end if;
  names := public.search_deal_room_directory('Member')::text;
  if names not like '%' || shown_id::text || '%'
     or names not like '%' || private_id::text || '%'
     or names not like '%' || hidden_id::text || '%' then
    raise exception 'member search changed: %', names;
  end if;
  listed := public.list_my_intro_suggestions();
  if listed::text not like '%' || private_id::text || '%' then
    raise exception 'member lost a suggestion';
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set role authenticated;
  listed := public.list_directory();
  staff_ids := pg_temp.card_ids(listed, false);
  if staff_ids is distinct from member_ids then
    raise exception 'staff directory changed: % vs %', staff_ids, member_ids;
  end if;
  if coalesce(pg_temp.card_ids(listed, true), '{}'::text[]) = '{}'::text[] then
    raise exception 'staff lost sample cards';
  end if;
  select count(*)::int into seen
  from storage.objects
  where name = private_id::text || '/avatar';
  if seen is distinct from 1 then
    raise exception 'staff could not read an avatar';
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', sponsor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  sponsor_ids := pg_temp.card_ids(listed, false);
  if sponsor_ids is distinct from (
    select array_agg(x order by x) from unnest(array[shown_id::text, sponsor_id::text]) as x
  ) then
    raise exception 'sponsor saw the wrong cards: %', sponsor_ids;
  end if;
  if coalesce(pg_temp.card_ids(listed, true), '{}'::text[]) <> '{}'::text[] then
    raise exception 'sponsor saw sample cards';
  end if;
  names := public.search_deal_room_directory('Member')::text;
  if names not like '%' || shown_id::text || '%'
     or names like '%' || private_id::text || '%'
     or names like '%' || hidden_id::text || '%'
     or names like '%' || member_id::text || '%' then
    raise exception 'sponsor search leaked a card: %', names;
  end if;
  listed := public.list_my_intro_suggestions();
  if listed::text not like '%' || shown_id::text || '%' or listed::text like '%' || private_id::text || '%' then
    raise exception 'sponsor suggestions leaked: %', listed;
  end if;
  select count(*)::int into seen from storage.objects where name = shown_id::text || '/avatar';
  if seen is distinct from 1 then
    raise exception 'sponsor could not read an opted-in avatar';
  end if;
  select count(*)::int into seen from storage.objects where name = private_id::text || '/avatar';
  if seen is distinct from 0 then
    raise exception 'sponsor read a private avatar';
  end if;
  begin
    perform public.request_member_intro(private_id, 'A short note about a meeting', false);
    raise exception 'sponsor requested a private member';
  exception
    when others then
      if position('not_found' in sqlerrm) = 0 then
        raise;
      end if;
  end;
  if (public.request_member_intro(shown_id, 'A short note about a meeting', false) ->> 'status') is distinct from 'pending' then
    raise exception 'sponsor could not request an opted-in member';
  end if;
  if public.list_my_intros()::text not like '%Shown Member%' then
    raise exception 'sponsor lost an opted-in intro card';
  end if;

  set role postgres;
  insert into public.member_intros (requester_id, target_id, reason, status)
  values (member_id, sponsor_id, 'A short note about a meeting', 'pending');
  perform set_config('request.jwt.claims', json_build_object('sub', sponsor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  if public.list_my_intros()::text not like '%Open Member%' then
    raise exception 'sponsor lost an incoming intro';
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  perform public.set_show_card_to_sponsors(true);
  begin
    update public.members set show_card_to_sponsors = true where user_id = private_id;
  exception
    when insufficient_privilege then
      null;
  end;

  set role postgres;
  select m.show_card_to_sponsors into flag from public.members m where m.user_id = private_id;
  if flag then
    raise exception 'setter wrote another member row';
  end if;
  select m.show_card_to_sponsors into flag from public.members m where m.user_id = member_id;
  if flag is distinct from true then
    raise exception 'setter missed the caller row';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', sponsor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  sponsor_ids := pg_temp.card_ids(public.list_directory(), false);
  if sponsor_ids is distinct from (
    select array_agg(x order by x)
    from unnest(array[member_id::text, shown_id::text, sponsor_id::text]) as x
  ) then
    raise exception 'turning the card on did not show only that card: %', sponsor_ids;
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  perform public.set_show_card_to_sponsors(false);
  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', sponsor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  sponsor_ids := pg_temp.card_ids(public.list_directory(), false);
  if member_id::text = any (sponsor_ids) then
    raise exception 'turning the card off left it visible';
  end if;
  if sponsor_ids is distinct from (
    select array_agg(x order by x) from unnest(array[shown_id::text, sponsor_id::text]) as x
  ) then
    raise exception 'sponsor directory did not return to opted-in cards: %', sponsor_ids;
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  if pg_temp.card_ids(listed, false) is distinct from member_ids then
    raise exception 'member directory changed after the toggle: %', pg_temp.card_ids(listed, false);
  end if;
  set role postgres;
end
$opt$;
`
