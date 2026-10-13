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
import { ABOUT_CONTACT_WARNING, ABOUT_HELPER, ABOUT_MAX, aboutHasContact, aboutLengthError } from '../src/lib/about.ts'
import {
  CITY_ALIASES,
  cityKeyFromLocation,
  mapStoredLocation,
  profileCityState,
  resolveProfileCity,
} from '../src/lib/cities.ts'
import { presentDirectoryCard } from '../src/lib/demoRows.ts'
import { EMPTY_DIRECTORY_FILTERS, directoryCityKey, filterDirectory } from '../src/lib/directoryFilters.ts'
import { SECTOR_TAGS } from '../src/lib/profileTags.ts'
import { emptyNewMandate } from '../src/lib/newMandate.ts'
import type { ChecklistInput } from '../supabase/functions/_shared/membership_steps.ts'
import { planIntroWeek, type PlanMember } from '../supabase/functions/_shared/suggest_intros.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationName = '20261210120000_sectors_city_about.sql'
const migrationPath = path.join(root, 'supabase/migrations', migrationName)

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function sectorList(sql: string) {
  const body = sql.split('function private.profile_sector_tags()')[1] ?? ''
  const array = body.split('as $$')[1]?.split('$$;')[0] ?? ''
  return [...array.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

function member(id: string, patch: Partial<PlanMember> = {}): PlanMember {
  return {
    id,
    email: `${id}@example.com`,
    status: 'active',
    seat: 'ksa',
    isDemo: false,
    fullName: id,
    sectorTags: [],
    visionThemes: [],
    region: '',
    cityKey: '',
    sample: false,
    directoryHidden: false,
    ...patch,
  }
}

function card(raw: Record<string, unknown>) {
  const parsed = presentDirectoryCard({
    id: 'a1000001-0000-4000-8000-000000000009',
    is_demo: false,
    full_name: 'Example Member',
    headline: 'Independent chair',
    company: 'Example House',
    location: 'Riyadh',
    sector: 'Real estate',
    sectors: ['Real estate'],
    seat: 'ksa',
    ...raw,
  })
  assert.ok(parsed)
  return parsed
}

const emptyChecklist: ChecklistInput = {
  emailVerified: true,
  role: '',
  boardSeats: '',
  companyName: '',
  jobTitle: '',
  companyWebsite: '',
  linkedinUrl: '',
  scaleKind: '',
  scaleBand: '',
  sectorTags: [],
  visionTags: [],
  statement: '',
  crNumber: '',
  crCountry: '',
  referralName: '',
  invited: false,
  investable: '',
  phone: '',
}

test('client sector list matches the database list, including Real estate', () => {
  const migration = readFileSync(migrationPath, 'utf8')
  assert.deepEqual(sectorList(migration), [...SECTOR_TAGS])
  assert.equal(SECTOR_TAGS.includes('Real estate'), true)
  assert.equal(SECTOR_TAGS.includes('Industrials and manufacturing'), true)
  assert.equal(SECTOR_TAGS.includes('Utilities and water'), true)
  assert.equal(SECTOR_TAGS.length, 16)
  const staff = read('supabase/migrations/20261206120000_staff_create_mandate.sql')
  assert.match(staff, /private\.profile_sector_tags\(\)/)
  assert.match(read('src/pages/dashboard/account/MembershipChecklistView.tsx'), /options=\{SECTOR_TAGS\}/)
  assert.match(read('src/pages/admin/NewMandateForm.tsx'), /options=\{SECTOR_TAGS\}/)
})

test('city mapping sends Riyadh variants to riyadh and keeps unknown text as other', () => {
  assert.equal(cityKeyFromLocation('  RIYADH, KSA'), 'riyadh')
  assert.equal(cityKeyFromLocation('riaydh'), 'riyadh')
  assert.equal(cityKeyFromLocation('Riyadh'), 'riyadh')
  assert.equal(cityKeyFromLocation('Al Khobar'), 'dammam_khobar')
  assert.equal(cityKeyFromLocation('al-khobar'), 'dammam_khobar')
  assert.equal(cityKeyFromLocation('khobar'), 'dammam_khobar')
  assert.equal(cityKeyFromLocation('dammam'), 'dammam_khobar')
  assert.equal(cityKeyFromLocation('Dammam and Khobar'), 'dammam_khobar')
  assert.equal(cityKeyFromLocation('   '), null)
  assert.equal(cityKeyFromLocation(null), null)
  const unknown = mapStoredLocation('  Oasis Town  ')
  assert.deepEqual(unknown, { city_key: 'other', location: 'Oasis Town' })
  assert.deepEqual(mapStoredLocation('al khobar, Eastern Province'), {
    city_key: 'dammam_khobar',
    location: 'Dammam and Khobar',
  })
  assert.deepEqual(profileCityState({ city_key: null, location: 'Abha' }), { key: 'other', other: 'Abha' })
  assert.deepEqual(profileCityState({ city_key: 'riyadh', location: 'Riyadh' }), { key: 'riyadh', other: '' })
  assert.equal(resolveProfileCity('other', '   ').ok, false)
  assert.deepEqual(resolveProfileCity('other', 'Abha'), { ok: true, city_key: 'other', location: 'Abha' })
  assert.deepEqual(resolveProfileCity('jeddah', ''), { ok: true, city_key: 'jeddah', location: 'Jeddah' })
  const migration = readFileSync(migrationPath, 'utf8')
  for (const [alias, key] of Object.entries(CITY_ALIASES)) {
    assert.match(migration, new RegExp(`when '${alias}' then '${key}'`), alias)
  }
})

test('about rejects 401 characters and warns on contact details without blocking', () => {
  assert.equal(aboutLengthError('a'.repeat(ABOUT_MAX)), '')
  assert.equal(aboutLengthError(` ${'a'.repeat(ABOUT_MAX)} `), '')
  assert.match(aboutLengthError('a'.repeat(401)), /400/)
  assert.equal(aboutHasContact('Board work across family holdings.'), false)
  assert.equal(aboutHasContact('Write to member@example.com'), true)
  assert.equal(aboutHasContact('Call +966 50 000 0000'), true)
  assert.equal(aboutHasContact('Room 12'), false)
  assert.equal(ABOUT_CONTACT_WARNING, 'Do not add contact details here.')
  assert.equal(ABOUT_HELPER, 'Shown on your expanded card and when you ask for an introduction.')
  const profile = read('src/pages/dashboard/ProfilePage.tsx')
  assert.match(profile, /ABOUT_CONTACT_WARNING/)
  assert.match(profile, /aboutLengthError\(bio\)/)
  assert.match(profile, /maxLength=\{ABOUT_MAX\}/)
  assert.equal(profile.includes('Short note'), false)
})

test('directory filter uses the city key, and the card keeps about as plain text', async () => {
  const riyadh = card({ id: 'a1000001-0000-4000-8000-000000000001', location: 'Riyadh, KSA' })
  const khobar = card({ id: 'a1000001-0000-4000-8000-000000000002', location: 'Khobar', full_name: 'Example Khobar' })
  const dammam = card({ id: 'a1000001-0000-4000-8000-000000000003', location: 'Dammam', full_name: 'Example Dammam' })
  const other = card({ id: 'a1000001-0000-4000-8000-000000000004', location: 'Abha', full_name: 'Example Abha' })
  const keyed = card({
    id: 'a1000001-0000-4000-8000-000000000005',
    location: 'Jeddah',
    city_key: 'riyadh',
    full_name: 'Example Key',
  })
  assert.equal(directoryCityKey(riyadh), 'riyadh')
  assert.equal(directoryCityKey(khobar), 'dammam_khobar')
  assert.equal(directoryCityKey(dammam), 'dammam_khobar')
  assert.equal(directoryCityKey(keyed), 'riyadh')
  const rows = [riyadh, khobar, dammam, other, keyed]
  assert.deepEqual(
    filterDirectory(rows, { ...EMPTY_DIRECTORY_FILTERS, city: 'dammam_khobar' }).map((item) => item.full_name),
    ['Example Khobar', 'Example Dammam'],
  )
  assert.deepEqual(
    filterDirectory(rows, { ...EMPTY_DIRECTORY_FILTERS, city: 'riyadh' }).map((item) => item.full_name).sort(),
    ['Example Key', 'Example Member'],
  )
  const withAbout = card({
    about: 'Example. <script>alert(1)</script>',
    email: 'member@example.com',
    phone: '+966500000000',
    turnover_usd: 10,
    investable_capacity_usd: 10,
  })
  assert.equal(withAbout.about, 'Example. <script>alert(1)</script>')
  const encoded = JSON.stringify(withAbout)
  assert.equal(encoded.includes('member@example.com'), false)
  assert.equal(encoded.includes('+966500000000'), false)
  assert.equal(encoded.includes('turnover'), false)
  assert.equal(encoded.includes('capacity'), false)
  const aboutMod = await loadClient()
  try {
    const html = renderToStaticMarkup(createElement(aboutMod.AboutText, { value: withAbout.about ?? '' }))
    assert.match(html, /Example\./)
    assert.match(html, /&lt;script&gt;/)
    assert.equal(html.includes('<script>'), false)
    assert.equal(renderToStaticMarkup(createElement(aboutMod.AboutText, { value: '   ' })), '')
  } finally {
    await aboutMod.close()
  }
})

test('same-city matching uses fixed keys and falls back to text for other', () => {
  const now = new Date('2026-09-30T12:00:00.000Z')
  const keyed = planIntroWeek({
    now,
    members: [
      member('amina', { region: 'North', cityKey: 'riyadh' }),
      member('layla', { region: 'South', cityKey: 'riyadh' }),
      member('noura', { region: 'Riyadh', cityKey: 'jeddah' }),
    ],
    intros: [],
    priorSuggestions: [],
    membersWithCurrentWeek: [],
  })
  const amina = keyed.suggestions.filter((row) => row.memberId === 'amina')
  assert.equal(amina.some((row) => row.suggestedId === 'layla' && row.reason === 'Both are in Riyadh.'), true)
  assert.equal(amina.some((row) => row.suggestedId === 'noura'), false)

  const other = planIntroWeek({
    now,
    members: [
      member('amina', { region: 'Abha', cityKey: 'other' }),
      member('layla', { region: 'abha', cityKey: 'other' }),
      member('noura', { region: 'Khobar', cityKey: 'other' }),
    ],
    intros: [],
    priorSuggestions: [],
    membersWithCurrentWeek: [],
  })
  const picks = other.suggestions.filter((row) => row.memberId === 'amina')
  assert.equal(picks.some((row) => row.suggestedId === 'layla' && row.reason === 'Both are in abha.'), true)
  assert.equal(picks.some((row) => row.suggestedId === 'noura'), false)
})

test('a fixed city matches other only when the location text is the same', () => {
  const now = new Date('2026-09-30T12:00:00.000Z')
  const plan = planIntroWeek({
    now,
    members: [
      member('amina', { region: 'Riyadh', cityKey: 'riyadh' }),
      member('layla', { region: 'Riyadh', cityKey: 'other' }),
      member('noura', { region: 'Abha', cityKey: 'other' }),
    ],
    intros: [],
    priorSuggestions: [],
    membersWithCurrentWeek: [],
  })
  const amina = plan.suggestions.filter((row) => row.memberId === 'amina')
  assert.equal(amina.some((row) => row.suggestedId === 'layla' && row.reason === 'Both are in Riyadh.'), true)
  assert.equal(amina.some((row) => row.suggestedId === 'noura'), false)
  const layla = plan.suggestions.filter((row) => row.memberId === 'layla')
  assert.equal(layla.some((row) => row.suggestedId === 'amina' && row.reason === 'Both are in Riyadh.'), true)
})

test('the checklist and the admin mandate form show the longer sector list', async () => {
  const client = await loadClient()
  const checklist = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(client.MembershipChecklistView, {
        model: {
          input: emptyChecklist,
          state: 'draft',
          submittedAt: null,
          declinedUntil: null,
          needsQuestion: '',
          needsItems: [],
          emailVerifiedAt: null,
        },
        mode: 'list',
        active: 'sectors',
        draft: emptyChecklist,
        saving: false,
        error: '',
        consent: false,
        submitting: false,
        onOpen: () => undefined,
        onDraft: () => undefined,
        onSave: () => undefined,
        onConsent: () => undefined,
        onSubmit: () => undefined,
        onReply: () => undefined,
        reply: '',
        onReplyChange: () => undefined,
      }),
    ),
  )
  assert.match(checklist, /Real estate/)
  assert.match(checklist, /Industrials and manufacturing/)
  assert.match(checklist, /Utilities and water/)
  const mandate = renderToStaticMarkup(
    createElement(client.NewMandateForm, {
      draft: emptyNewMandate(),
      field: '',
      message: '',
      notice: '',
      busy: false,
      onDraft: () => undefined,
      onSubmit: () => undefined,
    }),
  )
  assert.match(mandate, /Sector tags/)
  assert.match(mandate, /Real estate/)
  assert.match(mandate, /name="sector-tags"/)
  await client.close()
})

