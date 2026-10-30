import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { STAFF_DESTINATIONS, STAFF_SECONDARY, STAFF_SECTIONS, shellSectionTitle } from '../src/shell/destinations.ts'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'

const EXAMPLE_ID = '11111111-1111-4111-8111-111111111111'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const migrationName = '20270107120000_staff_list_profiles.sql'
const migrationPath = path.join(root, 'supabase/migrations', migrationName)

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function visible(html: string) {
  return html.replace(/\s(?:href|to|data-profile-name)="[^"]*"/g, '')
}

test('profiles route is a People section, not a new primary destination', () => {
  const sql = readFileSync(migrationPath, 'utf8')
  const names = readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const prior = '20270106120000_majlis_request_review.sql'
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf(prior))
  assert.equal(names.some((name) => name > prior && name < migrationName), false)
  assert.equal(/search_path\s*=\s*public/i.test(sql), false)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /private\.is_staff\(\)/)
  assert.equal(sql.includes('log_staff_access'), false)
  assert.equal(/grant execute on function public\.staff_list_profiles\(\) to anon/i.test(sql), false)
  assert.match(sql, /revoke all on function public\.staff_list_profiles\(\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_list_profiles\(\) to authenticated;/)
  assert.equal(/create table|create policy|to anon/i.test(sql), false)
  assert.equal(/'(email|phone|linkedin|calendar|capacity|turnover|bio)'/.test(sql), false)
  assert.equal(sql.includes('\u2014') || sql.includes('\u2013'), false)
  assert.equal(/\bthe desk\b/i.test(sql), false)
  assert.equal(read('scripts/definer-audit.test.ts').includes('staff_list_profiles'), false)
  assert.match(read('scripts/security-view-access.test.ts'), /staff_list_profiles/)
  assert.match(read('scripts/sec-c-grants.test.ts'), /staff_list_profiles/)

  const app = read('src/App.tsx')
  const people = app.slice(app.indexOf('path="people"'), app.indexOf('path="access"'))
  assert.match(people, /path="profiles" element=\{<AdminProfilesPage/)
  assert.match(read('scripts/shell-manifest.mjs'), /\['\/admin\/people\/profiles', 'admin'\]/)
  assert.equal(read('src/shell/destinations.ts').includes('/admin/people/profiles'), false)
  assert.deepEqual(
    STAFF_SECTIONS.people?.map((item) => [item.label, item.to]),
    [
      ['People', '/admin/people'],
      ['Intros', '/admin/people/intros'],
    ],
  )
  const sections = read('src/pages/admin/peopleSections.ts')
  assert.match(sections, /label: 'Profiles'/)
  assert.match(sections, /to: '\/admin\/people\/profiles'/)
  assert.match(read('src/pages/admin/PeopleLayout.tsx'), /peopleSections\(\)/)
  assert.equal(shellSectionTitle('/admin/people/profiles', STAFF_DESTINATIONS, STAFF_SECONDARY), 'People')
  assert.match(read('src/pages/admin/PeoplePage.tsx'), /member\.email/)
  assert.equal(read('src/pages/admin/PeoplePage.tsx').includes('staff_list_profiles'), false)
})

