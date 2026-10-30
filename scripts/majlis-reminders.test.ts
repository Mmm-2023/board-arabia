import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  GUEST_JOIN_NOT_READY,
  MEET_LINK_NOT_READY,
  reminderLetter,
  type ReminderKind,
} from '../supabase/functions/_shared/majlis_mail.ts'
import { mailReminder } from '../supabase/functions/_shared/majlis_notify.ts'
import {
  claimReminderStamp,
  countByKind,
  reminderIsDue,
  remindersEnabled,
  runMajlisReminders,
  type DueReminder,
  type ReminderDeps,
  type ReminderWindowInput,
} from '../supabase/functions/_shared/majlis_reminders.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationName = '20270110120000_majlis_reminder_windows.sql'
const migrationsDir = path.join(root, 'supabase/migrations')

const event = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Chairs circle',
  region: 'Riyadh',
  starts_at: '2026-11-02T15:30:00.000Z',
  ends_at: '2026-11-02T17:00:00.000Z',
  venue_name: 'House',
  venue_address: 'Olaya',
  venue_visibility: 'members_on_rsvp',
  capacity: 12,
}
const site = 'https://boardarabia.com'
const joinUrl = `${site}/dashboard/majlis?event=${event.id}`
const start = Date.parse('2026-11-02T12:00:00.000Z')
const early = start - 3 * 24 * 60 * 60 * 1000

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function dueAt(kind: ReminderKind, nowOffsetMin: number, extra: Partial<ReminderWindowInput> = {}) {
  return reminderIsDue({
    kind,
    startsAtMs: start,
    nowMs: start + nowOffsetMin * 60_000,
    status: 'registered',
    eventStatus: 'published',
    registeredAtMs: early,
    claimed: false,
    ...extra,
  })
}

function dueRow(kind: ReminderKind, id: string): Record<string, unknown> {
  return {
    rsvp_id: id,
    kind,
    event_id: event.id,
    member_id: '22222222-2222-4222-8222-222222222222',
    email: 'member@example.com',
    full_name: null,
    title: event.title,
    region: event.region,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    venue_name: event.venue_name,
    venue_address: event.venue_address,
    venue_visibility: event.venue_visibility,
    capacity: event.capacity,
    format: 'in_person',
    meet_ready: false,
    audience: 'member',
  }
}

function envFor(flag: string | null): ReminderDeps['env'] {
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'example-service-role',
    MAJLIS_CRON_SECRET: 'example-cron-secret',
  }
  if (flag !== null) values.MAJLIS_REMINDERS_ENABLED = flag
  return (name) => values[name]
}

async function runFlag(flag: string | null, rows: Record<string, unknown>[], mailStatus = 'sent') {
  const rpc: string[] = []
  const mailed: DueReminder[] = []
  const req = new Request('https://example.com/functions/v1/majlis-reminders', {
    method: 'POST',
    headers: { 'x-majlis-cron': 'example-cron-secret' },
  })
  const response = await runMajlisReminders(req, {
    env: envFor(flag),
    rpc: async (name) => {
      rpc.push(name)
      if (name === 'majlis_due_reminders') return { data: rows, error: null }
      if (name === 'majlis_claim_reminder') return { data: true, error: null }
      if (name === 'service_event_reminder_blocked') return { data: false, error: null }
      if (name === 'majlis_release_reminder') return { data: null, error: null }
      return { data: null, error: { message: 'unexpected' } }
    },
    mail: async (row) => {
      mailed.push(row)
      return { status: mailStatus, detail: mailStatus === 'error' ? 'down' : undefined }
    },
  })
  const body = (await response.json()) as Record<string, unknown>
  return { status: response.status, body, rpc, mailed }
}

