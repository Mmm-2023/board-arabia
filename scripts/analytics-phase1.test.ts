import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { attributionColumns, sanitizeTouch } from '../supabase/functions/_shared/attribution.ts'
import {
  acceptConsent,
  hashClientBucket,
  resetConsentRateMemory,
  type ConsentInsert,
} from '../supabase/functions/consent-log/handle.ts'
import { BANNER_VERSION, NOTICE_VERSION } from '../supabase/functions/_shared/consent_versions.ts'
import { ALLOWED_PROPERTIES, BANNED_PROPERTIES, sanitizeProperties } from '../src/lib/tracking/allowlist.ts'
import { buildAnonymousPayload, runCapture } from '../src/lib/tracking/capture.ts'
import { consentRecord, readConsent, shouldAsk } from '../src/lib/tracking/consent.ts'
import { planCapture, posthogScriptUrl } from '../src/lib/tracking/decide.ts'
import { engagementSnapshot, noteVisibility, startEngagement } from '../src/lib/tracking/engagement.ts'
import { analyticsEnabled, posthogKey, preconsentMode, readAnalyticsConfig } from '../src/lib/tracking/flags.ts'
import { applyStaffBrowserOptOut } from '../src/lib/tracking/staffOptOut.ts'
import { memoryTouch, observeVisit, resetTouchMemory } from '../src/lib/tracking/touch.ts'
import { CONSENT_COPY, PRIVACY_NOTICE_AR, PRIVACY_NOTICE_EN } from '../src/content/privacyNotice.ts'
import {
  setAnalyticsConsentForTests,
  setAnalyticsEnabledForTests,
  setAnalyticsSinkForTests,
  track,
} from '../src/lib/analytics.ts'

const root = new URL('..', import.meta.url)

function source(rel: string) {
  return readFileSync(new URL(rel, root), 'utf8')
}

const liveConfig = readAnalyticsConfig({
  VITE_ANALYTICS_ENABLED: 'true',
  VITE_ANALYTICS_PRECONSENT_MODE: 'anonymous_counts',
  VITE_POSTHOG_KEY: 'phc_testkeyvalue',
  VITE_POSTHOG_HOST: 'https://eu.i.posthog.com',
})

const offConfig = readAnalyticsConfig({})

function ctx(overrides: Partial<Parameters<typeof planCapture>[1]> = {}) {
  return {
    hostname: 'boardarabia.com',
    path: '/',
    search: '',
    webdriver: false,
    userAgent: 'Mozilla/5.0',
    noTrack: false,
    staffSession: false,
    consent: 'unknown' as const,
    ...overrides,
  }
}

test('analytics flag stays off unless the exact string true', () => {
  assert.equal(analyticsEnabled(undefined), false)
  assert.equal(analyticsEnabled('false'), false)
  assert.equal(analyticsEnabled('TRUE'), false)
  assert.equal(analyticsEnabled('true'), true)
  assert.equal(preconsentMode(undefined), 'anonymous_counts')
  assert.equal(preconsentMode('none'), 'none')
  assert.equal(posthogKey('phc_PLACEHOLDER'), null)
  assert.equal(posthogKey('phc_testkeyvalue'), 'phc_testkeyvalue')
  assert.match(source('.env.example'), /VITE_ANALYTICS_ENABLED=false/)
  assert.match(source('.env.example'), /VITE_POSTHOG_KEY=phc_PLACEHOLDER/)
  assert.match(source('.github/workflows/pages.yml'), /VITE_ANALYTICS_ENABLED: 'false'/)
})

test('flag off never calls PostHog and never touches storage', async () => {
  let fetched = 0
  let scripted = 0
  let stored = 0
  const plan = await runCapture(
    'page_view',
    { path: '/', phone: '+966500000000', turnover: '10m' },
    offConfig,
    ctx(),
    {
      randomId: () => {
        throw new Error('id')
      },
      nowIso: () => new Date(0).toISOString(),
      fetch: async () => {
        fetched += 1
      },
      loadScript: () => {
        scripted += 1
      },
      readAnalyticsId: () => {
        stored += 1
        return null
      },
      captureIdentified: () => {
        stored += 1
      },
    },
  )
  assert.equal(plan.kind, 'skip')
  assert.equal(fetched, 0)
  assert.equal(scripted, 0)
  assert.equal(stored, 0)
})

