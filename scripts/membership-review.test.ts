import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { hasBoardFooter, hasSubstantiveBody, marketingSignatureHit } from '../supabase/functions/_shared/mail.ts'
import {
  declinedMail,
  deskRequestMail,
  membershipLiveMail,
  needsInfoMail,
  requestReceivedMail,
  reviewCallMail,
  waitlistMail,
} from '../supabase/functions/_shared/membership_copy.ts'
import { letterCarriesBooking, lettersForTransition, maybeCaptureApproved } from '../supabase/functions/_shared/membership_dispatch.ts'
import { captureApproved } from '../supabase/functions/_shared/server_capture.ts'
import {
  EMPTY_CHECKLIST,
  SCALE_BAND_IDS,
  checklistFromRecord,
  gateCopy,
  membershipLine,
  missingRequired,
  requiredDoneCount,
  sendsBookingLink,
  statusCopy,
  stepDone,
  transitionAllowed,
} from '../supabase/functions/_shared/membership_steps.ts'
import { buildUtmLink } from '../src/lib/utmLink.ts'
import { setAnalyticsConsentForTests, setAnalyticsEnabledForTests, setAnalyticsSinkForTests, track } from '../src/lib/analytics.ts'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const ready = checklistFromRecord({
  email_verified_at: '2026-09-01T00:00:00.000Z',
  role: 'chairperson',
  company_name: 'Example Holdings',
  job_title: 'Chief Executive',
  linkedin_url: 'https://www.linkedin.com/in/example-chair',
  scale_kind: 'turnover',
  scale_band: 't_50m_to_250m',
  sector_tags: ['Energy transition'],
  statement: 'A'.repeat(200),
})

test('seven required steps gate the request and optional items do not', () => {
  const partial = checklistFromRecord({
    email_verified_at: '2026-09-30T00:00:00.000Z',
    role: 'chairperson',
    board_seats: 'Board member',
    company_name: 'Example Holdings',
    job_title: 'Chief Executive',
    linkedin_url: 'https://www.linkedin.com/in/example-chair',
    scale_kind: 'turnover',
    scale_band: 't_50m_to_250m',
  })
  assert.equal(requiredDoneCount(partial), 5)
  assert.deepEqual(
    missingRequired(partial).map((item) => item.label),
    ['Sector and Vision 2030 tags', 'Short statement'],
  )
  const gate = gateCopy(partial, 'open', null)
  assert.equal(gate.enabled, false)
  assert.equal(gate.helper, '2 steps left:')
  assert.equal(gateCopy(ready, 'open', null).enabled, true)
  assert.equal(stepDone(ready, 'cr_number'), false)
  assert.equal(stepDone({ ...ready, crNumber: '1234567890' }, 'cr_number'), true)
  assert.equal(stepDone({ ...EMPTY_CHECKLIST, statement: 'short' }, 'statement'), false)
  const cooling = gateCopy(ready, 'declined', '2027-03-29T00:00:00.000Z', Date.parse('2026-10-01T00:00:00.000Z'))
  assert.equal(cooling.enabled, false)
  assert.match(cooling.helper, /29 Mar 2027/)
})

