import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'
import { presentFreeMajlis, safeJoinUrl } from '../src/lib/freeMajlis.ts'
import { classifyCandidate } from '../supabase/functions/_shared/retention_plan.ts'
import { registerCandidate } from '../supabase/functions/_shared/candidate_flow.ts'
import { smokeSignup } from './smoke/free-account-signup.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const migration = 'supabase/migrations/20270103120000_free_account_majlis.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const rel = path.join(dir, name)
    const full = path.join(root, rel)
    if (statSync(full).isDirectory()) walk(rel, out)
    else out.push(rel)
  }
  return out
}

function latestFunction(name: string) {
  const files = readdirSync(path.join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort()
  let body = ''
  const marker = `create or replace function ${name}`
  for (const file of files) {
    const text = read(path.join('supabase/migrations', file))
    const at = text.lastIndexOf(marker)
    if (at < 0) continue
    const end = text.indexOf('\n$$;', at)
    body = end > at ? text.slice(at, end) : text.slice(at, at + 5000)
  }
  assert.ok(body, name)
  return body
}

const NOW = new Date('2026-10-19T12:00:00.000Z')

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    now: () => NOW,
    pepper: 'test-pepper',
    turnstileSecret: 'test-secret',
    site: 'https://example.com',
    verifyTurnstile: async () => true,
    emailIsMember: async () => false,
    findCandidate: async () => null,
    findAuthUserId: async () => null,
    createAuthUser: async () => ({ userId: '11111111-1111-4111-8111-111111111111' }),
    insertCandidate: async () => ({}),
    issueCode: async () => 'ok' as const,
    voidLatestCode: async () => {},
    issueSignInLink: async () => ({ url: 'https://example.com/login' }),
    sendMail: async () => ({ ok: true, dryRun: true }),
    recordEvent: async () => {},
    claimInvite: async () => false,
    domainStatus: async () => 'ok' as const,
    mailboxOk: async () => true,
    consumeRegisterLimit: async () => 'ok' as const,
    ...overrides,
  }
}

function form(extra: Record<string, unknown> = {}) {
  return {
    full_name: 'Ada Example',
    email: 'ada@example.com',
    role: 'chairperson',
    region: 'ksa_gcc',
    consent: true,
    turnstile_token: 'token',
    form_started_at: NOW.getTime() - 10_000,
    ...extra,
  }
}

test('member card helper is false for a free account and every caller is reviewed', () => {
  const helper = latestFunction('private.caller_sees_member_card')
  const memberAt = helper.indexOf('from public.members self')
  const sponsorAt = helper.indexOf('not private.is_sponsor')
  assert.ok(memberAt > 0)
  assert.ok(sponsorAt > memberAt)
  assert.match(helper, /private\.is_staff\(\)/)
  assert.equal(helper.includes('aal2'), false)

  const reviewed = [
    'supabase/migrations/20261207120000_sponsor_directory_opt_in.sql',
    'supabase/migrations/20261210120000_sectors_city_about.sql',
    'supabase/migrations/20261212120000_weekly_digest.sql',
    'supabase/migrations/20261214120000_digest_review_tiers.sql',
    'supabase/migrations/20261218120000_digest_sections.sql',
    'supabase/migrations/20261227120000_board_seats_member.sql',
    migration,
  ]
  const callers = walk('supabase').filter((rel) => read(rel).includes('caller_sees_member_card')).sort()
  assert.deepEqual(callers, reviewed)

  assert.match(latestFunction('public.list_directory'), /private\.can_read_member_room\(\)/)
  assert.match(latestFunction('public.search_deal_room_directory'), /private\.active_member/)
  assert.match(latestFunction('public.list_my_deal_rooms'), /private\.can_read_member_room\(\)/)
  assert.match(latestFunction('public.my_weekly_digest'), /status in \('invited', 'active'\)/)
  assert.match(latestFunction('public.list_sponsor_showcase'), /status in \('invited', 'active'\)/)
  assert.match(latestFunction('private.majlis_events_member_rows'), /public\.members/)
})

