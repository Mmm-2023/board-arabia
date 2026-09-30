import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { BANNED_PROPERTIES, sanitizeProperties } from '../src/lib/tracking/allowlist.ts'
import { track, setAnalyticsEnabledForTests, setAnalyticsSinkForTests, setAnalyticsConsentForTests } from '../src/lib/analytics.ts'
import {
  bucketCount,
  firstTouchChip,
  freshnessLine,
  isTestEmail,
  parseFunnel,
} from '../src/lib/marketing.ts'
import { legacyApprovedAt, maskedFunnel, rawFunnel, type CandidateCount, type LegacyCount } from '../src/lib/marketingCounts.ts'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../src/shell/destinations.ts'
import {
  cacheKey,
  errorBody,
  hogqlBundle,
  liveDecision,
  notLiveBody,
  parseStatsRequest,
  personalKeyOk,
  responseIsAggregate,
  shapeStats,
} from '../supabase/functions/marketing-stats/handle.ts'

function source(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const FROM = '2026-09-01T00:00:00.000Z'
const TO = '2026-10-01T00:00:00.000Z'

function legacy(partial: Partial<LegacyCount>): LegacyCount {
  return {
    email: 'guest@example.com',
    createdAt: '2026-09-02T00:00:00.000Z',
    status: 'accepted',
    admittedAt: null,
    memberCreatedAt: null,
    decisionAt: '2026-09-15T00:00:00.000Z',
    memberDemo: false,
    ftSource: null,
    ftMedium: null,
    staff: false,
    ...partial,
  }
}

test('two accepted legacy applications count as approved through the date fallback', () => {
  const apps = [
    legacy({ decisionAt: '2026-09-10T00:00:00.000Z', admittedAt: null, memberCreatedAt: null }),
    legacy({
      email: 'second@example.com',
      admittedAt: null,
      memberCreatedAt: '2026-09-12T00:00:00.000Z',
      decisionAt: null,
    }),
  ]
  assert.equal(legacyApprovedAt(apps[0]), '2026-09-10T00:00:00.000Z')
  assert.equal(legacyApprovedAt(apps[1]), '2026-09-12T00:00:00.000Z')
  assert.equal(legacyApprovedAt(legacy({ status: 'pending', decisionAt: '2026-09-10T00:00:00.000Z' })), null)
  assert.equal(legacyApprovedAt(legacy({ memberDemo: true, memberCreatedAt: '2026-09-12T00:00:00.000Z', decisionAt: null, admittedAt: null })), null)
  const raw = rawFunnel([], apps, [], FROM, TO, 'all', null)
  assert.equal(raw.legacy_approved, 2)
  assert.equal(raw.approved, 2)
  assert.equal(maskedFunnel(raw).legacy_approved, 'lt5')
  assert.equal(maskedFunnel(raw).approved, 'lt5')
  const hidden = rawFunnel([], apps, [], FROM, TO)
  assert.equal(hidden.legacy_approved, 0)
  const staff = rawFunnel([], [legacy({ staff: true }), legacy({ email: 'qa+test@example.com' })], [], FROM, TO, 'all', null)
  assert.equal(staff.legacy_approved, 0)
  const demo = rawFunnel(
    [],
    [legacy({ memberDemo: true, admittedAt: '2026-09-11T00:00:00.000Z' })],
    [],
    FROM,
    TO,
    'all',
    null,
  )
  assert.equal(demo.legacy_approved, 0)
})

test('candidate funnel steps and paid filter stay out of person fields', () => {
  const people: CandidateCount[] = [
    {
      email: 'ada@example.com',
      createdAt: '2026-09-03T00:00:00.000Z',
      emailVerifiedAt: '2026-09-04T00:00:00.000Z',
      submittedAt: '2026-09-08T00:00:00.000Z',
      approvedAt: '2026-09-20T00:00:00.000Z',
      ftSource: 'linkedin',
      ftMedium: 'paid_social',
      demo: false,
      staff: false,
    },
    {
      email: 'staff@example.com',
      createdAt: '2026-09-03T00:00:00.000Z',
      emailVerifiedAt: '2026-09-04T00:00:00.000Z',
      submittedAt: null,
      approvedAt: null,
      ftSource: 'email',
      ftMedium: 'email',
      demo: false,
      staff: true,
    },
  ]
  const all = rawFunnel(people, [], [], FROM, TO, 'all', null)
  assert.equal(all.form_sent, 1)
  assert.equal(all.email_verified, 1)
  assert.equal(all.full_requested, 1)
  assert.equal(all.candidate_approved, 1)
  const organic = rawFunnel(people, [], [], FROM, TO, 'organic', null)
  assert.equal(organic.form_sent, 0)
  const paid = rawFunnel(people, [legacy({ ftMedium: 'cpc', createdAt: '2026-09-05T00:00:00.000Z' })], [], FROM, TO, 'paid', null)
  assert.equal(paid.form_sent, 1)
  assert.equal(paid.legacy_applications, 1)
  assert.equal(bucketCount(4), 'lt5')
  assert.equal(bucketCount(0), 0)
  assert.equal(bucketCount(5), 5)
})

test('marketing funnel SQL is staff only, empty campaigns, and buckets under 5', () => {
  const sql = source('supabase/migrations/20261107120000_marketing_funnel.sql')
  assert.match(sql, /security definer/)
  assert.match(sql, /if auth\.uid\(\) is null or not private\.is_staff\(\)/)
  assert.match(sql, /raise exception 'forbidden'/)
  assert.match(sql, /private\.marketing_bucket/)
  assert.match(sql, /'"lt5"'::jsonb/)
  assert.match(sql, /private\.legacy_approved_at/)
  assert.match(sql, /p_admitted_at/)
  assert.match(sql, /m\.created_at/)
  assert.match(sql, /p_status = 'accepted'/)
  assert.match(sql, /m\.is_demo = false/)
  assert.match(sql, /staff_users/)
  assert.match(sql, /checklist_complete/)
  assert.match(sql, /email_verified_at/)
  assert.match(sql, /'legacy'/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /revoke all on table public\.marketing_campaigns from public, anon, authenticated/)
  assert.match(sql, /grant select on table public\.marketing_campaigns to authenticated/)
  assert.equal(/insert into public\.marketing_campaigns/i.test(sql), false)
  assert.equal(/grant insert/i.test(sql), false)
  assert.equal(/for insert/i.test(sql), false)
  assert.match(sql, /marketing_campaigns_select_staff/)
  assert.match(sql, /revoke all on table public\.marketing_stats_cache from public, anon, authenticated/)
  assert.doesNotMatch(sql, /c\.scale_band|c\.phone|c\.statement|c\.cr_number|a\.turnover|a\.fo_aum|a\.investable_capacity|a\.phone/)
  assert.match(sql, /detail->>'step'/)
})

test('only the TR-3 migration number is 20261107120000', () => {
  const files = readdirSync(new URL('../supabase/migrations', import.meta.url))
  const tr3 = files.filter((name) => name.startsWith('20261107120000'))
  assert.deepEqual(tr3, ['20261107120000_marketing_funnel.sql'])
  const later = files.filter((name) => /^\d{14}/.test(name) && name.slice(0, 14) > '20261107120000')
  assert.deepEqual(later, [
    '20261108120000_re_regions.sql',
    '20261114120000_fixes6_delete_avatars_samples.sql',
  ])
})

test('marketing-stats stays not_live without the read key and returns aggregates only', () => {
  assert.equal(liveDecision({ enabled: 'false', personalKey: 'phx_abcdefghijklmnopqrst', projectId: '12' }), 'not_live')
  assert.equal(liveDecision({ enabled: 'true', personalKey: '', projectId: '12' }), 'not_live')
  assert.equal(liveDecision({ enabled: 'true', personalKey: 'phc_abcdefghijklmnopqrst', projectId: '12' }), 'not_live')
  assert.equal(personalKeyOk('phc_abcdefghijklmnopqrst'), false)
  assert.equal(liveDecision({ enabled: 'true', personalKey: 'phx_abcdefghijklmnopqrst', projectId: '12' }), 'live')
  assert.deepEqual(notLiveBody(), { status: 'not_live' })
  const parsed = parseStatsRequest({ from: FROM, to: TO, channel: 'paid' }, new Date('2026-09-30T00:00:00.000Z'))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const queries = hogqlBundle(parsed.value)
  assert.match(queries.visits, /event = 'page_view'/)
  assert.equal(queries.visits.includes('phx_'), false)
  assert.equal(cacheKey(parsed.value).includes('@'), false)
  const body = shapeStats(
    {
      visits: { results: [[3]] },
      unique_visitors: { results: [[8]] },
      register_clicks: { results: [[0]] },
      events_last_24h: { results: [[0]] },
      series: { results: [['2026-09-02', 6]] },
      countries: { results: [['Saudi Arabia', 9]] },
      cities: { results: [['Riyadh', 6], ['Jeddah', 2], ['Dammam', 1]] },
      pages: { results: [['/', 20, 8, 30, 40, 10, 20, 4]] },
      sources: { results: [['linkedin', 'social', 12]] },
    },
    '2026-09-30T09:00:00.000Z',
  )
  assert.equal(body.visits, 'lt5')
  assert.equal(body.unique_visitors, 8)
  assert.equal(body.cities.some((row) => row.label === 'Other'), true)
  assert.equal(body.cities.some((row) => row.label === 'Jeddah'), false)
  assert.equal(responseIsAggregate(body), true)
  assert.equal(responseIsAggregate({ status: 'ok', email: 'ada@example.com' }), false)
  assert.equal(responseIsAggregate({ status: 'ok', note: 'phx_abcdefghijklmnopqrst' }), false)
  assert.equal(errorBody('2026-09-30T09:00:00.000Z').message.includes('could not'), true)
  const bad = parseStatsRequest({ from: "2026-09-01T00:00:00.000Z'; drop table", to: TO }, new Date('2026-09-30T00:00:00.000Z'))
  assert.equal(bad.ok, false)
})

test('P5 allowlist still drops financial band, phone, CR, and statement', () => {
  const seen: string[] = []
  setAnalyticsEnabledForTests(true)
  setAnalyticsConsentForTests(true)
  setAnalyticsSinkForTests((event) => seen.push(event))
  track('checklist_step_done', { step: 'scale_band', required: true, steps_done: 4, path: '/dashboard/membership' })
  track('checklist_step_done', { step: 'statement', statement: 'A secret note', required: true, steps_done: 6 })
  track('checklist_step_done', { step: 'phone', phone: '+966500000000', required: false, steps_done: 7 })
  track('checklist_step_done', { step: 'cr_number', cr_number: '1010101010', required: false, steps_done: 7 })
  track('checklist_step_done', { step: 'capacity', investable_capacity: 10, required: false, steps_done: 7 })
  assert.deepEqual(seen, ['checklist_step_done'])
  const clean = sanitizeProperties({
    path: '/apply',
    scale_band: 't_over_1bn',
    statement: 'hello',
    phone: '+966500000000',
    cr_number: '1010101010',
    capacity: 10,
    turnover: '10m',
    email: 'ada@example.com',
  })
  assert.deepEqual(clean, { path: '/apply' })
  for (const key of ['scale_band', 'statement', 'phone', 'cr_number', 'capacity', 'turnover'] as const) {
    assert.equal(BANNED_PROPERTIES.includes(key), true)
  }
  setAnalyticsSinkForTests(null)
  setAnalyticsEnabledForTests(null)
  setAnalyticsConsentForTests(null)
})

test('first touch chip is source and medium, and hides when empty', async () => {
  assert.equal(firstTouchChip('linkedin', 'social'), 'linkedin / social')
  assert.equal(firstTouchChip('LinkedIn', 'Paid_Social'), 'linkedin / paid_social')
  assert.equal(firstTouchChip(null, null), null)
  assert.equal(firstTouchChip('ada@example.com', 'social'), null)
  assert.equal(isTestEmail('qa+test@example.com', null), true)
  assert.equal(isTestEmail('contest@example.com', null), false)
  assert.equal(isTestEmail('guest@example.com'), true)
  assert.equal(isTestEmail('qa+test@example.com'), true)
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const desk = (await vite.ssrLoadModule('/src/pages/admin/MembershipDesk.tsx')) as {
      MembershipDetailView: (props: Record<string, unknown>) => ReactNode
    }
    const withChip = detail({ firstTouch: 'linkedin / social' })
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(desk.MembershipDetailView, withChip)))
    assert.match(html, /data-chip="first-touch"/)
    assert.match(html, /linkedin \/ social/)
    const hidden = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(desk.MembershipDetailView, detail({}))))
    assert.equal(hidden.includes('data-chip="first-touch"'), false)
    assert.equal(hidden.includes('linkedin / social'), false)
  } finally {
    await vite.close()
  }
})

