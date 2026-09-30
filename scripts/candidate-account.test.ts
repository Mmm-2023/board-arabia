import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { accountRequestAllowed } from '../src/lib/accountAccess.ts'
import {
  setAnalyticsConsentForTests,
  setAnalyticsEnabledForTests,
  setAnalyticsSinkForTests,
  track,
} from '../src/lib/analytics.ts'
import { presentAccountDeals, presentAccountTotals } from '../src/lib/accountPreview.ts'
import { ACCOUNT_SHEET_LINKS, MEMBER_ACCOUNT, shellSectionTitle, MEMBER_DESTINATIONS } from '../src/shell/destinations.ts'
import { storeAttribution } from '../supabase/functions/_shared/attribution.ts'
import { accountOpenMail, registrationCodeMail } from '../supabase/functions/_shared/candidate_copy.ts'
import { registerCandidate, verifyCandidate } from '../supabase/functions/_shared/candidate_flow.ts'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const UI_FILES = [
  'src/pages/apply/RegisterScreen.tsx',
  'src/pages/apply/VerifyScreen.tsx',
  'src/pages/ApplyPage.tsx',
  'src/pages/VerifyPage.tsx',
  'src/pages/dashboard/account/views.tsx',
  'src/pages/dashboard/account/AccountRoutes.tsx',
  'src/lib/accountPreview.ts',
  'supabase/functions/_shared/candidate_copy.ts',
]

test('open account copy avoids the internal tier name and dashes', () => {
  for (const file of UI_FILES) {
    const source = read(file)
    assert.equal(/\bBasic\b/.test(source), false, file)
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(source.includes('\u2013'), false, file)
    assert.equal(/calendar\.app\.google/i.test(source), false, file)
  }
  assert.match(read('src/pages/dashboard/account/views.tsx'), /Your account/)
  assert.match(read('src/pages/dashboard/account/views.tsx'), /Request full membership/)
  assert.deepEqual(
    ACCOUNT_SHEET_LINKS.map((item) => item.label),
    ['Profile', 'Membership', 'Help'],
  )
  assert.deepEqual(
    MEMBER_ACCOUNT.map((item) => item.label),
    ['Profile', 'Help'],
  )
  assert.equal(
    shellSectionTitle('/dashboard/membership', MEMBER_DESTINATIONS, ACCOUNT_SHEET_LINKS),
    'Membership',
  )
})

test('candidate migration keeps accounts out of members and stores attribution', () => {
  const sql = read('supabase/migrations/20261029120000_two_tier_candidates.sql')
  assert.match(sql, /create table if not exists public\.candidates/)
  assert.match(sql, /create table if not exists public\.candidate_events/)
  assert.match(sql, /create table if not exists public\.candidate_notes/)
  assert.match(sql, /alter table public\.candidates force row level security/)
  assert.match(sql, /alter table public\.candidate_events force row level security/)
  assert.match(sql, /alter table public\.candidate_notes force row level security/)
  assert.match(sql, /request_state = 'open'/)
  assert.match(sql, /ft_source/)
  assert.match(sql, /lt_campaign/)
  assert.match(sql, /analytics_id/)
  assert.match(sql, /attribution_version/)
  assert.match(sql, /candidate_issue_code/)
  assert.match(sql, /candidate_consume_secret/)
  assert.equal(/alter table public\.applications/i.test(sql), false)
  assert.equal(/alter table public\.members/i.test(sql), false)
  assert.equal(/create policy \w+ on public\.members/i.test(sql), false)
  assert.equal(/insert into public\.members/i.test(sql), false)
  assert.equal(/insert into public\.profiles/i.test(sql), false)
  assert.equal(sql.includes('service_role'), true)
  assert.equal(/sk_live|service_role_key|eyJ/i.test(sql), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(sql), false)
})

test('attribution drops unknown keys, emails, and phone-shaped values', () => {
  const stored = storeAttribution({
    first: {
      source: 'LinkedIn',
      medium: 'Social',
      campaign: '2026-10-founding-100',
      content: 'post-01',
      term: 'family-office-gcc',
      referrer_host: 'https://linkedin.com/in/someone',
      landing_path: '/apply',
      at: '2026-09-30T08:00:00.000Z',
      email: 'ada@example.com',
      statement: 'I would bring a board seat',
      scale_band: '10-25',
    },
    last: { source: 'email', medium: 'email', campaign: 'peer-invite', phone: '966500000000' },
    analyticsId: 'ada@example.com',
  })
  assert.equal(stored.ft_source, 'linkedin')
  assert.equal(stored.ft_medium, 'social')
  assert.equal(stored.ft_campaign, '2026-10-founding-100')
  assert.equal(stored.ft_referrer_host, null)
  assert.equal(stored.ft_landing_path, '/apply')
  assert.equal(stored.lt_source, 'email')
  assert.equal(stored.analytics_id, null)
  assert.equal(JSON.stringify(stored).includes('ada@example.com'), false)
  assert.equal(JSON.stringify(stored).includes('statement'), false)
  assert.equal(JSON.stringify(stored).includes('9665'), false)
})