test('chips follow the PF-4 directory and weekly rows', async () => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const lib = (await vite.ssrLoadModule('/src/lib/adminProfileList.ts')) as {
      NAME_NOT_SET: string
      PROFILE_LIST_KEYS: readonly string[]
      adminProfileChips: (row: Record<string, unknown>) => { cardComplete: boolean; introsOn: boolean; seatMatchesOn: boolean | null }
      filterProfiles: (rows: Array<{ display_name: string }>, filters: { introsOff: boolean; cardIncomplete: boolean }) => Array<{ display_name: string }>
      parseProfileList: (data: unknown) => unknown
      profileCountLine: (rows: Array<{ introsOn: boolean }>) => string
      profileUpdatedLabel: (iso: string | null) => string
    }
    const fixtures = (await vite.ssrLoadModule('/scripts/smoke/admin-profiles-fixtures.ts')) as {
      PROFILE_FIXTURES: Array<Record<string, unknown> & { display_name: string; member_id: string }>
    }
    const rows = fixtures.PROFILE_FIXTURES
    const ready = {
      display_name: 'Example Member',
      has_photo: true,
      title: 'Chair',
      organisation: 'Example House',
      city_key: 'Riyadh',
      sector_count: 1,
      availability_set: true,
      board_seat_type: null,
      board_seat_where: null,
    }
    assert.deepEqual(lib.adminProfileChips(ready), { cardComplete: true, introsOn: true, seatMatchesOn: null })
    assert.equal(lib.adminProfileChips({ ...ready, has_photo: false }).cardComplete, false)
    assert.equal(lib.adminProfileChips({ ...ready, sector_count: 0 }).introsOn, false)
    assert.equal(lib.adminProfileChips({ ...ready, availability_set: false }).introsOn, false)
    assert.equal(lib.adminProfileChips({ ...ready, display_name: lib.NAME_NOT_SET }).cardComplete, false)
    assert.equal(lib.adminProfileChips({ ...ready, board_seat_type: '', board_seat_where: '' }).seatMatchesOn, false)
    assert.equal(lib.adminProfileChips({ ...ready, board_seat_type: 'Chair', board_seat_where: 'Riyadh' }).seatMatchesOn, true)
    assert.equal(lib.profileUpdatedLabel('2026-10-20T09:00:00.000Z'), '20 Oct 2026, 12:00 AST')
    assert.equal(lib.profileUpdatedLabel(null), 'Not updated')
    const counted = rows.map((row) => lib.adminProfileChips(row))
    assert.equal(lib.profileCountLine(counted), '4 members. 2 with intros off.')
    assert.deepEqual(
      lib.filterProfiles(rows, { introsOff: true, cardIncomplete: false }).map((row) => row.display_name),
      ['Noura Example', lib.NAME_NOT_SET],
    )
    assert.deepEqual(
      lib.filterProfiles(rows, { introsOff: false, cardIncomplete: true }).map((row) => row.display_name),
      ['Omar Example', lib.NAME_NOT_SET],
    )
    assert.equal(lib.parseProfileList(rows.map((row) => ({ ...row, email: 'person@example.com' }))), null)
    assert.equal(lib.parseProfileList(rows.map((row) => {
      const copy = { ...row }
      delete copy.member_id
      return copy
    })), null)
    const parsed = lib.parseProfileList(rows) as Array<{ member_id: string }> | null
    assert.deepEqual(parsed?.map((row) => row.member_id), rows.map((row) => row.member_id))
    assert.deepEqual([...lib.PROFILE_LIST_KEYS].sort(), [
      'availability_set',
      'board_seat_type',
      'board_seat_where',
      'city_key',
      'display_name',
      'has_photo',
      'help_with',
      'looking_for',
      'member_id',
      'open_request',
      'open_suggestion',
      'organisation',
      'profile_updated_at',
      'seat_label',
      'sector_count',
      'status',
      'theme_count',
      'title',
    ])
    const completeness = path.join(root, 'src/lib/profileCompleteness.ts')
    if (!existsSync(completeness)) return
    const mod = (await vite.ssrLoadModule('/src/lib/profileCompleteness.ts')) as {
      profileCompleteness: (input: {
        photo: boolean
        name: string
        title: string
        organisation: string
        city: string
        sectorCount: number
        availabilitySet: boolean
      }) => Array<{ id: string; done: boolean }>
    }
    const defined = mod.profileCompleteness({
      photo: true,
      name: 'Example Member',
      title: 'Chair',
      organisation: 'Example House',
      city: 'Riyadh',
      sectorCount: 1,
      availabilitySet: true,
    })
    assert.equal(defined.find((row) => row.id === 'directory')?.done, true)
    assert.equal(defined.find((row) => row.id === 'weekly')?.done, true)
    assert.equal(defined.some((row) => row.id === 'board'), false)
  } finally {
    await vite.close()
  }
})