test('home card and marketing nav stay secondary, with no public route edit', async () => {
  assert.equal(STAFF_DESTINATIONS.length, 6)
  assert.equal(STAFF_SECONDARY[0]?.label, 'Marketing')
  assert.equal(STAFF_SECONDARY[0]?.to, '/admin/marketing')
  assert.equal(STAFF_DESTINATIONS.some((item) => item.label === 'Marketing'), false)
  const cardSource = source('src/pages/admin/MarketingHomeCard.tsx')
  assert.match(cardSource, /Marketing, last 7 days/)
  assert.match(cardSource, /Open Marketing/)
  assert.match(cardSource, /\/admin\/marketing\?range=7/)
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const cardMod = (await vite.ssrLoadModule('/src/pages/admin/MarketingHomeCard.tsx')) as {
      MarketingHomeCardView: (props: Record<string, unknown>) => ReactNode
    }
    const card = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(cardMod.MarketingHomeCardView, {
          loading: false,
          error: false,
          visits: 'Not live yet',
          registrations: '18',
          source: 'linkedin / social',
        }),
      ),
    )
    assert.match(card, /Marketing, last 7 days/)
    assert.match(card, /Open Marketing/)
    assert.match(card, /href="\/admin\/marketing\?range=7"/)
  } finally {
    await vite.close()
  }
  const app = source('src/App.tsx')
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.match(app, /path="marketing"/)
  assert.equal(source('src/pages/LandingPage.tsx').includes('/admin/marketing'), false)
  assert.equal(source('src/components/Nav.tsx').includes('/admin/marketing'), false)
  assert.equal(source('src/App.tsx').includes('tr3Preview'), false)
  assert.equal(source('src/main.tsx').includes('tr3Preview'), false)
  assert.equal(source('index.html').includes('tr3Preview'), false)
  for (const file of ['src/shell/tr3Preview.tsx', 'scripts/capture-tr3.mjs']) {
    const emails = source(file).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
    for (const email of emails) assert.match(email, /@example\.com$/, email)
  }
  assert.match(source('.env.example'), /POSTHOG_PERSONAL_API_KEY=/)
  assert.equal(source('.env.example').includes('phx_'), false)
  assert.match(source('.github/workflows/pages.yml'), /VITE_ANALYTICS_ENABLED: 'false'/)
  const label = freshnessLine(new Date('2026-09-30T06:00:00.000Z'))
  assert.match(label, /09:00 AST/)
  assert.equal(label.includes('\u2014'), false)
  assert.equal(label.includes('\u2013'), false)
})

