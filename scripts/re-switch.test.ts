import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createServer } from 'vite'
import { chromium, type Page } from 'playwright-core'
import { RE_TICKET_BANDS } from '../src/lib/reRedaction.ts'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'

function chromePath() {
  const resolved = resolveChromePath()
  if (resolved) return resolved
  for (const candidate of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

test('real estate keeps partners and roles query values and a segmented switch', () => {
  const page = read('src/pages/dashboard/RealEstatePage.tsx')
  const board = read('src/pages/dashboard/RealEstateBoard.tsx')
  const redirects = read('src/shell/redirects.ts')
  assert.match(page, /view === 'partners' \? 'partners' : view === 'roles' \? 'roles'/)
  assert.match(page, /nextParams\.set\('view', 'partners'\)/)
  assert.match(page, /nextParams\.set\('view', 'roles'\)/)
  assert.match(page, /nextParams\.delete\('view'\)/)
  assert.equal(page.includes("set('view', 'firms')"), false)
  assert.equal(page.includes("set('view', 'board-roles')"), false)
  assert.match(board, /label: 'Opportunities'/)
  assert.match(board, /label: 'Firms'/)
  assert.match(board, /label: 'Board roles'/)
  assert.equal(board.includes('Real estate firms'), false)
  assert.match(board, /data-re-segment/)
  assert.match(board, /role="tablist"/)
  assert.match(board, /onKeyDown=\{onTabKey\}/)
  assert.equal(board.includes('rounded-full'), false)
  assert.match(read('src/shell/SectionTabs.tsx'), /rounded-full/)
  assert.match(read('src/pages/dashboard/DealsLayout.tsx'), /SectionTabs/)
  assert.match(read('src/shell/destinations.ts'), /label: 'Real estate', to: '\/dashboard\/deals\/real-estate'/)
  assert.match(redirects, /'\/dashboard\/real-estate': '\/dashboard\/deals\/real-estate'/)
  for (const file of [page, board]) {
    assert.equal(file.includes('\u2014'), false)
    assert.equal(file.includes('\u2013'), false)
    assert.equal(/\bdesk\b/i.test(file), false)
    assert.equal(/\bsponsor\b/i.test(file), false)
  }
})

test('deep links open the matching real estate panel', async () => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const pageMod = await vite.ssrLoadModule('/src/pages/dashboard/RealEstatePage.tsx')
    const layoutMod = await vite.ssrLoadModule('/src/pages/dashboard/DealsLayout.tsx')
    const cases = [
      { href: '/dashboard/deals/real-estate', tab: 'opportunities', label: 'Opportunities' },
      { href: '/dashboard/deals/real-estate?view=partners', tab: 'partners', label: 'Firms' },
      { href: '/dashboard/deals/real-estate?view=roles', tab: 'roles', label: 'Board roles' },
      { href: '/dashboard/deals/real-estate?view=firms', tab: 'opportunities', label: 'Opportunities' },
      { href: '/dashboard/deals/real-estate?view=board-roles', tab: 'opportunities', label: 'Opportunities' },
    ]
    for (const entry of cases) {
      const html = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: [entry.href] },
          createElement(
            Routes,
            null,
            createElement(
              Route,
              { path: '/dashboard/deals', element: createElement(layoutMod.DealsLayout) },
              createElement(Route, {
                path: 'real-estate',
                element: createElement(pageMod.RealEstatePage),
              }),
            ),
          ),
        ),
      )
      assert.match(html, new RegExp(`data-re-panel="${entry.tab}"`), entry.href)
      assert.match(html, /data-re-segment/)
      assert.match(html, /data-section-tabs/)
      assert.match(html, /href="\/dashboard\/deals\/real-estate"/)
      assert.equal((html.match(/data-re-panel=/g) || []).length, 1, entry.href)
      const selected = new RegExp(
        `data-re-tab="${entry.tab}"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-re-tab="${entry.tab}"`,
      )
      assert.match(html, selected, entry.href)
      assert.match(html, new RegExp(`>${entry.label}<`), entry.href)
      const segment = html.slice(html.indexOf('data-re-segment'), html.indexOf('</header>'))
      assert.equal(segment.includes('rounded-full'), false, entry.href)
    }
  } finally {
    await vite.close()
  }
})

