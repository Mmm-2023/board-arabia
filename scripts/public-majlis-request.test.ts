import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { resolveChromePath, CHROME_SKIP } from './chrome-path.ts'
import {
  internationalPhone,
  optionalLinkedIn,
  placeLabel,
  presentPublicMajlis,
  publicMajlisReply,
  validatePublicMajlis,
} from '../src/lib/publicMajlis.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function chromePath() {
  return (
    resolveChromePath()
    || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : null)
    || (existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : null)
  )
}

test('public majlis routes stay off the locked apply line', () => {
  const app = read('src/App.tsx')
  const applyLine = app.split('\n').find((line) => line.includes('path="/apply"'))
  assert.match(applyLine || '', /path="\/apply" element=\{<ApplyPage/)
  assert.match(app, /path="\/majlis" element=\{<PublicMajlisPage/)
  assert.match(app, /path="\/majlis\/:eventId" element=\{<PublicMajlisPage/)
  assert.match(read('src/pages/ForMembersPage.tsx'), /data-public-majlis-cta="true"/)
  assert.match(read('src/pages/ForMembersPage.tsx'), /to=\{publicHref\('\/majlis'\)\}/)
})

test('the public page reuses signup and the existing request function', () => {
  const page = read('src/pages/PublicMajlisPage.tsx')
  const draft = read('src/lib/publicMajlisDraft.ts')
  assert.match(page, /registerCandidate\(/)
  assert.match(page, /submit_own_majlis_application/)
  assert.match(draft, /submit_own_majlis_application/)
  assert.match(read('src/pages/VerifyPage.tsx'), /flushPublicMajlisDraft/)
  assert.equal(page.includes('meet.'), false)
  assert.equal(/\bsponsor/i.test(page), false)
  assert.equal(page.includes('\u2014'), false)
  assert.equal(/nammco/i.test(page), false)
  assert.equal(/\$\d|SAR \d|Pricing/.test(page), false)
  assert.match(page, /legalField\('contactEmail'\)/)
  assert.match(page, /LEGAL CHANGE/)
  assert.match(page, /I agree to the <Link to=\{publicHref\('\/terms'\)\} className="underline">Terms<\/Link> and have read the <Link to=\{publicHref\('\/privacy'\)\} className="underline">Privacy Notice<\/Link>/)
  assert.match(page, /check it fits the majlis/)
  assert.match(page, /legalField\('contactEmail'\)/)
  assert.equal(page.includes('contact@'), false)
  assert.match(read('src/content/legal/privacy.en.ts'), /work email, company, role and phone number/)
  assert.match(read('src/content/legal/privacy.en.ts'), /\[CONTACT EMAIL\]/)
  assert.equal(read('src/content/legal/privacy.en.ts').includes('contact@'), false)
  assert.equal((page.match(/type="checkbox"/g) || []).length, 1)
  assert.match(page, /newsletter opt-in is not part of this form/)
  assert.equal(page.includes('name="newsletter"'), false)
  assert.match(page, /TurnstileField/)
  assert.equal(publicMajlisReply(), 'Thanks, we have your request.')
})

test('phone accepts Saudi Arabia and the United Kingdom and drops counts', () => {
  assert.equal(internationalPhone('+966501234567'), '+966501234567')
  assert.equal(internationalPhone('+966 50 123 4567'), '+966501234567')
  assert.equal(internationalPhone('+44 7911 123456'), '+447911123456')
  assert.equal(internationalPhone('+442079460958'), '+442079460958')
  assert.equal(internationalPhone('0501234567'), null)
  assert.equal(internationalPhone('966501234567'), null)
  assert.equal(optionalLinkedIn(''), '')
  assert.equal(optionalLinkedIn('https://www.linkedin.com/in/example'), 'https://www.linkedin.com/in/example')
  const room = `https://meet.${'google'}.com/abc-defg-hij`
  assert.equal(optionalLinkedIn(room), null)

  const rows = presentPublicMajlis([
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Capital allocation',
      description: `A virtual session. ${room} ada@example.com`,
      region: 'Riyadh',
      focus_tags: ['Capital'],
      starts_at: '2026-11-12T15:00:00.000Z',
      ends_at: '2026-11-12T16:30:00.000Z',
      place: 'few',
      capacity: 149,
      google_meet_url: room,
      email: 'ada@example.com',
    },
  ])
  assert.equal(rows.length, 1)
  const packed = JSON.stringify(rows)
  assert.equal(packed.includes('meet.'), false)
  assert.equal(packed.includes('@'), false)
  assert.equal(packed.includes('149'), false)
  assert.equal(rows[0]?.place, 'few')
  assert.equal(placeLabel('few'), 'Few places left')
  assert.equal(placeLabel('full'), 'Full, join the waitlist')
  assert.equal(placeLabel('open'), 'Open')
  assert.equal(placeLabel('12'), 'Open')

  const valid = validatePublicMajlis({
    fullName: 'Ada Example',
    email: 'ada@example.com',
    company: 'Example Holdings',
    role: 'chairperson',
    phone: '+966 50 123 4567',
    linkedin: '',
    why: '',
    consent: true,
    region: 'ksa_gcc',
    signedIn: false,
  })
  assert.equal(valid.ok, true)
  if (valid.ok) {
    assert.equal(valid.snapshot.phone, '+966501234567')
    assert.equal(JSON.stringify(valid.snapshot).includes('@'), false)
  }
  const missing = validatePublicMajlis({
    fullName: 'Ada Example',
    email: 'ada@example.com',
    company: 'Example Holdings',
    role: 'chairperson',
    phone: '050',
    linkedin: '',
    why: '',
    consent: true,
    region: 'ksa_gcc',
    signedIn: false,
  })
  assert.equal(missing.ok, false)
})

test('public majlis migration is slot 20270104120000 and does not send', () => {
  const slots = readdirSync(path.join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql'))
  assert.equal(slots.filter((file) => file.startsWith('20270104')).length, 1)
  const sql = read('supabase/migrations/20270104120000_public_majlis_request.sql')
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('aal2'), false)
  assert.equal(/cron|pg_cron|schedule/i.test(sql.replace('No schedule', '')), false)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /security definer/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /grant execute on function public\.list_public_majlis\(\) to anon, authenticated/)
  assert.match(sql, /revoke all on function public\.submit_own_majlis_application\(uuid, jsonb, text\) from public, anon/)
  assert.match(sql, /grant execute on function public\.submit_own_majlis_application\(uuid, jsonb, text\) to authenticated/)
  assert.equal(sql.includes('google_meet_url'), false)
  assert.equal(sql.includes('venue_address'), false)
  assert.match(sql, /e\.status = 'published'/)
  assert.match(sql, /e\.format = 'virtual'/)
  assert.match(sql, /e\.ends_at > pg_catalog\.now\(\)/)
  assert.match(sql, /private\.public_majlis_phone/)
  assert.match(sql, /private\.public_majlis_request_open/)
  assert.match(sql, /coalesce\(p_rsvp_opens_at, p_approved_at\)/)
  assert.match(sql, /p_approved_at \+ interval '48 hours'/)
  assert.equal(sql.split('private.public_majlis_request_open(').length, 6)
  assert.match(sql, /Does not send mail/)
  assert.equal(sql.includes('master_enabled'), false)
})

test('public requests wait until member RSVP is open and the founding window has passed', { timeout: 120000 }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-public-majlis-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_public_majlis_${process.pid}`
  const migration = path.join(root, 'supabase/migrations/20270104120000_public_majlis_request.sql')
  const user = '11111111-1111-4111-8111-111111111111'
  const before = '20000000-0000-4000-8000-000000000001'
  const window = '20000000-0000-4000-8000-000000000002'
  const ready = '20000000-0000-4000-8000-000000000003'
  const ended = '20000000-0000-4000-8000-000000000004'
  const draft = '20000000-0000-4000-8000-000000000005'
  const cancelled = '20000000-0000-4000-8000-000000000006'
  const room = '20000000-0000-4000-8000-000000000007'
  writeFileSync(script, `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$roles$;

create schema if not exists auth;
create schema if not exists private;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create table public.majlis_events (
  id uuid primary key,
  title text,
  description text,
  region text,
  focus_tags text[],
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  format text,
  cancelled_at timestamptz,
  capacity int,
  rsvp_opens_at timestamptz,
  founding_priority_ends_at timestamptz,
  approved_at timestamptz
);
create table public.majlis_rsvps (event_id uuid, status text);
create table public.majlis_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  status text not null default 'received',
  form_snapshot jsonb not null default '{}'::jsonb,
  consent_version text,
  verified_at timestamptz,
  submitted_at timestamptz,
  seat_held boolean not null default false,
  unique (event_id, user_id)
);
create table public.candidates (user_id uuid primary key, email_verified_at timestamptz);
create table public.register_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  hit_count int not null default 0
);
\\i ${migration}

insert into public.candidates (user_id) values ('${user}');
insert into public.majlis_events (
  id, title, description, region, focus_tags, starts_at, ends_at, status, format, capacity,
  rsvp_opens_at, founding_priority_ends_at
) values
  ('${before}', 'Before open', 'A session', 'Riyadh', array['Capital'], now() + interval '3 days', now() + interval '4 days', 'published', 'virtual', 20, now() + interval '2 days', now() - interval '1 day'),
  ('${window}', 'Founding window', 'A session', 'Riyadh', array['Capital'], now() + interval '3 days', now() + interval '4 days', 'published', 'virtual', 20, now() - interval '1 day', now() + interval '1 day'),
  ('${ready}', 'Open request', 'A session', 'Riyadh', array['Capital'], now() + interval '3 days', now() + interval '4 days', 'published', 'virtual', 20, now() - interval '2 days', now() - interval '1 day'),
  ('${ended}', 'Ended', 'A session', 'Riyadh', array['Capital'], now() - interval '2 days', now() - interval '1 hour', 'published', 'virtual', 20, now() - interval '3 days', now() - interval '2 days'),
  ('${draft}', 'Draft', 'A session', 'Riyadh', array['Capital'], now() + interval '3 days', now() + interval '4 days', 'pending_approval', 'virtual', 20, now() - interval '2 days', now() - interval '1 day'),
  ('${cancelled}', 'Cancelled', 'A session', 'Riyadh', array['Capital'], now() + interval '3 days', now() + interval '4 days', 'published', 'virtual', 20, now() - interval '2 days', now() - interval '1 day'),
  ('${room}', 'In person', 'A session', 'Riyadh', array['Capital'], now() + interval '3 days', now() + interval '4 days', 'published', 'in_person', 20, now() - interval '2 days', now() - interval '1 day');
update public.majlis_events set cancelled_at = now() where id = '${cancelled}';

do $checks$
declare
  listed jsonb := public.list_public_majlis();
  reply jsonb;
  n int;
  snap jsonb := '{"full_name":"Ada Example","phone":"+966501234567","company":"Example Holdings","role":"Chairperson","linkedin":"","why":""}'::jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '${user}')::text, true);

  if listed @> jsonb_build_array(jsonb_build_object('id', '${before}')) then
    raise exception 'before rsvp open was listed';
  end if;
  reply := public.submit_own_majlis_application('${before}', snap, 'public-majlis-2026-10');
  if reply <> '{"ok":true,"error_code":""}'::jsonb then
    raise exception 'before rsvp open reply %', reply;
  end if;
  select count(*) into n from public.majlis_applications where event_id = '${before}';
  if n <> 0 then raise exception 'before rsvp open stored a row'; end if;

  if listed @> jsonb_build_array(jsonb_build_object('id', '${window}')) then
    raise exception 'founding window was listed';
  end if;
  reply := public.submit_own_majlis_application('${window}', snap, 'public-majlis-2026-10');
  if reply <> '{"ok":true,"error_code":""}'::jsonb then
    raise exception 'founding window reply %', reply;
  end if;
  select count(*) into n from public.majlis_applications where event_id = '${window}';
  if n <> 0 then raise exception 'founding window stored a row'; end if;

  if not (listed @> jsonb_build_array(jsonb_build_object('id', '${ready}'))) then
    raise exception 'open event was missing: %', listed;
  end if;
  reply := public.submit_own_majlis_application('${ready}', snap, 'public-majlis-2026-10');
  if reply <> '{"ok":true,"error_code":""}'::jsonb then
    raise exception 'open event reply %', reply;
  end if;
  select count(*) into n from public.majlis_applications where event_id = '${ready}' and status = 'received';
  if n <> 1 then raise exception 'open event was not stored'; end if;

  if listed @> jsonb_build_array(jsonb_build_object('id', '${ended}'))
    or listed @> jsonb_build_array(jsonb_build_object('id', '${draft}'))
    or listed @> jsonb_build_array(jsonb_build_object('id', '${cancelled}'))
    or listed @> jsonb_build_array(jsonb_build_object('id', '${room}')) then
    raise exception 'closed event was listed: %', listed;
  end if;
  reply := public.submit_own_majlis_application('${ended}', snap, 'public-majlis-2026-10');
  if reply <> '{"ok":true,"error_code":""}'::jsonb then
    raise exception 'ended reply %', reply;
  end if;
  select count(*) into n from public.majlis_applications where event_id = '${ended}';
  if n <> 0 then raise exception 'ended event stored a row'; end if;