test('marketing UI copy has no em dash, en dash, or the word Basic', () => {
  const files = [
    'src/pages/admin/MarketingView.tsx',
    'src/pages/admin/MarketingPage.tsx',
    'src/pages/admin/MarketingHomeCard.tsx',
    'src/lib/marketing.ts',
    'src/shell/tr3Preview.tsx',
    'scripts/capture-tr3.mjs',
  ]
  for (const file of files) {
    const text = source(file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
    assert.equal(/\bBasic\b/.test(text), false, file)
  }
  const parsed = parseFunnel({
    channel: 'all',
    funnel: {
      form_sent: 0,
      email_verified: 'lt5',
      legacy_applications: 0,
      checklist_complete: 0,
      full_requested: 0,
      approved: 6,
      legacy_approved: 2,
    },
    checklist: [{ step: 'scale_band', count: 3 }],
    sources: [{ source: 'linkedin', medium: 'social', kind: 'organic', line: 'candidate', registrations: 2, approved: 0 }],
  })
  assert.equal(parsed?.funnel.email_verified, 'lt5')
  assert.equal(parsed?.checklist[0]?.count, 'lt5')
  assert.equal(parsed?.sources[0]?.registrations, 'lt5')
  assert.equal(JSON.stringify(parsed).includes('t_over'), false)
})

function detail(extra: Record<string, unknown>) {
  const props = {
    detail: {
      userId: '1',
      name: 'Example Chair',
      email: 'chair@example.com',
      role: 'chairperson',
      region: 'ksa_gcc',
      company: 'Example Holdings',
      title: 'Chief Executive',
      website: 'https://example.com',
      linkedin: 'https://www.linkedin.com/in/example-chair',
      statement: 'A short statement.',
      crNumber: '',
      referral: '',
      phone: '',
      vouch: '',
      state: 'in_review',
      domainMatch: false,
      linkedinChecked: false,
      crChecked: false,
      seatsLeft: 'Founding places left: Saudi Arabia 48, International 50.',
      events: [],
      notes: [],
      ...extra,
    } satisfies DeskDetail,
    seat: 'ksa' as const,
    tier: 'founding' as const,
    reason: 'fit',
    note: '',
    question: '',
    busy: false,
    error: '',
    confirm: null,
    onSeat: () => {},
    onTier: () => {},
    onReason: () => {},
    onNote: () => {},
    onQuestion: () => {},
    onAction: () => {},
    onTick: () => {},
    onConfirm: () => {},
    onCancelConfirm: () => {},
  }
  return props
}
