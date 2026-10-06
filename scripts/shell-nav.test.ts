import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import {
  MEMBER_ACCOUNT,
  MEMBER_DESTINATIONS,
  STAFF_DESTINATIONS,
  STAFF_SECONDARY,
  phoneDestinations,
  shellSectionTitle,
  staffDestinations,
} from '../src/shell/destinations.ts'
import { setTwoTierRegisterForTests } from '../src/lib/twoTierRegister.ts'
import { slashlessPath } from '../src/shell/trailingSlash.ts'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

function channel(hex: string) {
  const value = parseInt(hex, 16) / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function contrast(foreground: string, background: string) {
  const lum = (hex: string) => {
    const raw = hex.replace('#', '')
    const r = channel(raw.slice(0, 2))
    const g = channel(raw.slice(2, 4))
    const b = channel(raw.slice(4, 6))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const lighter = Math.max(lum(foreground), lum(background))
  const darker = Math.min(lum(foreground), lum(background))
  return (lighter + 0.05) / (darker + 0.05)
}

test('trailing slash normaliser stays on the same path', () => {
  assert.equal(slashlessPath('/dashboard/'), '/dashboard')
  assert.equal(slashlessPath('/dashboard/deals/mandates/'), '/dashboard/deals/mandates')
  assert.equal(slashlessPath('/dashboard/people/directory/'), '/dashboard/people/directory')
  assert.equal(slashlessPath('/dashboard/ai/due-diligence/'), '/dashboard/ai/due-diligence')
  assert.equal(slashlessPath('/login/staff/'), '/login/staff')
  assert.equal(slashlessPath('/admin/'), '/admin')
  assert.equal(slashlessPath('/'), null)
  assert.equal(slashlessPath('/dashboard'), null)
  assert.equal(slashlessPath('//evil.example/'), null)
  assert.equal(slashlessPath('/\\evil.example/'), null)
  assert.equal(slashlessPath('https://evil.example/dashboard/'), null)
  assert.equal(slashlessPath('/dashboard/?next=https://evil.example'), null)
  const app = read('src/App.tsx')
  assert.match(app, /<Route element=\{<TrailingSlash/)
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.equal(/element=\{<Navigate to="\/" /.test(app), false)
  assert.match(app, /path="\*" element=\{<NotFoundPage/)
  const component = read('src/shell/TrailingSlash.tsx')
  assert.match(component, /search, hash/)
  assert.equal(component.includes('window.location'), false)
  assert.equal(component.includes('host'), false)
})

test('review returns to the phone tabs only when the two-tier flag is on', () => {
  setTwoTierRegisterForTests(false)
  assert.deepEqual(
    phoneDestinations(staffDestinations()).tabs.map((item) => item.label),
    ['Home', 'Applications', 'People', 'Majlis'],
  )
  assert.deepEqual(phoneDestinations(staffDestinations()).more.map((item) => item.label), ['Review'])
  setTwoTierRegisterForTests(true)
  assert.deepEqual(
    phoneDestinations(staffDestinations()).tabs.map((item) => item.label),
    ['Home', 'Applications', 'Review', 'People', 'Majlis'],
  )
  assert.deepEqual(phoneDestinations(staffDestinations()).more.map((item) => item.label), [])
  setTwoTierRegisterForTests(null)
  assert.deepEqual(
    STAFF_SECONDARY.map((item) => item.label),
    ['Mandates', 'Rooms', 'AI tools', 'Access log', 'Marketing', 'Email', 'Capacity', 'Settings'],
  )
  for (const item of MEMBER_DESTINATIONS) assert.equal(item.to.includes('/admin'), false)
  for (const item of MEMBER_ACCOUNT) assert.equal(item.to.includes('/admin'), false)
  assert.equal(shellSectionTitle('/dashboard/two-step', MEMBER_DESTINATIONS, MEMBER_ACCOUNT), 'Two-step sign-in')
  assert.equal(shellSectionTitle('/dashboard/privacy', MEMBER_DESTINATIONS, MEMBER_ACCOUNT), 'Your privacy')
  assert.equal(shellSectionTitle('/dashboard/profile/leave', MEMBER_DESTINATIONS, MEMBER_ACCOUNT), 'Profile')
  assert.equal(shellSectionTitle('/admin/ai/market-brief', STAFF_DESTINATIONS, STAFF_SECONDARY), 'AI tools')
})

test('tool titles on white cards pass AA and staff home closes real estate tools', () => {
  const css = read('src/index.css')
  const ink = css.match(/--ba-ink:\s*(#[0-9a-fA-F]{6})/)?.[1] || ''
  assert.equal(ink, '#1c1343')
  assert.ok(contrast(ink, '#ffffff') >= 4.5)
  const cards = read('src/components/ai/AiToolCards.tsx')
  assert.match(cards, /text-ink">\{toolTitle\(tool\)\}/)
  const home = read('src/pages/admin/AdminHome.tsx')
  assert.match(home, /data-real-estate-tools/)
  assert.match(home, /Real estate tools/)
  assert.match(home, />\s*Admin intros\s*</)
  assert.equal(home.includes('Desk intros'), false)
  assert.match(home, /<details/)
  assert.equal(home.includes('<details open'), false)
  const shell = read('src/shell/AppShell.tsx')
  assert.match(shell, /window\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/)
  assert.equal(shell.includes("querySelector('.shell-main')"), false)
  assert.match(shell, /document\.body\.style\.overflow = 'hidden'/)
})

test('public not found has one heading and the three public links', async () => {
  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const mod = (await vite.ssrLoadModule('/src/pages/NotFoundPage.tsx')) as {
      NotFoundPage: () => unknown
    }
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/no-such-page'] }, createElement(mod.NotFoundPage)),
    )
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1)
    assert.match(html, /Page not found/)
    assert.match(html, /This address is not a Board Arabia page\./)
    assert.match(html, /href="\/"/)
    assert.match(html, /href="\/apply"/)
    assert.match(html, /href="\/login"/)
    assert.equal(html.includes('href="/admin"'), false)
    assert.equal(html.includes('href="/dashboard"'), false)
    assert.match(html, /powered by nammco/)
    assert.equal((html.match(/nammco/gi) || []).length, 1)
  } finally {
    await vite.close()
  }
})

const USER_ID = '22222222-2222-4222-8222-222222222222'

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

test('routes drop the trailing slash and unknown paths render page not found', async (t) => {
  const chrome = resolveChromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  process.env.VITE_TWO_TIER_REGISTER_ENABLED = 'false'
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
  const mode = { staff: false }
  try {
    const context = await browser.newContext()
    await context.route('**/*supabase.co/**', (route) => mockSupabase(route, mode))
    const page = await context.newPage()
    page.setDefaultTimeout(20000)

    await page.goto(`${origin}/no-such-page`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'Page not found' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/no-such-page')
    assert.equal(await page.title(), 'Page not found | Board Arabia')
    const robots = await page.locator('meta[name="robots"]').getAttribute('content')
    assert.match(robots || '', /noindex/)
    assert.equal(await page.locator('h1').count(), 1)
    await page.locator('[data-screen="not-found"]').getByRole('link', { name: 'Home', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/')
    await page.getByRole('heading', { name: /boardrooms/i }).waitFor()

    await page.goto(`${origin}/no-such-page`)
    await page.locator('[data-screen="not-found"]').getByRole('link', { name: 'Apply', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/apply')
    assert.match(await page.locator('body').innerText(), /consideration/i)

    await page.goto(`${origin}/no-such-page`)
    await page.locator('[data-screen="not-found"]').getByRole('link', { name: 'Log in', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/login')
    await page.getByRole('heading', { name: 'Sign in' }).waitFor()

    await page.goto(`${origin}/login/staff/?next=%2Fadmin`)
    await page.getByRole('heading', { name: 'Staff sign in' }).waitFor()
    const staffUrl = new URL(page.url())
    assert.equal(staffUrl.pathname, '/login/staff')
    assert.equal(staffUrl.search, '?next=%2Fadmin')
    assert.equal(await page.title(), 'Staff sign in | Board Arabia')

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
    mode.staff = false
    await page.goto(`${origin}/dashboard/deals/real-estate/?view=partners#sample`)
    await page.waitForFunction(() => location.pathname === '/dashboard/deals/real-estate')
    const kept = new URL(page.url())
    assert.equal(kept.search, '?view=partners')
    assert.equal(kept.hash, '#sample')
    const deals = page.locator('a[data-destination="Deals"][aria-current="page"]')
    await deals.first().waitFor()
    assert.ok((await deals.count()) >= 1)

    await page.goto(`${origin}/dashboard/`)
    await page.waitForFunction(() => location.pathname === '/dashboard')
    await page.locator('a[data-destination="Home"][aria-current="page"]').first().waitFor()

    await page.goto(`${origin}/dashboard/people/directory/`)
    await page.waitForFunction(() => location.pathname === '/dashboard/people/directory')
    await page.locator('a[data-destination="People"][aria-current="page"]').first().waitFor()

    await page.goto(`${origin}/dashboard/ai/due-diligence/`)
    await page.waitForFunction(() => location.pathname === '/dashboard/ai/due-diligence')
    await page.locator('a[data-destination="AI tools"][aria-current="page"]').first().waitFor()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${origin}/dashboard/people/directory`)
    await page.getByRole('heading', { name: 'Directory' }).waitFor()
    const metrics = await page.evaluate(() => {
      const main = document.querySelector('.shell-main')
      return {
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        overflowY: main instanceof HTMLElement ? getComputedStyle(main).overflowY : '',
      }
    })
    assert.ok(metrics.scrollHeight > metrics.innerHeight, JSON.stringify(metrics))
    assert.notEqual(metrics.overflowY, 'auto')
    assert.notEqual(metrics.overflowY, 'scroll')
    await page.locator('.shell-main').hover()
    await page.mouse.wheel(0, 600)
    await page.waitForFunction(() => window.scrollY > 0)
    const scrolled = await page.evaluate(() => window.scrollY)
    assert.ok(scrolled > 0)
    for (let step = 0; step < 15; step += 1) await page.mouse.wheel(0, 900)
    const gap = await page.evaluate(() => {
      const bar = document.querySelector('.shell-tab-bar')
      const nodes = [...document.querySelectorAll('.shell-main a, .shell-main button')]
      const last = nodes[nodes.length - 1]
      if (!(bar instanceof HTMLElement) || !(last instanceof HTMLElement)) return -1
      return bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom
    })
    assert.ok(gap >= -1, `gap ${gap}`)

    await page.goto(`${origin}/dashboard/profile#password`)
    await page.locator('#password').waitFor()
    const passwordTop = await page.evaluate(() => {
      const form = document.getElementById('password')
      const header = document.querySelector('header')
      if (!(form instanceof HTMLElement)) return -1
      const headerBottom = header instanceof HTMLElement ? header.getBoundingClientRect().bottom : 0
      return form.getBoundingClientRect().top - headerBottom
    })
    assert.ok(passwordTop >= -4)

    await page.goto(`${origin}/dashboard/no-such-page`)
    await page.getByRole('heading', { name: 'Page not found' }).waitFor()
    const memberMiss = page.locator('[data-screen="not-found"] a')
    assert.equal(await memberMiss.getAttribute('href'), '/dashboard')
    assert.equal(await page.locator('a[href="/admin"]').count(), 0)

    await page.goto(`${origin}/dashboard/events`)
    await page.waitForFunction(() => location.pathname === '/dashboard/majlis')

    mode.staff = true
    await page.goto(`${origin}/admin/`)
    await page.waitForFunction(() => location.pathname === '/admin')
    try {
      await page.locator('.shell-tab-bar [data-destination="Home"]').waitFor()
    } catch (error) {
      const text = await page.locator('body').innerText()
      throw new Error(`${text.slice(0, 500)}\n${error}`)
    }
    const labels = await page.locator('.shell-tab-bar [data-destination]').allTextContents()
    assert.deepEqual(labels.map((label) => label.trim()), ['Home', 'Applications', 'People', 'Majlis'])
    await page.getByRole('button', { name: 'More' }).click()
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden')
    const more = await page.locator('#shell-more').innerText()
    for (const label of ['Review', 'Mandates', 'Rooms', 'AI tools', 'Access log', 'Marketing', 'Email', 'Capacity', 'Settings']) {
      assert.match(more, new RegExp(label))
    }
    await page.goto(`${origin}/admin/no-such-page`)
    await page.getByRole('heading', { name: 'Page not found' }).waitFor()
    assert.equal(await page.locator('[data-screen="not-found"] a').getAttribute('href'), '/admin')

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${origin}/admin/ai`)
    await page.getByRole('heading', { level: 1, name: 'AI tools' }).waitFor()
    const ratio = await page.evaluate(() => {
      const title = document.querySelector('[data-ai-card] .text-ink')
      const card = title?.closest('a')
      if (!(title instanceof HTMLElement) || !(card instanceof HTMLElement)) return 0
      const parse = (value: string) => value.match(/\d+/g)?.map(Number) ?? []
      const fg = parse(getComputedStyle(title).color)
      const bg = parse(getComputedStyle(card).backgroundColor)
      const lin = (part: number) => {
        const v = part / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      const L = (rgb: number[]) => 0.2126 * lin(rgb[0] || 0) + 0.7152 * lin(rgb[1] || 0) + 0.0722 * lin(rgb[2] || 0)
      const a = L(fg)
      const b = L(bg)
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })
    assert.ok(ratio >= 4.5, `contrast ${ratio}`)
    const sidebar = await page.locator('aside').innerText()
    assert.match(sidebar, /AI tools/)
  } finally {
    await browser.close()
    await vite.close()
  }
})

function directoryRows() {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `33333333-3333-4333-8333-33333333333${index}`,
    is_demo: true,
    full_name: `Example Member ${index + 1}`,
    headline: 'Chair',
    company: 'Example Co',
    location: 'Riyadh',
    seat: index % 2 === 0 ? 'ksa' : 'intl',
    sectors: ['Energy transition'],
    membership_status: 'active',
  }))
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

async function mockSupabase(
  route: { request: () => { method: () => string; url: () => string; headers: () => Record<string, string> }; fulfill: (value: unknown) => Promise<void> },
  mode: { staff: boolean },
) {
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
  if (url.includes('/auth/v1/factors')) {
    return json({ all: user.factors, totp: user.factors })
  }
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
  if (url.includes('/rest/v1/rpc/list_directory')) return json(directoryRows())
  if (url.includes('/rest/v1/rpc/')) return json([])
  if (url.includes('/rest/v1/staff_users')) {
    if (!mode.staff) return json({ code: 'PGRST116', message: '0 rows' }, 406)
    return json(single ? { role: 'staff' } : [{ role: 'staff' }])
  }
  if (url.includes('/rest/v1/members')) return json(single ? memberRow() : [memberRow()])
  if (url.includes('/rest/v1/profiles')) return json(single ? profileRow() : [profileRow()])
  if (url.includes('/rest/v1/platform_stats')) return json(single ? { founding_admitted_count: 12 } : [{ founding_admitted_count: 12 }])
  if (url.includes('/rest/v1/')) return json(single ? null : [])
  return json({})
}
