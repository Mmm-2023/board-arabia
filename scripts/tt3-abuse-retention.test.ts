import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { idleAccountReminderMail } from '../supabase/functions/_shared/membership_copy.ts'
import {
  DISPOSABLE_EMAIL_DOMAINS,
  FREE_WEBMAIL_DOMAINS,
  domainListed,
} from '../supabase/functions/_shared/email_domains.ts'
import { nextRateHit } from '../supabase/functions/_shared/rate_limit.ts'
import { registerCandidate } from '../supabase/functions/_shared/candidate_flow.ts'
import {
  applicationExpired,
  classifyCandidate,
  consentExpired,
  memberAnonymiseDue,
} from '../supabase/functions/_shared/retention_plan.ts'
import { PRIVACY_NOTICE_EN } from '../src/content/privacyNotice.ts'
import { STAFF_DESTINATIONS } from '../src/shell/destinations.ts'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const NOW = new Date('2026-09-30T08:00:00.000Z')

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    now: () => NOW,
    pepper: 'test-pepper',
    turnstileSecret: 'test-secret',
    site: 'https://boardarabia.com',
    verifyTurnstile: async () => true,
    emailIsMember: async () => false,
    findCandidate: async () => null,
    findAuthUserId: async () => null,
    createAuthUser: async () => ({ userId: '11111111-1111-4111-8111-111111111111' }),
    insertCandidate: async () => ({}),
    issueCode: async () => 'ok' as const,
    voidLatestCode: async () => {},
    sendMail: async () => ({ ok: true, dryRun: true }),
    recordEvent: async () => {},
    claimInvite: async () => false,
    domainStatus: async () => 'ok' as const,
    mailboxOk: async () => true,
    consumeRegisterLimit: async () => 'ok' as const,
    ...overrides,
  }
}