const USER_ID = '22222222-2222-4222-8222-222222222222'
const SHOTS = '/opt/cursor/artifacts'

function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sessionToken() {
  const header = b64url({ alg: 'none', typ: 'JWT' })
  const payload = b64url({
    iss: 'https://example.supabase.co/auth/v1',
    sub: USER_ID,
    aud: 'authenticated',
    exp: 2000000000,
    iat: 1700000000,
    role: 'authenticated',
    aal: 'aal2',
    session_id: '00000000-0000-4000-8000-000000000001',
  })
  return `${header}.${payload}.sig`
}

const opportunity = {
  id: 'b1000001-0000-4000-8000-000000000001',
  is_demo: true,
  sector: 'Housing',
  city: 'Riyadh',
  asset_class: 'residential',
  capital_role: 'equity',
  ticket_band: RE_TICKET_BANDS[1],
  one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
  foreign_ownership_path: 'ready',
  escrow_off_plan: 'ready',
  title_clarity: 'ready',
  white_land_exposure: 'ready',
  counterparty_name: 'Nahla House Works',
  terms: 'Observer seat beside the developer. The brief stays with admin.',
  contact_name: 'Amal N.',
  contact_email: 'amal.re@example.com',
  contact_phone: 'Example line 5101',
  narrative: 'Nahla House Works is a fictional example.',
}

const partner = {
  id: 'b2000001-0000-4000-8000-000000000001',
  is_demo: true,
  category_slug: 'real_estate',
  name: 'Example House Counsel',
  kind: 'law',
  city: 'Riyadh',
  blurb: 'A fictional law firm for real estate briefs. Outreach stays with admin.',
  sponsor_tied: false,
  unlocked: false,
  access: 'locked',
  contact_name: 'Amal N.',
  contact_email: 'counsel.re@example.com',
  contact_phone: 'Example line 5201',
}

const role = {
  id: 'b3000001-0000-4000-8000-000000000001',
  is_demo: true,
  seat_kind: 'developer',
  title: 'Independent director',
  sector: 'Housing',
  capacity: 'One independent seat. Four meetings a year.',
  city: 'Riyadh',
  asset_class: 'residential',
  unlocked: false,
  access: 'locked',
  organisation_name: 'Safa Court Developer',
  terms: 'Independent seat. The appointment stays in the example brief.',
  contact_name: 'Lina S.',
  contact_email: 'lina.role@example.com',
  contact_phone: 'Example line 6101',
  narrative: 'Safa Court Developer is a fictional example.',
}