test('reminder windows use a fixed clock', () => {
  assert.equal(dueAt('t1h', -44), false)
  assert.equal(dueAt('t1h', -45), true)
  assert.equal(dueAt('t1h', -75), true)
  assert.equal(dueAt('t1h', -76), false)
  assert.equal(dueAt('live', 0), true)
  assert.equal(dueAt('live', 15), true)
  assert.equal(dueAt('live', 16), false)
  assert.equal(dueAt('live', -1), false)
  assert.equal(dueAt('t1h', -60, { status: 'cancelled' }), false)
  assert.equal(dueAt('t1h', -60, { status: 'waitlist' }), false)
  assert.equal(dueAt('t1h', -60, { status: 'maybe' }), false)
  assert.equal(dueAt('t1h', -60, { status: 'declined' }), false)
  assert.equal(dueAt('t1h', -60, { status: 'pending' }), false)
  assert.equal(dueAt('t1h', -60, { status: 'rejected' }), false)
  assert.equal(dueAt('t1h', -60, { eventStatus: 'cancelled' }), false)
  assert.equal(dueAt('t1h', -60, { claimed: true }), false)
  assert.equal(dueAt('t1h', -60, { status: 'accepted' }), true)
  assert.equal(dueAt('live', 5, { status: 'accepted' }), true)
  assert.equal(dueAt('t1h', -60, { registeredAtMs: start - 40 * 60_000 }), false)
  assert.equal(dueAt('t1h', -60, { registeredAtMs: start - 45 * 60_000 }), true)
  assert.equal(dueAt('live', 5, { registeredAtMs: start + 20 * 60_000 }), false)
  assert.equal(dueAt('live', 5, { registeredAtMs: start + 15 * 60_000 }), true)
  assert.equal(dueAt('t7', -24 * 60), false)
  assert.equal(dueAt('t7', -(24 * 60 + 1)), true)
  assert.equal(dueAt('t7', -(7 * 24 * 60)), true)
  assert.equal(dueAt('t7', -(7 * 24 * 60 + 1)), false)
  assert.equal(dueAt('t1', 0), false)
  assert.equal(dueAt('t1', -1), true)
  assert.equal(dueAt('t1', -24 * 60), true)
  assert.equal(dueAt('t1', -(24 * 60 + 1)), false)
  assert.equal(dueAt('t1', 30), false)
  assert.equal(dueAt('t7', 30), false)
  assert.equal(claimReminderStamp({ status: 'registered', stamp: null }), true)
  assert.equal(claimReminderStamp({ status: 'registered', stamp: 'set' }), false)
  assert.equal(claimReminderStamp({ status: 'accepted', stamp: null }), true)
  assert.equal(claimReminderStamp({ status: 'accepted', stamp: 'set' }), false)
  assert.equal(claimReminderStamp({ status: 'waitlist', stamp: null }), false)
  assert.equal(claimReminderStamp({ status: 'cancelled', stamp: null }), false)
  assert.equal(claimReminderStamp({ status: 'pending', stamp: null }), false)
})