test('review waits for the Board Arabia email code and deletion releases seats', () => {
  const sql = read(migration)
  assert.match(sql, /email_unverified/)
  assert.match(sql, /c\.email_verified_at/)
  assert.match(sql, /email_confirmed_at is not read/)
  assert.equal(sql.includes('aal2'), false)
  assert.equal(/cron|pg_cron/i.test(sql), false)
  assert.match(sql, /LEGAL CHANGE/)
  assert.match(sql, /interval '12 months'/)
  assert.match(sql, /perform private\.release_majlis_application_seats\(p_user_id\)/)
  assert.match(sql, /my_majlis_applications/)
  assert.match(sql, /majlis_join_for_me/)
  assert.match(sql, /company_fax/)
  assert.match(sql, /from public\.members m/)
  assert.equal(sql.includes('\u2014'), false)
  assert.match(read('supabase/functions/_shared/candidate_flow.ts'), /sendExistingSignIn/)
  assert.equal(read('supabase/functions/_shared/candidate_flow.ts').includes('account_exists'), false)
})

test('signup gives the same reply and skips Turnstile when it is not configured', async () => {
  const sent: string[] = []
  const mail = async (message: { subject: string }) => {
    sent.push(message.subject)
    return { ok: true, dryRun: true }
  }
  const fresh = await registerCandidate(form({ turnstile_token: '' }), '203.0.113.10', deps({ turnstileSecret: '', sendMail: mail }))
  const existing = await registerCandidate(
    form({ turnstile_token: '' }),
    '203.0.113.10',
    deps({
      turnstileSecret: '',
      emailIsMember: async () => true,
      findAuthUserId: async () => '22222222-2222-4222-8222-222222222222',
      sendMail: mail,
    }),
  )
  assert.equal(fresh.status, 200)
  assert.deepEqual(fresh.body, existing.body)
  assert.deepEqual(fresh.body, { ok: true, error_code: '' })
  assert.equal(JSON.stringify(fresh.body).includes('account_exists'), false)
  assert.equal('created' in fresh.body, false)
  assert.match(sent[0] || '', /code/)
  assert.match(sent[1] || '', /sign-in link/)

  const honeypot = await registerCandidate(form({ company_fax: 'bot' }), '203.0.113.10', deps({ turnstileSecret: '' }))
  assert.equal(honeypot.body.error_code, 'rejected')
  const limited = await registerCandidate(
    form(),
    '203.0.113.10',
    deps({ consumeRegisterLimit: async () => 'limited' as const }),
  )
  assert.equal(limited.status, 429)

  const smoke = await smokeSignup()
  assert.equal(smoke.same, true)
  assert.equal(smoke.status, 200)
})

test('a majlis free account keeps the 12 month clock', () => {
  const open = {
    requestState: 'open',
    createdAt: daysAgo(200),
    emailVerifiedAt: daysAgo(200),
    decidedAt: null,
    remindedAt: null,
    isMember: false,
    isStaff: false,
    hasMajlisApplication: true,
  }
  assert.equal(classifyCandidate({ ...open, majlisPending: true }, NOW), 'keep')
  assert.equal(classifyCandidate({ ...open, lastMajlisAt: daysAgo(30) }, NOW), 'keep')
  assert.equal(classifyCandidate({ ...open, lastMajlisAt: daysAgo(400) }, NOW), 'delete_decided')
  assert.equal(classifyCandidate({ ...open, majlisRejectedAt: daysAgo(30) }, NOW), 'keep')
  assert.equal(classifyCandidate({ ...open, majlisRejectedAt: daysAgo(400) }, NOW), 'delete_decided')
  assert.equal(classifyCandidate({ ...open, majlisCancelledAt: daysAgo(30) }, NOW), 'keep')
  assert.equal(classifyCandidate({ ...open, majlisCancelledAt: daysAgo(400) }, NOW), 'delete_decided')
  assert.equal(classifyCandidate({ ...open, hasMajlisApplication: false }, NOW), 'delete_never_submitted')
})