async function loadClient() {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const about = await vite.ssrLoadModule('/src/components/AboutText.tsx')
    const checklist = await vite.ssrLoadModule('/src/pages/dashboard/account/MembershipChecklistView.tsx')
    const mandate = await vite.ssrLoadModule('/src/pages/admin/NewMandateForm.tsx')
    const page = await vite.ssrLoadModule('/src/pages/dashboard/ProfilePage.tsx')
    const context = await vite.ssrLoadModule('/src/pages/dashboard/context.ts')
    return {
      AboutText: about.AboutText,
      MembershipChecklistView: checklist.MembershipChecklistView,
      NewMandateForm: mandate.NewMandateForm,
      ProfilePage: page.ProfilePage,
      MemberContext: context.MemberContext,
      close: () => vite.close(),
    }
  } catch (error) {
    await vite.close()
    throw error
  }
}

test('profile about warns when the text has an email or a phone', async () => {
  const client = await loadClient()
  try {
    const pageMod = { ProfilePage: client.ProfilePage }
    const contextMod = { MemberContext: client.MemberContext }
    const profile = {
      user_id: 'example-member',
      full_name: 'Example Member',
      headline: 'Independent chair',
      company: 'Example House',
      location: 'Abha',
      city_key: 'other',
      linkedin_url: '',
      bio: 'Write to member@example.com or +966 50 000 0000',
      phone: '',
      investable_capacity_usd: null,
      fo_aum_usd: null,
      turnover_usd: null,
      capacity_currency: null,
      include_in_public_aggregates: false,
      capacity_verified: false,
      avatar_path: null,
      avatar_style: 'male',
      availability: 'open',
      sector_tags: ['Real estate'],
      vision_themes: [],
    }
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          contextMod.MemberContext.Provider,
          {
            value: {
              userId: 'example-member',
              email: 'member@example.com',
              staffRole: null,
              member: {
                user_id: 'example-member',
                email: 'member@example.com',
                seat: 'ksa',
                status: 'active',
                must_set_password: false,
                invites_remaining: 0,
                invites_granted: 0,
              },
              profile,
              reload: async () => undefined,
            },
          },
          createElement(pageMod.ProfilePage),
        ),
      ),
    )
    assert.match(html, /Do not add contact details here\./)
    assert.match(html, /City name/)
    assert.match(html, /value="Abha"/)
    assert.match(html, /Real estate/)
    assert.match(html, /Shown on your expanded card and when you ask for an introduction\./)
    assert.equal(html.includes('\u2014'), false)
  } finally {
    await client.close()
  }
})