test('the reminder flag sends only for the exact string true', async () => {
  const rows = [
    dueRow('t7', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
    dueRow('t1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
    dueRow('t1h', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'),
    dueRow('live', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'),
  ]
  for (const flag of [null, '', 'false', 'TRUE', ' true'] as const) {
    const result = await runFlag(flag, rows)
    assert.equal(result.status, 200, String(flag))
    assert.deepEqual(result.body, {
      enabled: false,
      would_send: { t7: 1, t1: 1, t1h: 1, live: 1 },
    })
    assert.deepEqual(result.rpc, ['majlis_due_reminders'])
    assert.equal(result.mailed.length, 0)
  }
  assert.equal(remindersEnabled(undefined), false)
  assert.equal(remindersEnabled('true'), true)
  const sent = await runFlag('true', rows)
  assert.equal(sent.status, 200)
  assert.deepEqual(sent.body, { ok: true, t7: 1, t1: 1, t1h: 1, live: 1, failed: 0 })
  assert.equal(sent.mailed.length, 4)
  assert.equal(sent.rpc.filter((name) => name === 'majlis_claim_reminder').length, 4)
  assert.equal(sent.rpc.includes('majlis_release_reminder'), false)
  assert.equal(sent.mailed[0]?.event.id, event.id)
  assert.equal('email' in sent.mailed[0]!.event, false)
  const failed = await runFlag('true', [dueRow('t1h', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5')], 'error')
  assert.equal(failed.body.failed, 1)
  assert.equal(failed.body.t1h, 0)
  assert.equal(failed.rpc.filter((name) => name === 'majlis_release_reminder').length, 1)
  const blockedRpc: string[] = []
  const blockedResponse = await runMajlisReminders(
    new Request('https://example.com/functions/v1/majlis-reminders', {
      method: 'POST',
      headers: { 'x-majlis-cron': 'example-cron-secret' },
    }),
    {
      env: envFor('true'),
      rpc: async (name) => {
        blockedRpc.push(name)
        if (name === 'majlis_due_reminders') return { data: rows, error: null }
        if (name === 'service_event_reminder_blocked') return { data: true, error: null }
        return { data: null, error: { message: 'unexpected' } }
      },
      mail: async () => {
        throw new Error('mail was called')
      },
    },
  )
  assert.equal(blockedResponse.status, 200)
  assert.equal(blockedRpc.includes('majlis_claim_reminder'), false)
  const denied = await runMajlisReminders(
    new Request('https://example.com/functions/v1/majlis-reminders', { method: 'POST' }),
    {
      env: envFor(null),
      rpc: async () => {
        throw new Error('rpc was called')
      },
      mail: async () => {
        throw new Error('mail was called')
      },
    },
  )
  assert.equal(denied.status, 401)
  assert.deepEqual(countByKind([]), { t7: 0, t1: 0, t1h: 0, live: 0 })
})

test('reminder letters keep the Join page and leave the meeting link out', () => {
  const memberPage = read('src/pages/dashboard/MajlisPage.tsx')
  const guestPage = read('src/pages/dashboard/account/FreeMajlisScreen.tsx')
  assert.equal(memberPage.includes(MEET_LINK_NOT_READY), true)
  assert.equal(guestPage.includes(GUEST_JOIN_NOT_READY), true)
  const other = 'other.member@example.com'
  for (const kind of ['t7', 't1', 't1h', 'live'] as const) {
    const letter = reminderLetter(site, event, kind)
    for (const body of [letter.text, letter.html]) {
      assert.equal(body.includes('meet.google.com'), false, kind)
      assert.equal(body.includes(joinUrl), true, kind)
      assert.equal(body.includes(other), false, kind)
      assert.equal(body.includes('@'), false, kind)
      assert.equal(body.includes('\u2014'), false, kind)
      assert.equal(body.includes('\u2013'), false, kind)
      assert.equal(/\bsponsor/i.test(body), false, kind)
      assert.equal(/\bpartners?\b/i.test(body), false, kind)
      assert.equal(/\bdesk\b/i.test(body), false, kind)
    }
    assert.equal(letter.text.includes('Asia/Riyadh'), true, kind)
    assert.equal(letter.text.includes('Olaya'), true, kind)
  }
  const hidden = reminderLetter(site, event, 't1', { registered: false })
  assert.equal(hidden.text.includes('Olaya'), false)
  const always = reminderLetter(site, { ...event, venue_visibility: 'members_always' }, 't1', { registered: false })
  assert.equal(always.text.includes('Olaya'), true)
  const hour = reminderLetter(site, event, 't1h')
  const live = reminderLetter(site, event, 'live')
  assert.match(hour.subject, /starts in about one hour/)
  assert.match(hour.text, /starts in about one hour/)
  assert.match(live.subject, /is starting now/)
  assert.match(live.text, /is starting now/)
  const notReady = reminderLetter(site, event, 'live', { format: 'virtual', meetReady: false, audience: 'member' })
  assert.equal(notReady.text.includes(MEET_LINK_NOT_READY), true)
  assert.equal(notReady.html.includes(MEET_LINK_NOT_READY), true)
  assert.equal(notReady.text.includes('meet.google.com'), false)
  const guest = reminderLetter(site, event, 't1h', { format: 'virtual', meetReady: false, audience: 'guest' })
  assert.equal(guest.text.includes(GUEST_JOIN_NOT_READY), true)
  assert.equal(guest.text.includes(MEET_LINK_NOT_READY), false)
  const ready = reminderLetter(site, event, 'live', { format: 'virtual', meetReady: true, audience: 'member' })
  assert.equal(ready.text.includes(MEET_LINK_NOT_READY), false)
  assert.equal(ready.text.includes(GUEST_JOIN_NOT_READY), false)
  assert.equal(ready.text.includes(joinUrl), true)
  const week = reminderLetter(site, event, 't7')
  assert.match(week.subject, /is one week away/)
  assert.match(reminderLetter(site, event, 't1').subject, /is tomorrow/)
})

test('mailReminder checks suppression before it sends', async () => {
  const saved: Record<string, string | undefined> = {}
  for (const name of [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
    'GMAIL_SERVICE_ACCOUNT_JSON',
    'GMAIL_FROM',
  ]) {
    saved[name] = process.env[name]
    delete process.env[name]
  }
  const notice = {
    userId: '22222222-2222-4222-8222-222222222222',
    refId: '33333333-3333-4333-8333-333333333333',
    eventId: event.id,
  }
  try {
    let inserts = 0
    const blocked = await mailReminder(
      {
        rpc: async () => ({ data: true, error: null }),
        from: () => ({
          insert: async () => {
            inserts += 1
            return { error: null }
          },
        }),
      } as never,
      'member@example.com',
      event,
      't1h',
      notice,
    )
    assert.equal(blocked.status, 'error')
    assert.equal(blocked.detail, 'suppressed')
    assert.equal(inserts, 0)
    const failed = await mailReminder(
      {
        rpc: async () => ({ data: null, error: { message: 'down' } }),
        from: () => ({
          insert: async () => {
            inserts += 1
            return { error: null }
          },
        }),
      } as never,
      'member@example.com',
      event,
      'live',
      notice,
    )
    assert.equal(failed.detail, 'blocked_check_failed')
    assert.equal(inserts, 0)
    const allowed = await mailReminder(
      {
        rpc: async () => ({ data: false, error: null }),
        from: () => ({
          insert: async () => {
            inserts += 1
            return { error: null }
          },
        }),
      } as never,
      'member@example.com',
      event,
      't1',
      notice,
      { format: 'virtual', meetReady: false, audience: 'member' },
    )
    assert.equal(allowed.status, 'dry_run')
    assert.equal(inserts, 1)
    assert.equal(allowed.detail?.includes('meet.google.com') ?? false, false)
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('reminder migration keeps an empty search path and does not schedule', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.filter((name) => name.startsWith('20270110120000')).length, 1)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20270108120000_boardroom_fields.sql'))
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('search_path = public'), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(sql), false)
  assert.equal(/\bto anon\b/i.test(sql), false)
  assert.match(sql, /reminder_t1h_sent_at timestamptz/)
  assert.match(sql, /reminder_live_sent_at timestamptz/)
  assert.equal(/reminder_t1h_sent_at timestamptz not null/i.test(sql), false)
  assert.equal(/reminder_live_sent_at timestamptz not null/i.test(sql), false)
  const t7 = sql.split('-- kind t7 member')[1]?.split('-- kind t7 guest')[0] ?? ''
  const t1 = sql.split('-- kind t1 member')[1]?.split('-- kind t1 guest')[0] ?? ''
  assert.match(t7, /interval '7 days'/)
  assert.match(t7, /interval '1 day'/)
  assert.equal(t7.includes('45 minutes'), false)
  assert.equal(t7.includes('registered_at <='), false)
  assert.match(t1, /e\.starts_at > pg_catalog\.now\(\)/)
  assert.match(t1, /interval '1 day'/)
  assert.equal(t1.includes('45 minutes'), false)
  assert.match(sql, /interval '45 minutes'/)
  assert.match(sql, /interval '75 minutes'/)
  assert.match(sql, /interval '15 minutes'/)
  assert.match(sql, /a\.status = 'accepted'/)
  const chunks = sql.split(/create or replace function /i).slice(1)
  assert.equal(chunks.length, 4)
  for (const chunk of chunks) {
    const header = chunk.split(/as\s+\$fn\$/i)[0] ?? ''
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }
  const config = read('supabase/config.toml')
  const before = config.split('[functions.majlis-reminders]')[0] ?? ''
  assert.match(before, /MAJLIS_REMINDERS_ENABLED is off unless the value is the exact string true/)
  assert.match(before, /No schedule/)
  assert.match(before, /approves the cron and the first live send separately/)
  const index = read('supabase/functions/majlis-reminders/index.ts')
  const runner = read('supabase/functions/_shared/majlis_reminders.ts')
  for (const source of [index, runner]) {
    assert.equal(/googleapis|meet\.google|oauth2|calendar\.google/i.test(source), false)
    assert.equal(/pg_cron|cron\.schedule/i.test(source), false)
  }
  assert.match(index, /MAJLIS_CRON_SECRET/)
  assert.match(index, /MAJLIS_REMINDERS_ENABLED/)
  for (const name of readdirSync(path.join(root, '.github/workflows'))) {
    assert.equal(read(`.github/workflows/${name}`).includes('majlis-reminders'), false, name)
  }
  const app = read('src/App.tsx')
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.equal(app.includes('majlis-reminders'), false)
})

test('reminder rpcs stay closed to anon and keep the windows', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const donor = read('scripts/majlis-calendar-rsvp.test.ts')
  const marker = 'const stubSql = `'
  const startAt = donor.indexOf(marker)
  const endAt = donor.indexOf('`\n\nconst assertSql')
  assert.ok(startAt > 0 && endAt > startAt)
  const stubSql = donor.slice(startAt + marker.length, endAt)
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-majlis-rem-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_majlis_rem_${process.pid}`
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

const assertSql = `
do $checks$
declare
  v_now timestamptz;
  v_meet text := 'https://' || 'meet.google.com/' || 'abc-defg-hij';
  host_id uuid := '10000000-0000-4000-8000-0000000000a1';
  yes_id uuid := '10000000-0000-4000-8000-0000000000a2';
  guest_id uuid := '10000000-0000-4000-8000-0000000000a3';
  staff_id uuid := '10000000-0000-4000-8000-0000000000a4';
  got text[];
  leaked text;
  nullable text;
begin
  if has_function_privilege('anon', 'public.majlis_due_reminders()', 'execute')
     or has_function_privilege('anon', 'public.majlis_claim_reminder(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.majlis_release_reminder(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.service_event_reminder_blocked(uuid)', 'execute')
     or has_function_privilege('public', 'public.majlis_due_reminders()', 'execute')
     or has_function_privilege('public', 'public.majlis_claim_reminder(uuid, text)', 'execute')
     or has_function_privilege('public', 'public.majlis_release_reminder(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.majlis_due_reminders()', 'execute') then
    raise exception 'anon or public can execute a reminder rpc';
  end if;
  if not has_function_privilege('service_role', 'public.majlis_due_reminders()', 'execute')
     or not has_function_privilege('service_role', 'public.majlis_claim_reminder(uuid, text)', 'execute')
     or not has_function_privilege('service_role', 'public.majlis_release_reminder(uuid, text)', 'execute')
     or not has_function_privilege('service_role', 'public.service_event_reminder_blocked(uuid)', 'execute') then
    raise exception 'service role cannot execute a reminder rpc';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'majlis_due_reminders',
        'majlis_claim_reminder',
        'majlis_release_reminder',
        'service_event_reminder_blocked'
      )
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) cfg
        where cfg in ('search_path=""', 'search_path=''''')
      )
  ) then
    raise exception 'search_path is public or unset';
  end if;
  select string_agg(is_nullable, ',' order by column_name)
    into nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'majlis_rsvps'
    and column_name in ('reminder_t1h_sent_at', 'reminder_live_sent_at');
  if nullable is distinct from 'YES,YES' then
    raise exception 'rsvp stamp columns are not nullable';
  end if;
  select string_agg(is_nullable, ',' order by column_name)
    into nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'majlis_applications'
    and column_name in (
      'reminder_t7_sent_at',
      'reminder_t1_sent_at',
      'reminder_t1h_sent_at',
      'reminder_live_sent_at'
    );
  if nullable is distinct from 'YES,YES,YES,YES' then
    raise exception 'guest stamp columns are not nullable';
  end if;

  v_now := pg_catalog.now();
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into auth.users (id, email) values
    (host_id, 'host.reminder@example.com'),
    (yes_id, 'yes.reminder@example.com'),
    (guest_id, 'guest.reminder@example.com'),
    (staff_id, 'staff.reminder@example.com');
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.reminder@example.com', 'staff');
  insert into public.members (user_id, email, seat, status) values
    (host_id, 'host.reminder@example.com', 'ksa', 'active'),
    (yes_id, 'yes.reminder@example.com', 'ksa', 'active');
  insert into public.profiles (user_id, full_name) values
    (yes_id, 'Example Yes');
  insert into public.candidates (user_id, email, full_name, role, region, email_verified_at)
  values (guest_id, 'guest.reminder@example.com', 'Example Guest', 'chairperson', 'ksa_gcc', v_now);

  insert into public.majlis_events (
    id, host_member_id, title, description, region, focus_tags, starts_at, ends_at,
    capacity, venue_name, venue_address, venue_visibility, status, approved_by, approved_at, format, google_meet_url
  ) values
    ('20000000-0000-4000-8000-000000000045', host_id, 'Forty five', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '45 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-000000000044', host_id, 'Forty four', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '44 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-000000000075', host_id, 'Seventy five', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '75 minutes', v_now + interval '3 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-000000000076', host_id, 'Seventy six', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '76 minutes', v_now + interval '3 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000a0', host_id, 'At start', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now, v_now + interval '90 minutes', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-000000000015', host_id, 'Plus fifteen', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now - interval '15 minutes', v_now + interval '75 minutes', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-000000000016', host_id, 'Plus sixteen', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now - interval '16 minutes', v_now + interval '74 minutes', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000c1', host_id, 'Cancelled seat', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000c2', host_id, 'Wait seat', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000c3', host_id, 'Maybe seat', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000c4', host_id, 'Cancelled event', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000c5', host_id, 'Late seat', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000c6', host_id, 'Week seat', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '3 days', v_now + interval '3 days 2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000c7', host_id, 'Past seat', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now - interval '2 days', v_now - interval '2 days' + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000c8', host_id, 'Virtual seat', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'virtual', v_meet),
    ('20000000-0000-4000-8000-0000000000d1', host_id, 'Guest early', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000d2', host_id, 'Guest wait', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000d3', host_id, 'Guest pending', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000d4', host_id, 'Guest rejected', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null),
    ('20000000-0000-4000-8000-0000000000d5', host_id, 'Guest late', 'A private gathering for members.', 'Riyadh', array['Governance'], v_now + interval '60 minutes', v_now + interval '2 hours', 12, 'House', 'Example street', 'members_on_rsvp', 'published', staff_id, v_now, 'in_person', null);

  update public.majlis_events
    set status = 'cancelled',
        cancelled_at = v_now,
        cancel_reason = 'The room is unavailable.'
    where id = '20000000-0000-4000-8000-0000000000c4';

  insert into public.majlis_rsvps (id, event_id, member_id, status, registered_at) values
    ('30000000-0000-4000-8000-000000000045', '20000000-0000-4000-8000-000000000045', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-000000000044', '20000000-0000-4000-8000-000000000044', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-000000000075', '20000000-0000-4000-8000-000000000075', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-000000000076', '20000000-0000-4000-8000-000000000076', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-0000000000a0', '20000000-0000-4000-8000-0000000000a0', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000015', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-000000000016', '20000000-0000-4000-8000-000000000016', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-0000000000c3', '20000000-0000-4000-8000-0000000000c3', yes_id, 'maybe', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-0000000000c4', '20000000-0000-4000-8000-0000000000c4', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-0000000000c5', '20000000-0000-4000-8000-0000000000c5', yes_id, 'registered', v_now + interval '20 minutes'),
    ('30000000-0000-4000-8000-0000000000c6', '20000000-0000-4000-8000-0000000000c6', yes_id, 'registered', v_now - interval '3 days'),
    ('30000000-0000-4000-8000-0000000000c7', '20000000-0000-4000-8000-0000000000c7', yes_id, 'registered', v_now - interval '5 days'),
    ('30000000-0000-4000-8000-0000000000c8', '20000000-0000-4000-8000-0000000000c8', yes_id, 'registered', v_now - interval '3 days');
  insert into public.majlis_rsvps (id, event_id, member_id, status, cancelled_at, registered_at)
  values (
    '30000000-0000-4000-8000-0000000000c1',
    '20000000-0000-4000-8000-0000000000c1',
    yes_id,
    'cancelled',
    v_now,
    v_now - interval '3 days'
  );
  insert into public.majlis_rsvps (id, event_id, member_id, status, waitlist_position, registered_at)
  values (
    '30000000-0000-4000-8000-0000000000c2',
    '20000000-0000-4000-8000-0000000000c2',
    yes_id,
    'waitlist',
    1,
    v_now - interval '3 days'
  );

  insert into public.majlis_applications (
    id, event_id, user_id, status, form_snapshot, submitted_at, decided_at
  ) values
    ('40000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-0000000000d1', guest_id, 'accepted', '{"full_name":"Example Guest","company":"Example Holdings","role":"chairperson"}'::jsonb, v_now - interval '4 days', v_now - interval '3 days'),
    ('40000000-0000-4000-8000-0000000000d2', '20000000-0000-4000-8000-0000000000d2', guest_id, 'waitlist', '{"full_name":"Example Guest","company":"Example Holdings","role":"chairperson"}'::jsonb, v_now - interval '4 days', v_now - interval '3 days'),
    ('40000000-0000-4000-8000-0000000000d3', '20000000-0000-4000-8000-0000000000d3', guest_id, 'pending', '{"full_name":"Example Guest","company":"Example Holdings","role":"chairperson"}'::jsonb, v_now - interval '4 days', null),
    ('40000000-0000-4000-8000-0000000000d4', '20000000-0000-4000-8000-0000000000d4', guest_id, 'rejected', '{"full_name":"Example Guest","company":"Example Holdings","role":"chairperson"}'::jsonb, v_now - interval '4 days', v_now - interval '3 days'),
    ('40000000-0000-4000-8000-0000000000d5', '20000000-0000-4000-8000-0000000000d5', guest_id, 'accepted', '{"full_name":"Example Guest","company":"Example Holdings","role":"chairperson"}'::jsonb, v_now - interval '4 days', v_now + interval '20 minutes');

  select coalesce(array_agg(r.kind || ':' || r.audience order by r.kind, r.audience), '{}'::text[])
    into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-000000000045';
  if got is distinct from array['t1:member', 't1h:member']::text[] then
    raise exception '45 minute window %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-000000000044';
  if got is distinct from array['t1']::text[] then
    raise exception '44 minute window %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-000000000075';
  if got is distinct from array['t1', 't1h']::text[] then
    raise exception '75 minute window %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-000000000076';
  if got is distinct from array['t1']::text[] then
    raise exception '76 minute window %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-0000000000a0';
  if got is distinct from array['live']::text[] then
    raise exception 'start window %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-000000000015';
  if got is distinct from array['live']::text[] then
    raise exception 'plus 15 window %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-000000000016';
  if got is distinct from '{}'::text[] then
    raise exception 'plus 16 window %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id in (
    '20000000-0000-4000-8000-0000000000c1',
    '20000000-0000-4000-8000-0000000000c2',
    '20000000-0000-4000-8000-0000000000c3',
    '20000000-0000-4000-8000-0000000000c4',
    '20000000-0000-4000-8000-0000000000c7'
  );
  if got is distinct from '{}'::text[] then
    raise exception 'excluded rows %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-0000000000c5';
  if got is distinct from array['t1']::text[] then
    raise exception 'late registration %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-0000000000c6';
  if got is distinct from array['t7']::text[] then
    raise exception 'week window %', got;
  end if;

  select coalesce(string_agg(row_to_json(r)::text, ''), '') into leaked
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-0000000000c8';
  if position('meet.google.com' in leaked) > 0 then
    raise exception 'meeting link leaked into the due row';
  end if;
  if position('"meet_ready":true' in leaked) = 0 and position('"meet_ready": true' in leaked) = 0 then
    raise exception 'virtual row was not marked ready';
  end if;

  select coalesce(array_agg(r.kind || ':' || r.audience order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-0000000000d1';
  if got is distinct from array['t1:guest', 't1h:guest']::text[] then
    raise exception 'accepted guest %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id in (
    '20000000-0000-4000-8000-0000000000d2',
    '20000000-0000-4000-8000-0000000000d3',
    '20000000-0000-4000-8000-0000000000d4'
  );
  if got is distinct from '{}'::text[] then
    raise exception 'unaccepted guest %', got;
  end if;

  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-0000000000d5';
  if got is distinct from array['t1']::text[] then
    raise exception 'late guest %', got;
  end if;

  if public.majlis_claim_reminder('30000000-0000-4000-8000-000000000045', 't1h') is not true then
    raise exception 'first claim failed';
  end if;
  if public.majlis_claim_reminder('30000000-0000-4000-8000-000000000045', 't1h') is not false then
    raise exception 'second claim succeeded';
  end if;
  select coalesce(array_agg(r.kind order by r.kind), '{}'::text[]) into got
  from public.majlis_due_reminders() r
  where r.event_id = '20000000-0000-4000-8000-000000000045';
  if got is distinct from array['t1']::text[] then
    raise exception 'claimed hour still due %', got;
  end if;
  perform public.majlis_release_reminder('30000000-0000-4000-8000-000000000045', 't1h');
  if public.majlis_claim_reminder('30000000-0000-4000-8000-000000000045', 't1h') is not true then
    raise exception 'release did not clear the stamp';
  end if;
  if public.majlis_claim_reminder('40000000-0000-4000-8000-0000000000d1', 't1h') is not true then
    raise exception 'guest claim failed';
  end if;
  if public.majlis_claim_reminder('40000000-0000-4000-8000-0000000000d1', 't1h') is not false then
    raise exception 'guest claim repeated';
  end if;
  if public.majlis_claim_reminder('30000000-0000-4000-8000-0000000000c2', 't1') is not false then
    raise exception 'waitlist claim succeeded';
  end if;

  begin
    perform public.majlis_claim_reminder('30000000-0000-4000-8000-000000000045', 'later');
    raise exception 'bad kind was accepted';
  exception
    when invalid_parameter_value then
      null;
  end;

  if public.service_event_reminder_blocked(yes_id) is not false then
    raise exception 'open member was blocked';
  end if;
  insert into public.email_preferences (user_id, category, opted_in)
  values (yes_id, 'event_reminder', false);
  if public.service_event_reminder_blocked(yes_id) is not true then
    raise exception 'opt out was allowed';
  end if;
  delete from public.email_preferences where user_id = yes_id and category = 'event_reminder';
  insert into public.email_suppressions (email_hash, reason, source)
  values (private.email_address_hash('yes.reminder@example.com'), 'hard_bounce', 'admin');
  if public.service_event_reminder_blocked(yes_id) is not true then
    raise exception 'bounce was allowed';
  end if;
  if public.service_event_reminder_blocked(guest_id) is not false then
    raise exception 'accepted guest was blocked';
  end if;
end;
$checks$;
`