function body(extra: Record<string, unknown> = {}) {
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

test('disposable domains block the address and free webmail is only a flag', () => {
  assert.equal(domainListed('mailinator.com', DISPOSABLE_EMAIL_DOMAINS), true)
  assert.equal(domainListed('spam.mailinator.com', DISPOSABLE_EMAIL_DOMAINS), true)
  assert.equal(domainListed('sub.yopmail.com', DISPOSABLE_EMAIL_DOMAINS), true)
  assert.equal(domainListed('example.com', DISPOSABLE_EMAIL_DOMAINS), false)
  assert.equal(domainListed('gmail.com', FREE_WEBMAIL_DOMAINS), true)
  assert.equal(domainListed('example.com', FREE_WEBMAIL_DOMAINS), false)
  const sql = read('supabase/migrations/20261111120000_abuse_retention.sql')
  for (const domain of DISPOSABLE_EMAIL_DOMAINS) {
    assert.equal(sql.includes(`'${domain}'`), true, domain)
  }
  assert.equal(sql.includes('example.com') && sql.includes("retired+'"), true)
  assert.equal(/\bBasic\b/.test(sql), false)
})

test('registration rate limit allows 3 an hour and 10 a day, then stops', () => {
  const hour = 60 * 60 * 1000
  let row = nextRateHit(null, 0, hour, 3)
  assert.equal(row.limited, false)
  row = nextRateHit({ windowStartMs: row.windowStartMs, hitCount: row.hitCount }, 1000, hour, 3)
  row = nextRateHit({ windowStartMs: row.windowStartMs, hitCount: row.hitCount }, 2000, hour, 3)
  assert.equal(row.hitCount, 3)
  assert.equal(row.limited, false)
  const blocked = nextRateHit({ windowStartMs: row.windowStartMs, hitCount: row.hitCount }, 3000, hour, 3)
  assert.equal(blocked.limited, true)
  const reset = nextRateHit({ windowStartMs: 0, hitCount: 3 }, hour + 1, hour, 3)
  assert.equal(reset.limited, false)
  assert.equal(reset.hitCount, 1)
  const day = nextRateHit({ windowStartMs: 0, hitCount: 10 }, 1000, 24 * hour, 10)
  assert.equal(day.limited, true)
})

test('register rejects a disposable address, a fast submit, and a full rate limit', async () => {
  const disposable = await registerCandidate(
    body({ email: 'ada@example.com' }),
    '203.0.113.8',
    deps({ domainStatus: async () => 'disposable' as const }),
  )
  assert.equal(disposable.status, 400)
  assert.equal(disposable.body.error_code, 'disposable_email')
  assert.match(String(disposable.body.error), /Disposable addresses are not accepted/)

  const fast = await registerCandidate(body({ form_started_at: NOW.getTime() - 500 }), '203.0.113.8', deps())
  assert.equal(fast.status, 400)
  assert.equal(fast.body.error_code, 'too_fast')

  const honeypot = await registerCandidate(body({ company_fax: 'filled' }), '203.0.113.8', deps())
  assert.equal(honeypot.status, 400)
  assert.equal(honeypot.body.error_code, 'rejected')

  const limited = await registerCandidate(
    body(),
    '203.0.113.8',
    deps({ consumeRegisterLimit: async () => 'limited' as const }),
  )
  assert.equal(limited.status, 429)
  assert.equal(limited.body.error_code, 'rate_limited')
})

test('retention classes keep a 119 day confirmed account and delete the older rows', () => {
  const confirmed = {
    requestState: 'open',
    emailVerifiedAt: daysAgo(119),
    decidedAt: null,
    remindedAt: null,
    isMember: false,
    isStaff: false,
  }
  assert.equal(classifyCandidate({ ...confirmed, createdAt: daysAgo(80) }, NOW), 'keep')
  assert.equal(classifyCandidate({ ...confirmed, createdAt: daysAgo(119) }, NOW), 'remind')
  assert.equal(classifyCandidate({ ...confirmed, createdAt: daysAgo(100) }, NOW), 'remind')
  assert.equal(
    classifyCandidate({ ...confirmed, createdAt: daysAgo(100), remindedAt: daysAgo(1) }, NOW),
    'keep',
  )
  assert.equal(classifyCandidate({ ...confirmed, createdAt: daysAgo(121) }, NOW), 'delete_never_submitted')
  assert.equal(
    classifyCandidate(
      {
        requestState: 'open',
        createdAt: daysAgo(8),
        emailVerifiedAt: null,
        decidedAt: null,
        remindedAt: null,
        isMember: false,
        isStaff: false,
      },
      NOW,
    ),
    'delete_unverified',
  )
  assert.equal(
    classifyCandidate(
      {
        requestState: 'declined',
        createdAt: daysAgo(400),
        emailVerifiedAt: daysAgo(400),
        decidedAt: daysAgo(400),
        remindedAt: null,
        isMember: false,
        isStaff: false,
      },
      NOW,
    ),
    'delete_decided',
  )
  assert.equal(
    classifyCandidate(
      {
        requestState: 'declined',
        createdAt: daysAgo(40),
        emailVerifiedAt: daysAgo(40),
        decidedAt: daysAgo(40),
        remindedAt: null,
        isMember: true,
        isStaff: false,
      },
      NOW,
    ),
    'keep',
  )
  assert.equal(applicationExpired('rejected', daysAgo(400), NOW, false), true)
  assert.equal(applicationExpired('rejected', daysAgo(30), NOW, false), false)
  assert.equal(applicationExpired('admitted', daysAgo(400), NOW, false), false)
  assert.equal(memberAnonymiseDue(daysAgo(800), false, null, NOW), true)
  assert.equal(memberAnonymiseDue(daysAgo(800), true, null, NOW), false)
  assert.equal(consentExpired(daysAgo(430), NOW), true)
  assert.equal(consentExpired(daysAgo(30), NOW), false)
})

test('invite return does not refill a decline and candidates get no invites', () => {
  const sql = read('supabase/migrations/20261111120000_abuse_retention.sql')
  assert.match(sql, /private\.return_applied_invite/)
  assert.match(sql, /status = 'applied'/)
  assert.match(sql, /email_verified_at is null/)
  assert.match(sql, /request_state = 'open'/)
  assert.match(sql, /request_state in \('declined', 'closed'\)/)
  assert.match(sql, /They do not take a founding seat and they receive no peer invites/)
  assert.equal(/insert into public\.members/i.test(sql), false)
  const review = read('supabase/functions/review-membership/index.ts')
  assert.equal(review.includes('return_applied_invite'), false)
  assert.equal(review.includes('release_member_invite'), false)
  const claim = read('supabase/functions/_shared/candidate_admin.ts')
  assert.match(claim, /status: 'applied'/)
  assert.match(claim, /spent here, when the invitee registers/)
})

test('retention job rejects an unset secret, supports dry_run, and has no schedule', () => {
  const fn = read('supabase/functions/retention-sweep/index.ts')
  const config = read('supabase/config.toml')
  const workflow = read('.github/workflows/retention-sweep.yml')
  assert.match(fn, /RETENTION_SWEEP_SECRET/)
  assert.match(fn, /x-retention-sweep/)
  assert.match(fn, /dry_run/)
  assert.match(fn, /if \(!secret/)
  assert.equal(fn.includes('SUPABASE_SERVICE_ROLE_KEY') && fn.includes('Authorization'), false)
  assert.match(config, /\[functions\.retention-sweep\]\s+verify_jwt = false/)
  assert.match(config, /An unset secret rejects every call/)
  assert.match(workflow, /-X POST/)
  assert.match(workflow, /x-retention-sweep/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.equal(workflow.includes('schedule:'), false)
  assert.equal(workflow.includes('cron:'), false)
  assert.match(fn, /candidate_events/)
  const mail = idleAccountReminderMail({ dashboardUrl: 'https://boardarabia.com/dashboard/membership' })
  assert.equal(/\bBasic\b/.test(mail.text), false)
  assert.equal(mail.text.includes('\u2014'), false)
  assert.equal(mail.text.includes('\u2013'), false)
  assert.match(mail.text, /One reminder only/)
  assert.match(mail.subject, /still open/)
})

test('privacy notice covers the account and tracking without the internal tier name', () => {
  const en = JSON.stringify(PRIVACY_NOTICE_EN)
  assert.equal(/\bBasic\b/.test(en), false)
  assert.equal(en.includes('\u2014'), false)
  assert.equal(en.includes('\u2013'), false)
  assert.match(en, /delete that account yourself/)
  assert.match(en, /120 days/)
  assert.match(en, /90 days/)
  assert.match(en, /7 days/)
  assert.match(en, /Site analytics are not the membership file/)
  assert.equal(/[\u0600-\u06FF]/.test(en), false)
  assert.equal(PRIVACY_NOTICE_EN.sections.length, 9)
})

test('review chips list all 8 states and the staff bar stays at 7 items', () => {
  const desk = read('src/pages/admin/MembershipDesk.tsx')
  for (const label of [
    'Submitted',
    'In review',
    'Needs info',
    'Review call',
    'Waitlisted',
    'Approved',
    'Declined',
    'Closed',
  ]) {
    assert.equal(desk.includes(label), true, label)
  }
  assert.match(desk, /data-state-chips/)
  assert.match(desk, /ba-state-chip-fade/)
  assert.match(desk, /role="tablist"/)
  assert.match(desk, /role="tab"/)
  assert.match(desk, /scrollIntoView/)
  assert.match(desk, /overflow-x-auto/)
  assert.match(desk, /h-11/)
  assert.equal(desk.includes('role="listbox"'), false)
  assert.equal(STAFF_DESTINATIONS.length, 6)
  assert.deepEqual(
    STAFF_DESTINATIONS.filter((item) => item.mobileTab === false).map((item) => item.label),
    ['Capacity', 'Settings'],
  )
  const css = read('src/index.css')
  assert.match(css, /grid-template-columns: 0\.72fr 1\.4fr 0\.86fr 0\.8fr 0\.7fr/)
  const shell = read('src/shell/AppShell.tsx')
  assert.match(shell, /grid-cols-5 shell-staff-tabs/)
  assert.equal(shell.includes('destinationCount + 1 === 7'), false)
})

test('delete account confirms, and members are refused', () => {
  const view = read('src/pages/dashboard/account/DeleteAccountView.tsx')
  const fn = read('supabase/functions/delete-candidate-account/index.ts')
  const sql = read('supabase/migrations/20261111120000_abuse_retention.sql')
  assert.match(view, /I understand this removes my account/)
  assert.match(view, /data-screen="delete-account"/)
  assert.equal(/\bBasic\b/.test(view), false)
  assert.match(fn, /prepare_candidate_delete/)
  assert.match(fn, /A full member account is not removed/)
  assert.match(sql, /return jsonb_build_object\('status', 'member'\)/)
  assert.match(sql, /delete from public\.candidate_events/)
  assert.match(sql, /delete from auth\.users/)
  const routes = read('src/pages/dashboard/account/AccountRoutes.tsx')
  assert.match(routes, /\/dashboard\/account\/delete/)
})