test('profile list states hide contact fields and link to the member record', async () => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const layoutMod = (await vite.ssrLoadModule('/src/pages/admin/peopleSections.ts')) as {
      peopleSections: () => Array<{ label: string; to: string }>
    }
    assert.deepEqual(
      layoutMod.peopleSections().map((item) => [item.label, item.to]),
      [
        ['People', '/admin/people'],
        ['Profiles', '/admin/people/profiles'],
        ['Intros', '/admin/people/intros'],
      ],
    )
    const fixtures = (await vite.ssrLoadModule('/scripts/smoke/admin-profiles-fixtures.ts')) as {
      PROFILE_FIXTURES: unknown[]
    }
    const PROFILE_FIXTURES = fixtures.PROFILE_FIXTURES
    const loaded = (await vite.ssrLoadModule('/src/pages/admin/AdminProfilesPage.tsx')) as {
      AdminProfilesPage: (props: { preview?: { status: string; rows?: unknown[]; introsOff?: boolean } }) => ReturnType<typeof createElement>
    }
    const markup = (preview: { status: string; rows?: unknown[]; introsOff?: boolean }) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: ['/admin/people/profiles'] },
          createElement(loaded.AdminProfilesPage, { preview }),
        ),
      )

    const html = markup({ status: 'ready', rows: PROFILE_FIXTURES })
    const text = visible(html)
    assert.match(html, new RegExp(`href="/admin/people/member/${EXAMPLE_ID}"`))
    assert.equal(text.includes(EXAMPLE_ID), false)
    assert.equal(text.includes('@'), false)
    assert.equal(/\bsponsor\b/i.test(text), false)
    assert.equal(text.includes('Seat matches'), false)
    assert.match(text, /4 members\. 2 with intros off\./)
    assert.match(text, /Example Member/)
    assert.match(text, /Card complete/)
    assert.match(text, /Intros off/)
    assert.match(text, /20 Oct 2026, 12:00 AST/)
    assert.match(text, /Not updated/)
    assert.match(html, /min-h-12/)
    assert.equal(html.includes('\u2014') || html.includes('\u2013'), false)

    const filtered = visible(markup({ status: 'ready', rows: PROFILE_FIXTURES, introsOff: true }))
    assert.equal(filtered.includes('Example Member'), false)
    assert.match(filtered, /Noura Example/)
    assert.match(filtered, /aria-pressed="true"/)

    const empty = markup({ status: 'ready', rows: [] })
    assert.match(empty, /No members yet\. Admit from Applications\./)
    assert.match(empty, /href="\/admin\/applications"/)

    const error = markup({ status: 'error' })
    assert.match(error, /Could not load profiles\./)
    assert.match(error, /Retry/)

    const denied = markup({ status: 'denied' })
    assert.match(denied, /This list is for admin\./)

    const loading = markup({ status: 'loading' })
    assert.match(loading, /aria-label="Loading profiles"/)
  } finally {
    await vite.close()
  }
})

test('staff_list_profiles refuses anon and members and omits contact fields', { timeout: 120_000 }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-pf5-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_pf5_${process.pid}`
  writeFileSync(script, `${stubSql}\n\\i ${migrationPath}\n${assertSql}\n`)
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

function chromePath() {
  return (
    resolveChromePath()
    || (existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : null)
    || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : null)
    || (existsSync('/usr/bin/google-chrome-stable') ? '/usr/bin/google-chrome-stable' : null)
  )
}

async function warmSmoke(origin: string) {
  const seen = new Set<string>()
  async function walk(urlPath: string) {
    const clean = urlPath.split(/[?#]/)[0]
    if (!clean || seen.has(clean) || clean.startsWith('/@') || clean.includes('/node_modules/')) return
    seen.add(clean)
    const res = await fetch(`${origin}${urlPath}`)
    const text = await res.text()
    if (!res.ok) throw new Error(`smoke ${res.status} ${clean}\n${text.slice(0, 1600)}`)
    if (!/\.(tsx|ts|jsx|js|css|mjs|html)$/.test(clean)) return
    const specs = [...text.matchAll(/(?:from|import)\s*(?:\(\s*)?["']([^"']+)["']/g), ...text.matchAll(/src="([^"]+)"/g)].map((match) => match[1])
    for (const spec of specs) {
      if (spec.startsWith('/@') || spec.startsWith('http')) continue
      if (!spec.startsWith('/') && !spec.startsWith('.')) continue
      const next = spec.startsWith('.')
        ? new URL(spec, `http://local${clean.slice(0, clean.lastIndexOf('/') + 1)}`).pathname
        : spec.split(/[?#]/)[0]
      await walk(next)
    }
  }
  await walk('/admin-profiles.html')
}

async function shot(page: import('playwright-core').Page, width: number, file: string) {
  if (width === 390) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.setViewportSize({ width, height: Math.max(height, 844) })
    await page.screenshot({ path: file, fullPage: false })
    await page.setViewportSize({ width, height: 844 })
    return
  }
  await page.screenshot({ path: file, fullPage: true })
}