test('member sign-in uses the same cooldown and still replies 200', async () => {
  let sends = 0
  let issued = 0
  const issueCode = async () => {
    issued += 1
    return issued === 1 ? ('ok' as const) : ('cooldown' as const)
  }
  const mail = async () => {
    sends += 1
    return { ok: true, dryRun: true }
  }
  const shared = {
    emailIsMember: async () => true,
    findAuthUserId: async () => '22222222-2222-4222-8222-222222222222',
    issueCode,
    sendMail: mail,
  }
  const first = await registerCandidate(form(), '203.0.113.10', deps(shared))
  const second = await registerCandidate(form(), '203.0.113.10', deps(shared))
  const cooled = await registerCandidate(form({ email: 'new@example.com' }), '203.0.113.11', deps({
    issueCode: async () => 'cooldown' as const,
    sendMail: mail,
  }))
  assert.equal(first.status, 200)
  assert.deepEqual(first.body, { ok: true, error_code: '' })
  assert.deepEqual(second.body, first.body)
  assert.deepEqual(cooled.body, first.body)
  assert.equal(cooled.status, 200)
  assert.equal(sends, 1)
})

test('own majlis rows drop other people and unsafe links', () => {
  const rows = presentFreeMajlis(
    [
      {
        id: 'a',
        event_id: 'e',
        title: 'Capital allocation',
        starts_at: '2026-11-12T15:00:00.000Z',
        status: 'accepted',
        email: 'ada@example.com',
        venue_address: 'hidden',
      },
    ],
    { e: 'https://meet.google.com/abc-defg-hij' },
  )
  assert.equal(rows.length, 1)
  assert.equal(JSON.stringify(rows).includes('ada@example.com'), false)
  assert.equal(JSON.stringify(rows).includes('hidden'), false)
  assert.equal(rows[0]?.joinUrl, 'https://meet.google.com/abc-defg-hij')
  assert.equal(safeJoinUrl('http://meet.google.com/abc-defg-hij'), null)
  assert.equal(safeJoinUrl('https://evil.example/join'), null)
})

test('free account majlis shots at 1440 and 390', { timeout: 180000 }, async (t) => {
  if (!process.env.CHROME_PATH && statSync('/usr/bin/google-chrome', { throwIfNoEntry: false })) {
    process.env.CHROME_PATH = '/usr/bin/google-chrome'
  }
  const chrome = resolveChromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  const shotDir = path.join(root, 'handoff/ba-mj-3a-free-account')
  mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    configFile: path.join(root, 'scripts/smoke/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto(`http://127.0.0.1:${port}/free-account.html`, { waitUntil: 'networkidle' })
      await page.getByRole('link', { name: 'Join' }).click({ trial: true })
      await page.getByRole('button', { name: 'Run test signup' }).click()
      await page.getByText('Same reply 200').waitFor()
      await page.screenshot({ path: path.join(shotDir, `free-majlis-${width}.png`), fullPage: true })
      await page.goto(`http://127.0.0.1:${port}/free-account.html?view=empty`, { waitUntil: 'networkidle' })
      await page.getByText('You have no majlis requests yet.').waitFor()
      await page.screenshot({ path: path.join(shotDir, `free-majlis-empty-${width}.png`), fullPage: true })
    }
    const names = ['free-majlis-1440.png', 'free-majlis-390.png', 'free-majlis-empty-1440.png', 'free-majlis-empty-390.png']
    for (const name of names) assert.ok(statSync(path.join(shotDir, name)).size > 1000, name)
  } finally {
    await browser.close()
    await vite.close()
  }
})

test('the free account migration uses the next slot', () => {
  const slots = readdirSync(path.join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql'))
  assert.equal(slots.filter((file) => file.startsWith('20270103')).length, 1)
})