test('status copy stays internal on timing and never names a booking host', () => {
  const submitted = statusCopy('submitted', '2026-09-30T08:00:00.000Z', null)
  assert.match(submitted, /Request received on 30 Sep 2026/)
  assert.match(submitted, /no fixed response time/)
  assert.match(statusCopy('review_call', null, null), /emailed you a private link/)
  const blob = [
    submitted,
    statusCopy('in_review', null, null),
    statusCopy('needs_info', null, null),
    statusCopy('waitlisted', null, null),
    statusCopy('declined', null, '2027-03-29T00:00:00.000Z'),
  ].join('\n')
  assert.equal(/calendar\.app\.google|https?:\/\//i.test(blob), false)
  assert.equal(blob.includes('\u2014') || blob.includes('\u2013'), false)
})

test('only review call carries the booking link, and the live letter has no credential', () => {
  const person = {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'ada@example.com',
    fullName: 'Ada Example',
    role: 'chairperson',
    region: 'ksa_gcc',
    company: 'Example Holdings',
    headline: 'Chief Executive',
    vouch: '',
    analyticsId: 'ph-person',
    submittedAt: '2026-09-01T00:00:00.000Z',
  }
  const booking = 'https://booking.example/slot'
  const call = lettersForTransition({
    to: 'review_call',
    person,
    bookingUrl: booking,
    question: '',
    declinedUntil: null,
    foundingNumber: null,
    tier: null,
  })
  assert.equal(call.error, undefined)
  assert.equal(letterCarriesBooking(call.letters, booking), true)
  assert.equal(sendsBookingLink('approved'), false)
  assert.equal(sendsBookingLink('review_call'), true)
  const missing = lettersForTransition({
    to: 'review_call',
    person,
    bookingUrl: '',
    question: '',
    declinedUntil: null,
    foundingNumber: null,
    tier: null,
  })
  assert.match(missing.error || '', /PRIVATE_BOOKING_LINK/)
  const live = membershipLiveMail({
    dashboardUrl: 'https://boardarabia.com/dashboard?utm_source=email&utm_medium=email&utm_campaign=membership-live',
    foundingNumber: 7,
    tier: 'founding',
  })
  assert.match(live.text, /Founding Member No\. 7/)
  assert.equal(/password|one-time|otp|temporary/i.test(live.text + live.html), false)
  assert.equal(live.text.includes(booking), false)
  const member = membershipLiveMail({
    dashboardUrl: 'https://boardarabia.com/dashboard',
    foundingNumber: null,
    tier: 'member',
  })
  assert.match(member.text, /Your Member seat is live/)
  for (const mail of [live, member, requestReceivedMail({ dashboardUrl: 'https://boardarabia.com/dashboard/membership' }), needsInfoMail({ question: 'Which board?', dashboardUrl: 'https://boardarabia.com/dashboard/membership' }), waitlistMail({ dashboardUrl: 'https://boardarabia.com/dashboard' }), declinedMail({ askAgain: '29 Mar 2027', dashboardUrl: 'https://boardarabia.com/dashboard' }), reviewCallMail({ bookingUrl: booking })]) {
    assert.equal(hasBoardFooter(mail.text, mail.html), true)
    assert.equal(hasSubstantiveBody(mail.text, mail.html), true)
    assert.equal(marketingSignatureHit(mail.text, mail.html), null)
    assert.equal(mail.text.includes('\u2014') || mail.html.includes('\u2013'), false)
  }
  const desk = deskRequestMail({
    name: 'Ada Example',
    role: 'Chairperson',
    region: 'KSA',
    company: 'Example Holdings',
    vouch: '',
    adminUrl: 'https://boardarabia.com/admin/review/11111111-1111-4111-8111-111111111111',
  })
  assert.equal(/capacity|statement|phone|cr number/i.test(desk.text), false)
})

test('approved capture stays off without consent or the flag', async () => {
  const posts: string[] = []
  const post = async (_url: string, body: string) => {
    posts.push(body)
    return true
  }
  assert.equal(await captureApproved({ enabled: 'true', key: 'phc_testkeyvalue' }, { analyticsId: null, tier: 'founding', seat: 'ksa', daysSinceRequest: 3 }, post), 'skipped')
  assert.equal(await captureApproved({ enabled: 'false', key: 'phc_testkeyvalue' }, { analyticsId: 'ph-person', tier: 'member', seat: 'intl', daysSinceRequest: 4 }, post), 'skipped')
  assert.equal(
    await maybeCaptureApproved({ enabled: 'true', key: 'phc_testkeyvalue', host: 'https://eu.i.posthog.com' }, {
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'ada@example.com',
      fullName: 'Ada Example',
      role: 'chairperson',
      region: 'intl',
      company: 'Example Holdings',
      headline: 'Chief Executive',
      vouch: '',
      analyticsId: 'ph-person',
      submittedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    }, 'member', 'intl', post),
    'sent',
  )
  assert.equal(posts.length, 1)
  const body = JSON.parse(posts[0] || '{}') as { event?: string; properties?: Record<string, unknown> }
  assert.equal(body.event, 'approved')
  assert.equal(body.properties?.tier, 'member')
  assert.equal(body.properties?.seat_side, 'intl')
  assert.equal(body.properties?.scale_band, undefined)
  assert.equal(JSON.stringify(body).includes('ada@example.com'), false)
  assert.equal(JSON.stringify(body).includes('statement'), false)
})

test('checklist analytics drops the band, capacity, phone, CR, and statement', () => {
  const seen: string[] = []
  setAnalyticsEnabledForTests(true)
  setAnalyticsConsentForTests(true)
  setAnalyticsSinkForTests((event) => seen.push(event))
  track('checklist_step_done', { step: 'scale_band', required: true, steps_done: 5, path: '/dashboard/membership' })
  track('checklist_step_done', { step: 'statement', required: true, steps_done: 6, statement: 'A secret note for the desk' })
  track('checklist_step_done', { step: 'scale_band', scale_band: 't_over_1bn', required: true, steps_done: 4 })
  track('request_full_membership', { days_since_verified: 3, optional_done_count: 1, phone: '0500000000', cr_number: '1234567890' })
  assert.deepEqual(seen, ['checklist_step_done'])
  setAnalyticsEnabledForTests(null)
  setAnalyticsConsentForTests(null)
  setAnalyticsSinkForTests(null)
})

test('migration keeps the seat cap, the tier, and the founding number', () => {
  const sql = read('supabase/migrations/20261105120000_membership_review.sql')
  assert.match(sql, /p_tier text default 'founding'/)
  assert.match(sql, /p_candidate boolean default false/)
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('board-arabia-seat-'/)
  assert.match(sql, /if taken >= 50 then/)
  assert.match(sql, /founding_number/)
  assert.match(sql, /next_no > 100/)
  assert.match(sql, /must_password := false/)
  assert.match(sql, /member_status := 'active'/)
  assert.match(sql, /interval '180 days'/)
  assert.match(sql, /interval '30 days'/)
  assert.match(sql, /checklist_step/)
  assert.equal(/alter table public\.applications/i.test(sql), false)
  for (const id of SCALE_BAND_IDS) assert.match(sql, new RegExp(id))
  assert.equal(/calendar\.app\.google|sk_live|eyJ/i.test(sql), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(sql), false)
  assert.equal(sql.includes('\u2014') || sql.includes('\u2013'), false)
  assert.equal(transitionAllowed('in_review', 'review_call'), true)
  assert.equal(transitionAllowed('approved', 'declined'), false)
  assert.equal(transitionAllowed('submitted', 'approved'), false)
})

test('review function reads the booking secret and does not return it', () => {
  const source = read('supabase/functions/review-membership/index.ts')
  assert.match(source, /PRIVATE_BOOKING_LINK/)
  assert.match(source, /p_candidate:\s*true|p_tier/)
  assert.match(source, /claim_founding_seat|transition_candidate/)
  assert.equal(source.includes('calendar.app.google'), false)
  assert.equal(source.includes('booking_url'), false)
  assert.match(source, /founding_number: foundingNumber/)
  const apply = read('src/pages/ApplyPage.tsx')
  assert.match(apply, /submitApplication\(/)
  assert.match(apply, /application_submitted/)
  assert.equal(/register-candidate/.test(apply), false)
})

test('/admin/applications renders the legacy list', async () => {
  const app = read('src/App.tsx')
  assert.match(app, /path="applications" element=\{<ApplicationsPage \/>\}/)
  assert.equal(app.includes('applications/legacy'), false)
  assert.equal(app.includes('applications/:candidateId'), false)
  const html = await renderAdmin('/admin/applications', 'ApplicationsPage')
  assert.match(html, /<h1[^>]*>Applications<\/h1>/)
  assert.match(html, /Accept, reject, or admit/)
  assert.match(html, /No applications yet/)
  assert.equal(html.includes('Membership requests'), false)
  assert.equal(html.includes('Legacy applications'), false)
})

test('/admin/review renders the new queue', async () => {
  const app = read('src/App.tsx')
  assert.match(app, /path="review" element=\{<MembershipQueuePage \/>\}/)
  assert.match(app, /path="review\/:candidateId" element=\{<MembershipDetailPage \/>\}/)
  const desk = read('src/pages/admin/MembershipDesk.tsx')
  const dispatch = read('supabase/functions/_shared/membership_dispatch.ts')
  const remind = read('supabase/functions/remind-membership/index.ts')
  assert.equal(desk.includes('/admin/applications'), false)
  assert.match(desk, /\/admin\/review\/\$\{row\.userId\}/)
  assert.match(desk, /to="\/admin\/review"/)
  assert.match(dispatch, /\/admin\/review\/\$\{userId\}/)
  assert.equal(dispatch.includes('/admin/applications/'), false)
  assert.match(remind, /\/admin\/review\/\$\{row\.user_id\}/)
  assert.equal(remind.includes('/admin/applications/'), false)
  const html = await renderAdmin('/admin/review', 'MembershipQueuePage')
  assert.match(html, /data-screen="membership-queue"/)
  assert.match(html, /Membership requests/)
  assert.match(html, /Loading the queue/)
  assert.equal(html.includes('Accept, reject, or admit'), false)
  assert.equal(html.includes('Legacy applications'), false)
})

async function renderAdmin(path: string, exportName: 'ApplicationsPage' | 'MembershipQueuePage') {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const pages = (await vite.ssrLoadModule('/src/pages/admin/MembershipPages.tsx')) as Record<string, () => ReactNode>
    const legacy = (await vite.ssrLoadModule('/src/pages/admin/ApplicationsPage.tsx')) as {
      ApplicationsPage: () => ReactNode
    }
    const preview = (await vite.ssrLoadModule('/src/pages/admin/context.tsx')) as {
      AdminPreview: (props: { room: Record<string, unknown>; children: ReactNode }) => ReactNode
    }
    const View = exportName === 'ApplicationsPage' ? legacy.ApplicationsPage : pages.MembershipQueuePage
    return renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          preview.AdminPreview,
          {
            room: {
              loading: false,
              apps: [],
              listError: '',
              panelFailed: {},
              session: null,
            },
          },
          createElement(View),
        ),
      ),
    )
  } finally {
    await vite.close()
  }
}

test('founding number line is member-only and campaign links carry UTMs', () => {
  assert.equal(membershipLine('founding', 7), 'You are Founding Member No. 7.')
  assert.equal(membershipLine('member', null), 'Your Member seat is live.')
  assert.equal(membershipLine('founding', null), '')
  const link = buildUtmLink({
    path: '/',
    source: 'LinkedIn',
    medium: 'Social',
    campaign: '2026-10-founding-100',
    content: 'post-01',
  })
  assert.equal(
    link,
    'https://boardarabia.com/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-10-founding-100&utm_content=post-01',
  )
})