test('registration mail is a code letter and the welcome letter has no secret', () => {
  const code = registrationCodeMail({
    code: '123456',
    verifyUrl: 'https://boardarabia.com/apply/verify?token=abc',
  })
  const welcome = accountOpenMail({ dashboardUrl: 'https://boardarabia.com/dashboard' })
  for (const mail of [code, welcome]) {
    assert.equal(mail.text.includes('\u2014'), false)
    assert.equal(mail.text.includes('\u2013'), false)
    assert.match(mail.text, /Board Arabia\s*$/)
    assert.equal(/calendar\.app\.google|private booking|\/book\b/i.test(mail.text), false)
    assert.equal(/\bBasic\b/.test(mail.text), false)
  }
  assert.match(code.subject, /Your Board Arabia code/)
  assert.match(code.text, /123456/)
  assert.match(code.text, /10 minutes/)
  assert.match(welcome.subject, /Your Board Arabia account is open/)
  assert.match(welcome.text, /Request full membership/)
  assert.equal(welcome.text.includes('123456'), false)
})

test('register stores attribution and never puts a band or statement on the audit event', async () => {
  const events: { kind: string; detail: Record<string, unknown> }[] = []
  let inserted: Record<string, unknown> | null = null
  const sent: { subject: string; text: string }[] = []
  const deps = {
    now: () => new Date('2026-09-30T08:00:00.000Z'),
    pepper: 'test-pepper',
    turnstileSecret: 'test-secret',
    site: 'https://boardarabia.com',
    verifyTurnstile: async () => true,
    emailIsMember: async () => false,
    findCandidate: async () => null,
    findAuthUserId: async () => null,
    createAuthUser: async () => ({ userId: '11111111-1111-4111-8111-111111111111' }),
    insertCandidate: async (row: { attribution: Record<string, unknown>; fullName: string }) => {
      inserted = { fullName: row.fullName, ...row.attribution }
      return {}
    },
    issueCode: async () => 'ok' as const,
    voidLatestCode: async () => {},
    sendMail: async (message: { subject: string; text: string }) => {
      sent.push(message)
      return { ok: true, dryRun: false }
    },
    recordEvent: async (_userId: string, kind: string, detail: Record<string, string | boolean>) => {
      events.push({ kind, detail })
    },
    claimInvite: async () => false,
  }
  const outcome = await registerCandidate(
    {
      full_name: 'Ada Example',
      email: 'ada@example.com',
      role: 'chairperson',
      region: 'ksa_gcc',
      consent: true,
      turnstile_token: 'token',
      first_touch: { source: 'linkedin', medium: 'social', campaign: 'test-ft', landing_path: '/apply' },
      last_touch: { source: 'linkedin', medium: 'social', campaign: 'test-ft' },
      analytics_id: null,
      statement: 'secret statement',
      scale_band: 'hidden-band',
    },
    '203.0.113.5',
    deps,
  )
  assert.equal(outcome.status, 200)
  assert.equal(inserted?.ft_source, 'linkedin')
  assert.equal(inserted?.ft_medium, 'social')
  assert.equal(inserted?.ft_campaign, 'test-ft')
  assert.equal(events.some((event) => event.kind === 'registered'), true)
  const audit = JSON.stringify({ inserted, events })
  assert.equal(audit.includes('secret statement'), false)
  assert.equal(audit.includes('hidden-band'), false)
  assert.equal(audit.includes('ada@example.com'), false)
  assert.equal(sent[0]?.text.includes('ada@example.com'), false)
  assert.match(sent[0]?.text || '', /Your code is /)
})

test('verify records the method and does not echo a band', async () => {
  const events: { kind: string; detail: Record<string, unknown> }[] = []
  const outcome = await verifyCandidate(
    { email: 'ada@example.com', code: '123456', scale_band: 'nope' },
    {
      pepper: 'test-pepper',
      site: 'https://boardarabia.com',
      consume: async () => ({ status: 'ok', userId: '11111111-1111-4111-8111-111111111111' }),
      markVerified: async () => ({ first: true }),
      confirmAuthEmail: async () => ({}),
      issueSession: async () => ({ tokenHash: 'hash', email: 'ada@example.com' }),
      lookupEmail: async () => 'ada@example.com',
      sendMail: async () => ({ ok: true, dryRun: true }),
      recordEvent: async (_id, kind, detail) => {
        events.push({ kind, detail })
      },
    },
  )
  assert.equal(outcome.status, 200)
  assert.equal(outcome.body.method, 'code')
  assert.equal(events[0]?.kind, 'email_verified')
  assert.equal(events[0]?.detail.method, 'code')
  assert.equal(JSON.stringify(events).includes('nope'), false)
  assert.equal(JSON.stringify(events).includes('ada@example.com'), false)
})