test('admin profiles shots at 1440 and 390', { timeout: 300_000 }, async (t) => {
  const chrome = chromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const shotDir = path.join(root, 'handoff/ba-pf-5-admin-profiles')
  mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    configFile: path.join(root, 'scripts/smoke/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const origin = `http://127.0.0.1:${port}`
  await warmSmoke(origin)
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.setDefaultTimeout(30_000)
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto(`${origin}/admin-profiles.html?view=before`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'Members' }).waitFor()
      assert.equal(await page.getByRole('link', { name: 'Profiles' }).count(), 0)
      const beforeText = await page.locator('body').innerText()
      assert.match(beforeText, /No members yet\. Admit from Applications\./)
      assert.equal(await page.locator('aside[aria-label="Primary"]').isVisible(), width === 1440)
      assert.equal(await page.locator('nav.shell-tab-bar').isVisible(), width === 390)
      await shot(page, width, path.join(shotDir, `people-${width}-before.png`))

      await page.goto(`${origin}/admin-profiles.html?view=list`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'Profiles' }).waitFor()
      await page.getByText('4 members. 2 with intros off.').waitFor()
      const nav = width === 1440 ? page.locator('aside[aria-label="Primary"]') : page.locator('nav.shell-tab-bar')
      assert.equal(await nav.getByRole('link', { name: 'People', exact: true }).getAttribute('href'), '/admin/people')
      assert.equal(
        await page.locator('nav[aria-label="People sections"]').getByRole('link', { name: 'Profiles' }).getAttribute('href'),
        '/admin/people/profiles',
      )
      assert.equal(await page.locator('header.shell-safe-top').count(), 1)
      assert.equal(await page.locator('nav.shell-tab-bar.shell-safe-bottom').count(), 1)
      const filter = await page.getByRole('button', { name: 'Intros off' }).boundingBox()
      assert.ok(filter && filter.height >= 48, JSON.stringify(filter))
      const listText = await page.locator('body').innerText()
      assert.equal(listText.includes('\u2014') || listText.includes('\u2013'), false)
      assert.equal(/\bsponsor\b/i.test(listText), false)
      assert.equal(/nammco/i.test(listText), false)
      assert.equal(/\b(price|priced|pricing)\b/i.test(listText), false)
      assert.equal(listText.includes('@'), false)
      assert.equal(listText.includes(EXAMPLE_ID), false)
      assert.equal(listText.includes('Seat matches'), false)
      assert.match(listText, /Card complete/)
      assert.match(listText, /Intros on/)
      if (pageErrors.length) throw new Error(pageErrors.join('\n'))
      await shot(page, width, path.join(shotDir, `profiles-${width}-after.png`))

      await page.getByRole('button', { name: 'Intros off' }).click()
      await page.getByText('Noura Example').waitFor()
      assert.equal(await page.getByText('Example Member').count(), 0)
      assert.match(await page.locator('[data-profile-count]').innerText(), /4 members\. 2 with intros off\./)
      await shot(page, width, path.join(shotDir, `profiles-intros-off-${width}.png`))

      await page.goto(`${origin}/admin-profiles.html?view=empty`, { waitUntil: 'domcontentloaded' })
      await page.getByText('No members yet. Admit from Applications.').waitFor()
      await shot(page, width, path.join(shotDir, `profiles-empty-${width}.png`))

      await page.goto(`${origin}/admin-profiles.html?view=list`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('link', { name: /Example Member/ }).click()
      await page.getByRole('heading', { name: 'Member record' }).waitFor()
      await page.getByText('This read is recorded in the access log.').waitFor()
      await page.getByText('Example Member').waitFor()
      const recordText = await page.locator('body').innerText()
      assert.equal(recordText.includes('@'), false)
      assert.equal(recordText.includes(EXAMPLE_ID), false)
      await shot(page, width, path.join(shotDir, `member-record-${width}.png`))
    }
  } finally {
    await browser.close()
    await vite.close()
  }
  for (const name of [
    'people-1440-before.png',
    'people-390-before.png',
    'profiles-1440-after.png',
    'profiles-390-after.png',
    'profiles-intros-off-1440.png',
    'profiles-intros-off-390.png',
    'profiles-empty-1440.png',
    'profiles-empty-390.png',
    'member-record-1440.png',
    'member-record-390.png',
  ]) {
    const file = path.join(shotDir, name)
    assert.equal(existsSync(file), true, name)
    assert.ok(statSync(file).size > 8_000, name)
  }
})