test('anonymous pre-consent uses a new id and no storage', async () => {
  const ids: string[] = []
  const bodies: string[] = []
  let scripted = 0
  let reads = 0
  const deps = {
    randomId: () => {
      const id = `id-${ids.length + 1}`
      ids.push(id)
      return id
    },
    nowIso: () => '2026-09-30T00:00:00.000Z',
    fetch: async (_url: string, body: string) => {
      bodies.push(body)
    },
    loadScript: () => {
      scripted += 1
    },
    readAnalyticsId: () => {
      reads += 1
      return 'stable'
    },
    captureIdentified: () => {
      reads += 1
    },
  }
  await runCapture('page_view', { path: '/', title: 'Home' }, liveConfig, ctx(), deps)
  await runCapture('page_view', { path: '/about', title: 'About' }, liveConfig, ctx(), deps)
  assert.deepEqual(ids, ['id-1', 'id-2'])
  assert.equal(scripted, 0)
  assert.equal(reads, 0)
  assert.equal(bodies.length, 2)
  const first = JSON.parse(bodies[0] ?? '{}') as { properties: Record<string, unknown>; distinct_id: string }
  const second = JSON.parse(bodies[1] ?? '{}') as { distinct_id: string }
  assert.notEqual(first.distinct_id, second.distinct_id)
  assert.equal(first.properties.$process_person_profile, false)
  assert.equal('$ip' in first.properties, false)
  assert.equal('ip' in first.properties, false)
  assert.equal(JSON.stringify(first).includes('$ip'), false)
})

test('property allowlist drops banned and unknown keys', () => {
  for (const name of BANNED_PROPERTIES) {
    assert.equal(ALLOWED_PROPERTIES.includes(name as (typeof ALLOWED_PROPERTIES)[number]), false)
  }
  const clean = sanitizeProperties({
    path: '/apply',
    phone: '+966500000000',
    turnover: 'band',
    fo_aum: 'band',
    aum_band: 'band',
    investable_capacity_usd: 5,
    capacity: '5',
    cr_number: '1010',
    statement: 'a long statement',
    statement_text: 'text',
    email: 'person@example.com',
    full_name: 'Person',
    company: 'Co',
    scale_band: '100m',
    mystery: 'drop me',
    $ip: '203.0.113.8',
  })
  assert.deepEqual(clean, { path: '/apply' })
  const payload = buildAnonymousPayload({
    apiKey: 'phc_testkeyvalue',
    event: 'page_view',
    distinctId: 'one',
    properties: clean,
    timestamp: '2026-09-30T00:00:00.000Z',
  })
  assert.equal(JSON.stringify(payload).includes('band'), false)
  assert.equal(JSON.stringify(payload).includes('example.com'), false)
})

test('exclusions skip capture', () => {
  assert.equal(planCapture(liveConfig, ctx({ hostname: 'localhost' }), 'page_view').kind, 'skip')
  assert.equal(planCapture(liveConfig, ctx({ path: '/admin' }), 'page_view').kind, 'skip')
  assert.equal(planCapture(liveConfig, ctx({ path: '/dashboard' }), 'page_view').kind, 'skip')
  assert.equal(planCapture(liveConfig, ctx({ webdriver: true }), 'page_view').kind, 'skip')
  assert.equal(planCapture(liveConfig, ctx({ userAgent: 'HeadlessChrome' }), 'page_view').kind, 'skip')
  assert.equal(planCapture(liveConfig, ctx({ search: '?ba_qa=1' }), 'page_view').kind, 'skip')
  assert.equal(planCapture(liveConfig, ctx({ noTrack: true }), 'page_view').kind, 'skip')
  assert.equal(planCapture(liveConfig, ctx({ staffSession: true }), 'page_view').kind, 'skip')
  assert.equal(planCapture(liveConfig, ctx({ consent: 'reject' }), 'page_view').kind, 'skip')
  const none = readAnalyticsConfig({
    VITE_ANALYTICS_ENABLED: 'true',
    VITE_ANALYTICS_PRECONSENT_MODE: 'none',
    VITE_POSTHOG_KEY: 'phc_testkeyvalue',
  })
  assert.equal(planCapture(none, ctx(), 'page_view').kind, 'skip')
  assert.equal(planCapture(none, ctx({ consent: 'accept' }), 'page_view').kind, 'identified')
  assert.equal(posthogScriptUrl('https://eu.i.posthog.com'), 'https://eu-assets.i.posthog.com/static/array.js')
})

test('engaged time ignores background tabs', () => {
  const start = 0
  let state = startEngagement(start)
  state = noteVisibility(state, false, 20_000)
  state = noteVisibility(state, true, 80_000)
  const snap = engagementSnapshot(state, 80_000)
  assert.equal(snap.engaged_seconds, 20)
  let idle = startEngagement(0)
  idle = noteVisibility(idle, true, 0)
  const idleSnap = engagementSnapshot(idle, 50_000)
  assert.equal(idleSnap.engaged_seconds, 30)
})