test('analytics stays dark and drops banned properties', () => {
  const seen: { event: string; props: Record<string, unknown> }[] = []
  setAnalyticsSinkForTests((event, props) => {
    seen.push({ event, props })
  })
  setAnalyticsEnabledForTests(false)
  setAnalyticsConsentForTests(true)
  track('register_basic', { role_group: 'chairperson', region_group: 'intl', has_invite: false })
  assert.equal(seen.length, 0)

  setAnalyticsEnabledForTests(true)
  setAnalyticsConsentForTests(false)
  track('email_verified', { method: 'code' })
  assert.equal(seen.length, 0)

  setAnalyticsConsentForTests(true)
  track('register_basic', {
    role_group: 'chairperson',
    region_group: 'ksa_gcc',
    has_invite: true,
    scale_band: '10-25m',
    statement: 'a long private statement',
    phone: '0500000000',
    cr_number: '1010101010',
    email: 'ada@example.com',
  })
  assert.equal(seen.length, 0)

  track('register_basic', { role_group: 'chairperson', region_group: 'intl', has_invite: false, path: '/apply' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0]?.event, 'register_basic')
  assert.equal(JSON.stringify(seen[0]?.props).includes('chairperson'), true)
  assert.equal(JSON.stringify(seen[0]?.props).includes('@'), false)

  track('not_a_real_event', { path: '/apply' })
  assert.equal(seen.length, 1)
  setAnalyticsEnabledForTests(null)
  setAnalyticsConsentForTests(null)
  setAnalyticsSinkForTests(null)
})

test('an open account cannot request member-private endpoints', () => {
  assert.equal(accountRequestAllowed('https://example.supabase.co/rest/v1/rpc/list_landing_preview_deals'), true)
  assert.equal(accountRequestAllowed('https://example.supabase.co/rest/v1/rpc/landing_platform_totals'), true)
  assert.equal(accountRequestAllowed('https://example.supabase.co/rest/v1/platform_stats'), true)
  assert.equal(accountRequestAllowed('https://example.supabase.co/rest/v1/candidates'), true)
  assert.equal(accountRequestAllowed('https://example.supabase.co/functions/v1/register-candidate'), true)
  assert.equal(accountRequestAllowed('https://example.supabase.co/functions/v1/verify-candidate'), true)
  for (const blocked of [
    '/rest/v1/members',
    '/rest/v1/profiles',
    '/rest/v1/mandates',
    '/rest/v1/deal_rooms',
    '/rest/v1/majlis_events',
    '/rest/v1/rpc/list_re_opportunities',
    '/rest/v1/rpc/list_directory',
    '/functions/v1/due-diligence-start',
    '/functions/v1/deal-room-create',
  ]) {
    assert.equal(accountRequestAllowed(`https://example.supabase.co${blocked}`), false, blocked)
  }

  const routes = read('src/pages/dashboard/account/AccountRoutes.tsx')
  const views = read('src/pages/dashboard/account/views.tsx')
  for (const source of [routes, views]) {
    assert.equal(/from\('members'\)|from\('profiles'\)|from\('mandates'\)|from\('deal_rooms'\)|majlis_events|list_re_opportunities|due-diligence-start/.test(source), false)
  }
  const poisoned = presentAccountDeals([
    {
      id: 'a2000001-0000-4000-8000-000000000001',
      is_demo: true,
      sector: 'Energy transition',
      ask: 'Growth capital for a Saudi industrial services platform.',
      status: 'Diligence',
      company_name: 'Nahla Industrial Holding',
      contact_email: 'amal.desk@example.com',
      venue_name: 'Riyadh',
      starts_at: '2026-11-02',
    },
  ])
  assert.equal(JSON.stringify(poisoned).includes('Nahla'), false)
  assert.equal(JSON.stringify(poisoned).includes('amal.desk'), false)
  assert.equal(JSON.stringify(poisoned).includes('Riyadh'), false)
  const totals = presentAccountTotals({
    investment_usd: 0,
    founding_admitted_count: 0,
    founding_ksa_count: 0,
    founding_intl_count: 0,
    contact_email: 'amal.desk@example.com',
    company_name: 'Nahla Industrial Holding',
  })
  assert.equal(JSON.stringify(totals).includes('Nahla'), false)
  assert.equal(JSON.stringify(totals).includes('amal.desk'), false)
})