const stubSql = `
do $anon_role$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
exception
  when unique_violation or duplicate_object then null;
end
$anon_role$;
do $auth_role$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
exception
  when unique_violation or duplicate_object then null;
end
$auth_role$;
grant anon, authenticated to current_user;

create schema if not exists auth;
create schema if not exists private;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''), current_user)
$$;

create table public.members (
  user_id uuid primary key,
  email text not null,
  seat text not null,
  status text not null,
  is_demo boolean not null default false,
  anonymised_at timestamptz
);

create table public.profiles (
  user_id uuid primary key,
  full_name text,
  headline text,
  company text,
  city_key text,
  sector_tags text[],
  vision_themes text[],
  availability text,
  avatar_path text,
  updated_at timestamptz,
  phone text,
  linkedin_url text,
  bio text,
  calendar_url text,
  turnover_usd numeric
);

create table public.staff_users (
  user_id uuid primary key,
  email text not null,
  role text not null
);

alter table public.members enable row level security;
alter table public.members force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.staff_users enable row level security;
alter table public.staff_users force row level security;
revoke all on table public.members, public.profiles, public.staff_users from public, anon, authenticated;

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

create or replace function private.sample_subject(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.user_id = p_id
      and (
        m.is_demo
        or m.user_id = '66666666-6666-4666-8666-666666666666'::uuid
      )
  );
$$;

insert into public.staff_users (user_id, email, role) values
  ('10000000-0000-4000-8000-0000000000a1', 'staff@example.com', 'staff'),
  ('77777777-7777-4777-8777-777777777777', 'also.staff@example.com', 'staff');

insert into public.members (user_id, email, seat, status, is_demo, anonymised_at) values
  ('11111111-1111-4111-8111-111111111111', 'example.member@example.com', 'ksa', 'active', false, null),
  ('22222222-2222-4222-8222-222222222222', 'noura@example.com', 'intl', 'active', false, null),
  ('33333333-3333-4333-8333-333333333333', 'omar@example.com', 'ksa', 'suspended', false, null),
  ('44444444-4444-4444-8444-444444444444', 'invite@example.com', 'sponsor', 'invited', false, null),
  ('55555555-5555-4555-8555-555555555555', 'demo@example.com', 'ksa', 'active', true, null),
  ('66666666-6666-4666-8666-666666666666', 'sample@example.com', 'intl', 'active', false, null),
  ('77777777-7777-4777-8777-777777777777', 'staff.member@example.com', 'ksa', 'active', false, null),
  ('88888888-8888-4888-8888-888888888888', 'closed@example.com', 'ksa', 'suspended', false, now()),
  ('99999999-9999-4999-8999-999999999999', 'left@example.com', 'ksa', 'left', false, null);

insert into public.profiles (
  user_id, full_name, headline, company, city_key, sector_tags, vision_themes,
  availability, avatar_path, updated_at, phone, linkedin_url, bio, calendar_url, turnover_usd
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'Example Member', 'Chair', 'Example House', 'riyadh',
    array['Governance'], array['Tourism'],
    'open', 'avatars/example.png', '2026-10-20 09:00:00+00',
    '+966500000000', 'https://www.linkedin.com/in/example', 'secret bio', 'https://calendar.example/slot', 1000000
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Noura Example', 'Director', 'Example Capital', 'london',
    array['Banking'], '{}',
    null, 'avatars/noura.png', '2026-10-18 09:00:00+00',
    null, null, null, null, null
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Omar Example', 'Chair', 'Example Works', null,
    array['Legal'], '{}',
    'selective', null, '2026-10-15 09:00:00+00',
    null, null, null, null, null
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'Demo Person', 'Chair', 'Demo House', 'riyadh',
    array['Governance'], '{}', 'open', null, '2026-10-01 09:00:00+00',
    null, null, null, null, null
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'Sample Person', 'Chair', 'Sample House', 'riyadh',
    array['Governance'], '{}', 'open', null, '2026-10-01 09:00:00+00',
    null, null, null, null, null
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    'Staff Person', 'Chair', 'Staff House', 'riyadh',
    array['Governance'], '{}', 'open', null, '2026-10-01 09:00:00+00',
    null, null, null, null, null
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    'Closed Person', 'Chair', 'Closed House', 'riyadh',
    array['Governance'], '{}', 'open', null, '2026-10-01 09:00:00+00',
    null, null, null, null, null
  ),
  (
    '99999999-9999-4999-8999-999999999999',
    'Left Person', 'Chair', 'Left House', 'riyadh',
    array['Governance'], '{}', 'open', null, '2026-10-01 09:00:00+00',
    null, null, null, null, null
  );
`