test('the pf3 migration bans search_path public and keeps directory rules', () => {
  const migration = readFileSync(migrationPath, 'utf8')
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.at(-1), migrationName)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261209120000_application_answers_at_admission.sql'))
  assert.equal(/search_path\s*=\s*public/i.test(migration), false)
  assert.match(migration, /set search_path = ''/)
  assert.match(migration, /check \(bio is null or pg_catalog\.char_length\(bio\) <= 400\)\s+not valid/i)
  assert.match(migration, /grant update \(location, city_key\)/)
  assert.match(migration, /before insert or update of location, city_key on public\.profiles/)
  assert.match(migration, /grant select \(city_key\)/)
  assert.match(migration, /coalesce\(m\.directory_hidden, false\) = false or m\.user_id = auth\.uid\(\)/)
  assert.match(migration, /private\.caller_sees_member_card\(m\.user_id\)/)
  assert.match(migration, /private\.is_sponsor\(auth\.uid\(\)\) and not private\.is_staff\(\)/)
  assert.match(migration, /'about', pg_catalog\.left\(coalesce\(p\.bio, ''\), 400\)/)
  assert.match(migration, /Example\. Independent chair across family holdings\./)
  assert.equal(migration.includes("'email'"), false)
  assert.equal(migration.includes("'phone'"), false)
  assert.equal(migration.includes('turnover'), false)
  assert.equal(migration.includes('capacity'), false)
  assert.equal(/grant\s+execute[^;]*\bto\s+anon\b/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  const directory = migration.split('function public.list_directory()')[1] ?? ''
  assert.match(directory, /set search_path = ''/)
  const edge = read('supabase/functions/suggest-intros/index.ts')
  assert.match(edge, /location, city_key/)
  assert.match(read('supabase/functions/_shared/suggest_intros.ts'), /isFixedCityKey/)
})