test('first touch stays in memory until accept and is never overwritten', () => {
  resetTouchMemory()
  const storage = throwingStore()
  const now = Date.parse('2026-09-30T08:00:00.000Z')
  observeVisit(
    'https://boardarabia.com/?utm_source=linkedin&utm_medium=social&utm_campaign=test-ft',
    'https://www.linkedin.com/feed',
    '',
    storage,
    now,
  )
  const held = memoryTouch()
  assert.equal(held.first?.source, 'linkedin')
  assert.equal(held.first?.medium, 'social')
  assert.equal(held.first?.campaign, 'test-ft')
  assert.equal(held.first?.referrer_host, 'www.linkedin.com')
  const jar = memoryStore()
  const consent = consentRecord('accept', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', now)
  const cookie = `ba_consent=${encodeURIComponent(
    ['v1', consent.choice, consent.consentId, consent.bannerVersion, consent.noticeVersion, String(consent.expiresAt), consent.analyticsId].join('|'),
  )}`
  observeVisit('https://boardarabia.com/?utm_source=google&utm_medium=cpc&utm_campaign=later', '', cookie, jar, now + 1000)
  assert.equal(memoryTouch().first?.source, 'linkedin')
  assert.equal(memoryTouch().last?.source, 'google')
  assert.equal(JSON.parse(jar.get(jar.keys().find((key) => key === 'ba_first_touch') || '{}') || '{}').source, 'linkedin')
  resetTouchMemory()
})

test('attribution columns drop email, phone, and unknown keys', () => {
  const now = Date.parse('2026-09-30T08:00:00.000Z')
  const columns = attributionColumns(
    {
      first_touch: {
        utm_source: 'LinkedIn',
        utm_medium: 'social',
        utm_campaign: 'test-ft',
        utm_content: 'post-01',
        gclid: 'click',
        email: 'person@example.com',
        phone: '+966500000000',
        referrer_host: 'www.linkedin.com',
        landing_path: '/',
        at: '2026-09-30T08:00:00.000Z',
      },
      last_touch: { source: 'email', medium: 'email', campaign: '2026-10-majlis-invite' },
      analytics_id: '33333333-3333-4333-8333-333333333333',
      turnover: 'secret band',
      statement: 'free text',
    },
    now,
  )
  assert.equal(columns.ft_source, 'linkedin')
  assert.equal(columns.ft_medium, 'social')
  assert.equal(columns.ft_campaign, 'test-ft')
  assert.equal(columns.lt_source, 'email')
  assert.equal(columns.analytics_id, '33333333-3333-4333-8333-333333333333')
  assert.equal(columns.attribution_version, 1)
  assert.equal('gclid' in columns, false)
  assert.equal(JSON.stringify(columns).includes('example.com'), false)
  assert.equal(JSON.stringify(columns).includes('9665'), false)
  assert.equal(JSON.stringify(columns).includes('secret'), false)
  const empty = attributionColumns({}, now)
  assert.deepEqual(empty, {})
  const dirty = sanitizeTouch({ source: 'person@example.com', medium: '+966500000000' }, now)
  assert.equal(dirty.source, null)
  assert.equal(dirty.medium, null)
})

test('consent log rejects extras and stores no ip or user agent', async () => {
  resetConsentRateMemory()
  const inserted: ConsentInsert[] = []
  const result = await acceptConsent(
    {
      consent_id: '44444444-4444-4444-8444-444444444444',
      choice: 'accept',
      banner_version: BANNER_VERSION,
      notice_version: NOTICE_VERSION,
      language: 'en',
      ip: '203.0.113.8',
      user_agent: 'Mozilla/5.0',
    },
    {
      now: () => Date.parse('2026-09-30T08:00:00.000Z'),
      bucket: await hashClientBucket('203.0.113.8'),
      userId: null,
      countForConsent: async () => 0,
      countGlobal: async () => 0,
      insert: async (row) => {
        inserted.push(row)
        return true
      },
    },
  )
  assert.equal(result.status, 200)
  assert.deepEqual(Object.keys(inserted[0] ?? {}).sort(), [
    'banner_version',
    'choice',
    'consent_id',
    'language',
    'notice_version',
    'user_id',
  ])
  assert.equal(JSON.stringify(inserted[0]).includes('203.0.113.8'), false)
  assert.equal(JSON.stringify(inserted[0]).includes('Mozilla'), false)
  const edge = source('supabase/functions/consent-log/index.ts') + source('supabase/functions/consent-log/handle.ts')
  assert.equal(edge.toLowerCase().includes('user-agent'), false)
  assert.equal(edge.toLowerCase().includes('user_agent'), false)
  const sql = source('supabase/migrations/20261102120000_consent_log.sql')
  assert.match(sql, /force row level security/i)
  assert.match(sql, /revoke all on table public\.consent_log from public, anon, authenticated/)
  assert.match(sql, /interval '13 months'/)
  assert.equal(/ip_address|user_agent/i.test(sql), false)
  assert.match(sql, /ft_source/)
  assert.match(sql, /analytics_id/)
  assert.match(source('supabase/functions/submit-application/index.ts'), /attributionColumns/)
})

test('consent cookie asks again after expiry or a new banner version', () => {
  const now = Date.parse('2026-09-30T08:00:00.000Z')
  assert.equal(shouldAsk('', now), true)
  const stored = consentRecord('reject', '55555555-5555-4555-8555-555555555555', null, now)
  const header = `ba_consent=${encodeURIComponent(
    ['v1', 'reject', stored.consentId, stored.bannerVersion, stored.noticeVersion, String(stored.expiresAt), ''].join('|'),
  )}`
  assert.equal(shouldAsk(header, now), false)
  assert.equal(readConsent(header, now)?.choice, 'reject')
  assert.equal(shouldAsk(header, stored.expiresAt + 1), true)
  const stale = header.replace(BANNER_VERSION, '2020-01-01')
  assert.equal(shouldAsk(stale, now), true)
  assert.deepEqual(applyStaffBrowserOptOut('', false).length, 2)
  assert.deepEqual(applyStaffBrowserOptOut('ba_track_pref=on', false), [])
})

test('track matches the PR 85 call site and stays dark without the flag', () => {
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
  assert.match(source('src/lib/analytics.ts'), /VITE_ANALYTICS_ENABLED/)
})

test('banner and notice copy is bilingual, equal weight, and has no dashes', () => {
  assert.equal(
    CONSENT_COPY.en.body,
    'We use analytics to understand how boardarabia.com is used and to improve it. With your permission we set cookies to measure visits, time on page and which campaigns brought you here. Without it we only count anonymous visits. Data is hosted in Frankfurt, Germany.',
  )
  assert.match(CONSENT_COPY.ar.body, /فرانكفورت/)
  assert.equal(CONSENT_COPY.en.accept, 'Accept')
  assert.equal(CONSENT_COPY.en.reject, 'Reject')
  assert.equal(CONSENT_COPY.ar.accept, 'موافق')
  assert.equal(CONSENT_COPY.ar.reject, 'رفض')
  const banner = source('src/components/ConsentBanner.tsx')
  const choiceUses = banner.match(/className="ba-consent-choice"/g) ?? []
  assert.equal(choiceUses.length, 2)
  assert.equal(banner.includes('ba-reveal'), false)
  assert.equal(banner.includes('ba-motion'), false)
  assert.equal(banner.includes('Reveal'), false)
  const css = source('src/index.css')
  assert.match(css, /\.ba-consent \{[\s\S]*opacity: 1;/)
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.ba-consent/)
  assert.equal(/html\.ba-motion[^{]*\.ba-consent/.test(css), false)
  const files = [
    source('src/content/privacyNotice.ts'),
    banner,
    source('src/pages/PrivacyPage.tsx'),
    source('src/pages/admin/SettingsPage.tsx'),
  ]
  for (const file of files) {
    assert.equal(file.includes('\u2014'), false)
    assert.equal(file.includes('\u2013'), false)
  }
  assert.equal(PRIVACY_NOTICE_EN.sections.length, 9)
  assert.equal(PRIVACY_NOTICE_AR.sections.length, 9)
  const en = JSON.stringify(PRIVACY_NOTICE_EN)
  const ar = JSON.stringify(PRIVACY_NOTICE_AR)
  for (const text of [en, ar]) {
    assert.match(text, /\[BOARD ARABIA LEGAL ENTITY\]/)
    assert.match(text, /\[TO CONFIRM\]/)
    assert.match(text, /\[TRANSFER SAFEGUARDS TO CONFIRM\]/)
    assert.match(text, /PostHog/)
    assert.match(text, /Supabase/)
    assert.match(text, /120/)
    assert.match(text, /13/)
  }
  assert.match(en, /SDAIA/)
  assert.match(ar, /سدايا/)
  assert.match(ar, /فرانكفورت/)
  assert.equal(source('index.html').toLowerCase().includes('posthog'), false)
})

function throwingStore() {
  return {
    getItem: () => {
      throw new Error('storage read')
    },
    setItem: () => {
      throw new Error('storage write')
    },
    removeItem: () => {
      throw new Error('storage remove')
    },
  }
}

function memoryStore() {
  const jar = new Map<string, string>()
  return {
    getItem: (key: string) => jar.get(key) ?? null,
    setItem: (key: string, value: string) => {
      jar.set(key, value)
    },
    removeItem: (key: string) => {
      jar.delete(key)
    },
    get: (key: string) => jar.get(key) ?? null,
    keys: () => [...jar.keys()],
  }
}