const assertSql = `
do $checks$
declare
  listed jsonb;
  row jsonb;
  keys text[];
  expected text[] := array[
    'availability_set',
    'board_seat_type',
    'board_seat_where',
    'city_key',
    'display_name',
    'has_photo',
    'help_with',
    'looking_for',
    'member_id',
    'open_request',
    'open_suggestion',
    'organisation',
    'profile_updated_at',
    'seat_label',
    'sector_count',
    'status',
    'theme_count',
    'title'
  ];
  definer boolean;
  config text[];
begin
  select p.prosecdef, p.proconfig
    into definer, config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'staff_list_profiles';
  if definer is distinct from true then
    raise exception 'not security definer';
  end if;
  if config is null or not ('search_path=""' = any (config)) then
    raise exception 'search_path %', config;
  end if;
  if has_function_privilege('anon', 'public.staff_list_profiles()', 'execute') then
    raise exception 'anon can execute';
  end if;
  if not has_function_privilege('authenticated', 'public.staff_list_profiles()', 'execute') then
    raise exception 'authenticated cannot execute';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.staff_list_profiles();
    raise exception 'member listed profiles';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'member error: %', sqlerrm;
      end if;
  end;

  set role postgres;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-0000000000a1', 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  listed := public.staff_list_profiles();
  if jsonb_typeof(listed) is distinct from 'array' or jsonb_array_length(listed) is distinct from 4 then
    raise exception 'aal1 staff list %', listed;
  end if;

  set role postgres;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '10000000-0000-4000-8000-0000000000a1', 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  listed := public.staff_list_profiles();
  if jsonb_array_length(listed) is distinct from 4 then
    raise exception 'aal2 staff list %', listed;
  end if;
  if listed->0->>'display_name' is distinct from 'Example Member'
     or listed->1->>'display_name' is distinct from 'Noura Example'
     or listed->2->>'display_name' is distinct from 'Omar Example'
     or listed->3->>'display_name' is distinct from 'Name not set' then
    raise exception 'order %', listed;
  end if;
  if listed->0->>'seat_label' is distinct from 'Saudi Arabia'
     or listed->1->>'seat_label' is distinct from 'International'
     or listed->3->>'seat_label' is distinct from 'Partner'
     or listed->0->>'status' is distinct from 'active'
     or listed->2->>'status' is distinct from 'suspended'
     or listed->3->>'status' is distinct from 'invited' then
    raise exception 'labels %', listed;
  end if;
  if listed->0->>'has_photo' is distinct from 'true'
     or listed->0->>'title' is distinct from 'Chair'
     or listed->0->>'organisation' is distinct from 'Example House'
     or listed->0->>'city_key' is distinct from 'riyadh'
     or listed->0->>'sector_count' is distinct from '1'
     or listed->0->>'availability_set' is distinct from 'true'
     or listed->0->>'theme_count' is distinct from '1'
     or listed->1->>'availability_set' is distinct from 'false'
     or listed->2->>'has_photo' is distinct from 'false'
     or listed->2->>'city_key' is not null
     or listed->3->>'profile_updated_at' is not null then
    raise exception 'fields %', listed;
  end if;
  if not (listed->0 ? 'open_suggestion')
     or listed->0->>'open_suggestion' is not null
     or listed->0->>'open_request' is not null
     or listed->0->>'help_with' is not null
     or listed->0->>'looking_for' is not null
     or listed->0->>'board_seat_type' is not null
     or listed->0->>'board_seat_where' is not null then
    raise exception 'placeholders %', listed;
  end if;
  for row in select value from jsonb_array_elements(listed)
  loop
    select coalesce(array_agg(k order by k), '{}') into keys from jsonb_object_keys(row) as k;
    if keys is distinct from expected then
      raise exception 'keys %', keys;
    end if;
  end loop;
  if listed::text ilike '%example.com%'
     or listed::text ilike '%@%'
     or listed::text ilike '%secret bio%'
     or listed::text ilike '%+966%'
     or listed::text ilike '%linkedin%'
     or listed::text ilike '%calendar%'
     or listed::text ilike '%1000000%'
     or listed::text ilike '%Demo Person%'
     or listed::text ilike '%Sample Person%'
     or listed::text ilike '%Staff Person%'
     or listed::text ilike '%Closed Person%'
     or listed::text ilike '%Left Person%' then
    raise exception 'payload leaked %', listed;
  end if;

  set role anon;
  begin
    perform public.staff_list_profiles();
    raise exception 'anon listed profiles';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached the function body';
      end if;
  end;
  set role postgres;
end
$checks$;
`