end
$checks$;
`)
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
    try {
      execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    } catch {
      // The database was not created.
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

const FIXTURE = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Capital allocation',
    description: 'How boards set capital priorities.',
    region: 'Riyadh',
    focus_tags: ['Capital', 'Governance'],
    starts_at: '2026-11-12T15:00:00.000Z',
    ends_at: '2026-11-12T16:30:00.000Z',
    place: 'open',
  },
]

test('public majlis shots at 1440 and 390', { timeout: 240000 }, async (t) => {
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const shotDir = path.join(root, 'handoff/ba-mj-3b-1-public-majlis')
  mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const origin = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage()
    await page.route('**/*example.supabase.co/**', async (route) => {
      const url = route.request().url()
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': '*',
          },
        })
        return
      }
      if (url.includes('/rest/v1/rpc/list_public_majlis')) {
        await route.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
          body: JSON.stringify(FIXTURE),
        })
        return
      }
      if (url.includes('/functions/v1/register-candidate')) {
        await route.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
          body: JSON.stringify({ ok: true, error_code: '' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: '{}',
      })
    })

    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 1400 : 1200 })
      await page.goto(`${origin}/for-members`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('link', { name: 'Request a place at a virtual majlis' }).click()
      await page.getByRole('heading', { name: 'Capital allocation' }).waitFor()
      await page.evaluate(() => window.scrollTo(0, 0))
      const destination = await page.locator('body').innerText()
      assert.equal(destination.includes('meet.'), false)
      assert.equal(/\bsponsor\b/i.test(destination), false)
      assert.equal(destination.includes('\u2014'), false)
      assert.match(destination, /powered by nammco/)
      assert.equal(/nammco/i.test(destination.replaceAll('powered by nammco', '')), false)
      assert.equal(destination.includes('149'), false)
      if (width === 1440) {
        await page.screenshot({ path: path.join(shotDir, 'public-cta-destination-1440.png') })
      }
      await page.screenshot({ path: path.join(shotDir, `public-majlis-${width}.png`) })
      await page.getByRole('link', { name: 'Request a place' }).click()
      await page.getByLabel('Phone').waitFor()
      await page.getByText('have read the Privacy Notice').waitFor()
      await page.getByText('check it fits the majlis').waitFor()
      await page.setViewportSize({ width, height: width === 390 ? 2500 : 2000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: path.join(shotDir, `public-majlis-form-${width}.png`) })
    }

    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.getByLabel('Full name').fill('Ada Example')
    await page.getByLabel('Work email').fill('ada@example.com')
    await page.getByLabel('Company').fill('Example Holdings')
    await page.getByLabel('Role').selectOption('chairperson')
    await page.getByLabel('Region').selectOption('ksa_gcc')
    await page.getByLabel('Phone').fill('+966 50 123 4567')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Request a place' }).click()
    await page.getByText('Thanks, we have your request.').waitFor()
    await page.getByText('Check your email. It has a code or a sign-in link.').waitFor()
    await page.evaluate(() => window.scrollTo(0, 0))
    const thanks = await page.locator('[data-state="thanks"]').innerText()
    assert.equal(thanks.includes('@'), false)
    await page.screenshot({ path: path.join(shotDir, 'public-majlis-thanks-1440.png') })
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.screenshot({ path: path.join(shotDir, 'public-majlis-thanks-390.png') })

    for (const name of [
      'public-majlis-1440.png',
      'public-majlis-390.png',
      'public-majlis-form-1440.png',
      'public-majlis-form-390.png',
      'public-majlis-thanks-1440.png',
      'public-majlis-thanks-390.png',
      'public-cta-destination-1440.png',
    ]) {
      assert.ok(statSync(path.join(shotDir, name)).size > 1000, name)
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})