test('each segment sets the real estate view and arrows keep one row at 390', async (t) => {
  const chrome = chromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  process.env.VITE_TWO_TIER_REGISTER_ENABLED = 'false'
  mkdirSync(SHOTS, { recursive: true })
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const origin = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const context = await browser.newContext()
    await context.route('**/*supabase.co/**', (route) => mockSupabase(route))
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    await page.goto(origin)
    await page.evaluate((access) => {
      localStorage.setItem(
        'sb-example-auth-token',
        JSON.stringify({
          access_token: access,
          refresh_token: 'refresh-example',
          expires_in: 3600,
          expires_at: 2000000000,
          token_type: 'bearer',
          user: {
            id: '22222222-2222-4222-8222-222222222222',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'Example Member',
            factors: [{ id: 'factor-example', status: 'verified', factor_type: 'totp' }],
          },
        }),
      )
    }, sessionToken())

    await page.setViewportSize({ width: 1280, height: 800 })
    await openRealEstate(page, origin, '')
    await page.screenshot({ path: `${SHOTS}/re-switch-route-opportunities-1280.png` })
    await page.getByRole('tab', { name: 'Firms', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/dashboard/deals/real-estate' && url.search === '?view=partners')
    await page.locator('[data-re-panel="partners"]').waitFor()
    assert.equal(await page.locator('[data-re-panel="opportunities"]').count(), 0)
    await page.getByRole('tab', { name: 'Board roles', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/dashboard/deals/real-estate' && url.search === '?view=roles')
    await page.locator('[data-re-panel="roles"]').waitFor()
    await page.getByRole('tab', { name: 'Opportunities', exact: true }).click()
    await page.waitForFunction(() => location.pathname === '/dashboard/deals/real-estate' && location.search === '')
    await page.locator('[data-re-panel="opportunities"]').waitFor()

    await openRealEstate(page, origin, '?view=partners')
    await page.screenshot({ path: `${SHOTS}/re-switch-route-partners-1280.png` })
    await openRealEstate(page, origin, '?view=roles')
    await page.screenshot({ path: `${SHOTS}/re-switch-route-roles-1280.png` })

    await page.goto(`${origin}/dashboard/deals/real-estate?view=firms`)
    await page.locator('[data-re-panel="opportunities"]').waitFor()
    assert.equal(new URL(page.url()).search, '?view=firms')
    assert.equal(await page.locator('[data-re-tab="opportunities"]').getAttribute('aria-selected'), 'true')
    await page.goto(`${origin}/dashboard/deals/real-estate?view=board-roles`)
    await page.locator('[data-re-panel="opportunities"]').waitFor()
    assert.equal(await page.locator('[data-re-tab="roles"]').getAttribute('aria-selected'), 'false')

    await page.goto(`${origin}/dashboard/real-estate?view=partners`)
    await page.waitForFunction(() => location.pathname === '/dashboard/deals/real-estate' && location.search === '?view=partners')
    await page.locator('[data-re-panel="partners"]').waitFor()

    await page.setViewportSize({ width: 390, height: 844 })
    await openRealEstate(page, origin, '')
    await assertOneRow(page)
    await page.screenshot({ path: `${SHOTS}/re-switch-route-opportunities-390.png` })
    await openRealEstate(page, origin, '?view=partners')
    await assertOneRow(page)
    await page.screenshot({ path: `${SHOTS}/re-switch-route-partners-390.png` })
    await openRealEstate(page, origin, '?view=roles')
    await assertOneRow(page)
    await page.screenshot({ path: `${SHOTS}/re-switch-route-roles-390.png` })

    await openRealEstate(page, origin, '')
    await page.locator('[data-re-tab="opportunities"]').focus()
    await page.keyboard.press('ArrowRight')
    await waitForTab(page, 'partners', '?view=partners')
    const focus = await page.evaluate(() => {
      const el = document.activeElement
      if (!(el instanceof HTMLElement)) return null
      const style = getComputedStyle(el)
      return {
        tab: el.getAttribute('data-re-tab'),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
      }
    })
    assert.equal(focus?.tab, 'partners')
    assert.notEqual(focus?.outlineStyle, 'none')
    assert.ok((focus?.outlineWidth || 0) >= 2, JSON.stringify(focus))
    await page.keyboard.press('ArrowRight')
    await waitForTab(page, 'roles', '?view=roles')
    await page.keyboard.press('ArrowLeft')
    await waitForTab(page, 'partners', '?view=partners')
    await page.keyboard.press('ArrowLeft')
    await waitForTab(page, 'opportunities', '')
  } finally {
    await browser.close()
    await vite.close()
  }
})

async function waitForTab(page: Page, id: string, search: string) {
  await page.waitForFunction(
    ({ id, search }) => {
      const el = document.activeElement
      return (
        el instanceof HTMLElement &&
        el.getAttribute('data-re-tab') === id &&
        el.getAttribute('aria-selected') === 'true' &&
        location.pathname === '/dashboard/deals/real-estate' &&
        location.search === search
      )
    },
    { id, search },
  )
}

async function openRealEstate(page: Page, origin: string, search: string) {
  const panel = search === '?view=partners' ? 'partners' : search === '?view=roles' ? 'roles' : 'opportunities'
  await page.goto(`${origin}/dashboard/deals/real-estate${search}`)
  try {
    await page.locator(`[data-re-panel="${panel}"]`).waitFor()
    await page.locator(`[data-re-tab="${panel}"][aria-selected="true"]`).waitFor()
    await page.locator('[data-section-tabs]').waitFor()
  } catch (error) {
    const text = await page.locator('body').innerText()
    throw new Error(`${text.slice(0, 700)}\n${error}`)
  }
  const url = new URL(page.url())
  assert.equal(url.pathname, '/dashboard/deals/real-estate')
  assert.equal(url.search, search)
}

async function assertOneRow(page: Page) {
  const metrics = await page.evaluate(() => {
    const segment = document.querySelector('[data-re-segment]')
    if (!(segment instanceof HTMLElement)) return null
    const tabs = [...segment.querySelectorAll('[role="tab"]')].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    )
    const box = segment.getBoundingClientRect()
    return {
      height: box.height,
      left: box.left,
      right: box.right,
      innerWidth: window.innerWidth,
      tops: tabs.map((el) => Math.round(el.getBoundingClientRect().top)),
      heights: tabs.map((el) => el.getBoundingClientRect().height),
      clipped: tabs.map((el) => el.scrollWidth - el.clientWidth),
      sectionTabs: document.querySelectorAll('[data-section-tabs]').length,
      segmentPills: segment.className.includes('rounded-full') || tabs.some((el) => el.className.includes('rounded-full')),
      labels: tabs.map((el) => el.textContent?.trim()),
    }
  })
  assert.ok(metrics, 'segment missing')
  assert.equal(new Set(metrics.tops).size, 1, JSON.stringify(metrics))
  assert.ok(metrics.height >= 44 && metrics.height <= 56, JSON.stringify(metrics))
  assert.ok(metrics.heights.every((height) => height >= 44), JSON.stringify(metrics))
  assert.ok(metrics.clipped.every((overflow) => overflow <= 1), JSON.stringify(metrics))
  assert.equal(metrics.sectionTabs, 1)
  assert.equal(metrics.segmentPills, false)
  assert.ok(metrics.left >= -1 && metrics.right <= metrics.innerWidth + 1, JSON.stringify(metrics))
  assert.deepEqual(metrics.labels, ['Opportunities', 'Firms', 'Board roles'])
}

function memberRow() {
  return {
    user_id: USER_ID,
    email: 'Example Member',
    seat: 'ksa',
    status: 'active',
    must_set_password: false,
    invites_remaining: 2,
    invites_granted: 2,
    founding_number: 1,
    tier: 'founding',
  }
}

function profileRow() {
  return {
    user_id: USER_ID,
    full_name: 'Example Member',
    headline: 'Chair',
    company: 'Example Co',
    location: 'Riyadh',
    linkedin_url: '',
    bio: '',
    phone: '',
    calendar_url: null,
    investable_capacity_usd: null,
    fo_aum_usd: null,
    turnover_usd: null,
    capacity_currency: 'USD',
    include_in_public_aggregates: false,
    capacity_verified: false,
    avatar_path: null,
    avatar_style: 'male',
  }
}

async function mockSupabase(route: {
  request: () => { method: () => string; url: () => string; headers: () => Record<string, string> }
  fulfill: (value: unknown) => Promise<void>
}) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  }
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: cors })
    return
  }
  const url = route.request().url()
  const single = (route.request().headers().accept || '').includes('application/vnd.pgrst.object+json')
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'Example Member',
    factors: [{ id: 'factor-example', status: 'verified', factor_type: 'totp', friendly_name: 'Authenticator app' }],
  }
  const json = (body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
  if (url.includes('/auth/v1/user')) return json(user)
  if (url.includes('/auth/v1/factors')) return json({ all: user.factors, totp: user.factors })
  if (url.includes('/auth/v1/token')) {
    return json({
      access_token: sessionToken(),
      refresh_token: 'refresh-example',
      expires_in: 3600,
      expires_at: 2000000000,
      token_type: 'bearer',
      user,
    })
  }
  if (url.includes('/rest/v1/rpc/list_re_opportunities')) return json([opportunity])
  if (url.includes('/rest/v1/rpc/list_re_partners')) return json([partner])
  if (url.includes('/rest/v1/rpc/list_re_board_roles')) return json([role])
  if (url.includes('/rest/v1/rpc/get_my_re_appetite')) return json(null)
  if (url.includes('/rest/v1/rpc/my_re_club_interest')) return json([])
  if (url.includes('/rest/v1/rpc/')) return json([])
  if (url.includes('/rest/v1/staff_users')) return json({ code: 'PGRST116', message: '0 rows' }, 406)
  if (url.includes('/rest/v1/members')) return json(single ? memberRow() : [memberRow()])
  if (url.includes('/rest/v1/profiles')) return json(single ? profileRow() : [profileRow()])
  if (url.includes('/rest/v1/platform_stats')) return json(single ? { founding_admitted_count: 12 } : [{ founding_admitted_count: 12 }])
  if (url.includes('/rest/v1/')) return json(single ? null : [])
  return json({})
}