test('sectors, city keys, and about hold in postgres', { timeout: 300_000 }, () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(root, 'supabase/migrations', name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-pf3-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_pf3_${process.pid}`
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
do $pf3$
declare
  member_id uuid := gen_random_uuid();
  hidden_id uuid := gen_random_uuid();
  sponsor_id uuid := gen_random_uuid();
  listed jsonb;
  card jsonb;
  city text;
  place text;
begin
  if has_function_privilege('anon', 'private.city_key_from_location(text)', 'EXECUTE')
     or has_function_privilege('anon', 'private.city_label(text)', 'EXECUTE')
     or has_function_privilege('anon', 'private.profiles_set_city_key()', 'EXECUTE')
     or has_function_privilege('anon', 'public.list_directory()', 'EXECUTE')
     or has_function_privilege('public', 'private.city_key_from_location(text)', 'EXECUTE') then
    raise exception 'anon or public can call a city or directory function';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'city_key', 'SELECT')
     or has_column_privilege('anon', 'public.profiles', 'city_key', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.profiles', 'city_key', 'SELECT')
     or not has_column_privilege('authenticated', 'public.profiles', 'city_key', 'UPDATE') then
    raise exception 'city_key grants are wrong';
  end if;
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_bio_max_400'
      and convalidated
  ) then
    raise exception 'about check was validated during apply';
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_bio_max_400'
      and not convalidated
  ) then
    raise exception 'about check is missing';
  end if;
  if private.city_key_from_location('  RIYADH, KSA') is distinct from 'riyadh'
     or private.city_key_from_location('riaydh') is distinct from 'riyadh'
     or private.city_key_from_location('Al Khobar') is distinct from 'dammam_khobar'
     or private.city_key_from_location('al-khobar') is distinct from 'dammam_khobar'
     or private.city_key_from_location('khobar') is distinct from 'dammam_khobar'
     or private.city_key_from_location('dammam') is distinct from 'dammam_khobar'
     or private.city_key_from_location('Oasis Town') is distinct from 'other'
     or private.city_key_from_location('   ') is not null then
    raise exception 'city mapping failed';
  end if;

  insert into auth.users (id, email) values
    (member_id, 'member.pf3@example.com'),
    (hidden_id, 'hidden.pf3@example.com'),
    (sponsor_id, 'partner.pf3@example.com');
  insert into public.members (user_id, email, seat, status, must_set_password, tiers) values
    (member_id, 'member.pf3@example.com', 'ksa', 'active', false, array['member']::text[]),
    (hidden_id, 'hidden.pf3@example.com', 'ksa', 'active', false, array['member']::text[]),
    (sponsor_id, 'partner.pf3@example.com', 'sponsor', 'active', false, array['member', 'sponsor']::text[]);
  insert into public.profiles (user_id, full_name, headline, company, location, bio) values
    (member_id, 'Visible Member', 'Director', 'Example Co', 'Riyadh', 'Visible about line'),
    (hidden_id, 'Hidden Member', 'Director', 'Example Co', 'Dammam', 'Hidden about line that must stay private'),
    (sponsor_id, 'Partner Example', 'Partner', 'Example Co', 'Jeddah', null);
  update public.members set directory_hidden = true where user_id = hidden_id;

  select p.city_key, p.location into city, place
  from public.profiles p
  where p.user_id = member_id;
  if city is distinct from 'riyadh' or place is distinct from 'Riyadh' then
    raise exception 'riyadh was not stored: % %', city, place;
  end if;

  update public.profiles set location = '  khobar, east' where user_id = sponsor_id;
  select p.city_key, p.location into city, place from public.profiles p where p.user_id = sponsor_id;
  if city is distinct from 'dammam_khobar' or place is distinct from '  khobar, east' then
    raise exception 'khobar alias failed: % %', city, place;
  end if;

  update public.profiles set location = 'Oasis Town' where user_id = sponsor_id;
  select p.city_key, p.location into city, place from public.profiles p where p.user_id = sponsor_id;
  if city is distinct from 'other' or place is distinct from 'Oasis Town' then
    raise exception 'unknown city was not kept: % %', city, place;
  end if;

  update public.profiles set city_key = 'riyadh' where user_id = sponsor_id;
  select p.city_key, p.location into city, place from public.profiles p where p.user_id = sponsor_id;
  if city is distinct from 'other' or place is distinct from 'Oasis Town' then
    raise exception 'city_key write drifted from location: % %', city, place;
  end if;

  update public.profiles set sector_tags = array['Real estate']::text[] where user_id = member_id;

  begin
    update public.profiles set bio = repeat('a', 401) where user_id = member_id;
    raise exception '401 about was stored';
  exception
    when check_violation then
      if sqlerrm not like '%profiles_bio_max_400%' then
        raise exception 'unexpected about check: %', sqlerrm;
      end if;
  end;
  update public.profiles set bio = repeat('b', 400) where user_id = member_id;
  update public.profiles set bio = 'Visible about line' where user_id = member_id;

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  if listed::text like '%Hidden about line%' then
    raise exception 'hidden about leaked';
  end if;
  if listed::text not like '%Visible about line%' then
    raise exception 'visible about missing';
  end if;
  if listed::text not like '%Example. Independent chair across family holdings.%' then
    raise exception 'sample about missing';
  end if;
  select item into card
  from jsonb_array_elements(listed) item
  where item->>'full_name' = 'Visible Member';
  if card is null
     or card ? 'email'
     or card ? 'phone'
     or card ? 'bio'
     or card ? 'turnover'
     or card ? 'turnover_usd'
     or card ? 'capacity'
     or card ? 'investable_capacity_usd' then
    raise exception 'directory payload has a private key: %', card;
  end if;
  if card->>'about' is distinct from 'Visible about line' or card->>'city_key' is distinct from 'riyadh' then
    raise exception 'visible card fields: %', card;
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', sponsor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  if listed::text like '%Visible about line%' or listed::text like '%Hidden about line%' then
    raise exception 'partner saw about without opt-in: %', listed;
  end if;
  set role postgres;
  update public.members set show_card_to_sponsors = true where user_id = member_id;
  perform set_config('request.jwt.claims', json_build_object('sub', sponsor_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  if listed::text not like '%Visible about line%' then
    raise exception 'partner missed an opted-in about';
  end if;
  if listed::text like '%Hidden about line%' then
    raise exception 'partner saw a hidden about';
  end if;
  set role postgres;
end
$pf3$;
`
