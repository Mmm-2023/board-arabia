import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'
import {
  ACCOUNT_SHEET_LINKS,
  DELETE_ACCOUNT_PATH,
  memberAccountLinks,
} from '../src/shell/destinations.ts'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const ROW_LABELS = ['Profile', 'This week', 'Your privacy', 'Two-step sign-in', 'Membership', 'Help']
const ROW_PATHS = [
  '/dashboard/profile',
  '/dashboard/digest',
  '/dashboard/privacy',
  '/dashboard/two-step',
  '/dashboard/membership',
  '/dashboard/help',
]

test('every account row, back link, and help link names a real route', () => {
  const app = read('src/App.tsx')
  const help = read('src/pages/dashboard/HelpPage.tsx')
  const digest = read('src/pages/dashboard/DigestPage.tsx')
  const privacy = read('src/components/privacy/PrivacyPanelView.tsx')
  const twoStep = read('src/pages/dashboard/TwoStepPage.tsx')
  const membership = read('src/pages/dashboard/MemberMembershipPage.tsx')
  const checklist = read('src/pages/dashboard/account/MembershipChecklistView.tsx')
  const deleteView = read('src/pages/dashboard/account/DeleteAccountView.tsx')
  const deleteScreen = read('src/pages/dashboard/account/DeleteAccountScreen.tsx')
  const routes = read('src/pages/dashboard/account/AccountRoutes.tsx')
  const layout = read('src/pages/dashboard/DashboardLayout.tsx')
  const files = [app, help, digest, privacy, twoStep, membership, checklist, deleteView, layout]

  for (const file of files) {
    assert.equal(file.includes('\u2014'), false)
    assert.equal(file.includes('\u2013'), false)
    assert.equal(/the desk/i.test(file), false)
    assert.equal(/nammco/i.test(file), false)
  }
  assert.equal(help.includes('\u2014'), false)

  assert.deepEqual(
    ACCOUNT_SHEET_LINKS.map((item) => item.to),
    ROW_PATHS,
  )
  for (const segment of ['profile', 'digest', 'privacy', 'two-step', 'membership', 'help', 'account/delete', 'partnership']) {
    assert.match(app, new RegExp(`path="${segment}"`))
  }
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.match(layout, /secondary=\{ACCOUNT_SHEET_LINKS\}/)
  assert.match(layout, /memberAccountLinks\(gate\.room\.member\.seat\)/)
  assert.match(layout, /label: 'Switch to admin'/)

  assert.match(digest, /AccountBackLink to="\/dashboard" label="Back to Home"/)
  assert.match(privacy, /<AccountBackLink \/>/)
  assert.match(twoStep, /<AccountBackLink \/>/)
  assert.match(membership, /<AccountBackLink \/>/)
  assert.match(checklist, /<AccountBackLink \/>/)
  assert.match(deleteView, /AccountBackLink to="\/dashboard\/privacy" label="Back to Your privacy"/)

  assert.match(help, /aria-label="Account pages"/)
  assert.match(help, /to="\/dashboard\/digest"/)
  assert.match(help, /to="\/dashboard\/privacy"/)
  assert.match(help, /to="\/dashboard\/two-step"/)
  assert.match(help, /to="\/dashboard\/ai"/)
  assert.match(app, /path="ai"/)

  assert.match(privacy, /data-privacy-delete/)
  assert.match(privacy, /to=\{DELETE_ACCOUNT_PATH\}/)
  assert.equal(ACCOUNT_SHEET_LINKS.some((item) => item.to === DELETE_ACCOUNT_PATH), false)
  assert.match(deleteView, /I understand this removes my account/)
  assert.match(deleteView, /disabled=\{!confirmed \|\| busy\}/)
  assert.match(deleteView, /Keep my account/)
  assert.match(deleteScreen, /deleteCandidateAccount/)
  assert.match(routes, /\/dashboard\/account\/delete/)
  assert.match(routes, /<DigestPage \/>/)
  assert.match(routes, /<PrivacyPanelPage \/>/)
  assert.match(routes, /<TwoStepPage \/>/)

  const partner = memberAccountLinks('sponsor')
  assert.equal(partner[0]?.label, 'Partnership')
  assert.equal(partner.some((item) => /sponsor/i.test(item.label)), false)
  assert.equal(/\$\d/.test(membership + privacy + help + digest), false)
})

test('account menu, routes, and shots at 1440 and 390', { timeout: 240000 }, async (t) => {
  const chrome = resolveChromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  process.env.VITE_TWO_TIER_REGISTER_ENABLED = 'false'

  const shotDir = mkdtempSync(path.join(tmpdir(), 'ba-account-menu-'))
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
  const mode = { staff: false, seat: 'ksa' }
  try {
    const context = await browser.newContext()
    await context.route('**/*supabase.co/**', (route) => mockSupabase(route, mode))
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    await signIn(page, origin)

    await page.setViewportSize({ width: 1440, height: 900 })
    await walkAccountRoutes(page, origin)
    await page.setViewportSize({ width: 390, height: 844 })
    await assertOneControl(page, origin, false)
    await page.setViewportSize({ width: 1440, height: 900 })
    await assertOneControl(page, origin, true)

    mode.staff = true
    mode.seat = 'ksa'
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
      await readyHome(page)
      await openAccount(page)
      if (width === 1440) {
        const staffRows = await dialogRows(page)
        assert.deepEqual(staffRows, [...ROW_LABELS, 'Switch to admin'])
        assert.match(await page.locator('#shell-account').innerText(), /Sign out/)
        assert.equal(/sponsor/i.test(await page.locator('#shell-account').innerText()), false)
      }
      await page.screenshot({ path: path.join(shotDir, `staff-menu-${width}.png`), fullPage: true })
      await page.keyboard.press('Escape')
      await page.locator('#shell-account').waitFor({ state: 'hidden' })
    }

    mode.staff = false
    mode.seat = 'sponsor'
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
    await readyHome(page)
    await openAccount(page)
    const partnerRows = await dialogRows(page)
    assert.deepEqual(partnerRows, ['Partnership', ...ROW_LABELS])
    assert.equal(/sponsor/i.test(await page.locator('#shell-account').innerText()), false)
    await page.screenshot({ path: path.join(shotDir, 'partner-menu-1440.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    await openAccount(page)
    await page.screenshot({ path: path.join(shotDir, 'partner-menu-390.png'), fullPage: true })
    await page.keyboard.press('Escape')

    mode.seat = 'ksa'
    const shots: Array<[string, string, string]> = [
      ['home', '/dashboard', 'Example Member'],
      ['digest', '/dashboard/digest', 'This week'],
      ['privacy', '/dashboard/privacy', 'Your privacy'],
      ['two-step', '/dashboard/two-step', 'Two-step sign-in'],
      ['membership', '/dashboard/membership', 'Membership'],
      ['help', '/dashboard/help', 'Help'],
      ['delete', '/dashboard/account/delete', 'Delete account'],
      ['ai-tools', '/dashboard/ai', 'AI tools'],
      ['profile', '/dashboard/profile', 'Your details'],
    ]
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
      await readyHome(page)
      await page.screenshot({ path: path.join(shotDir, `chrome-${width}.png`), fullPage: true })
      await openAccount(page)
      await page.screenshot({ path: path.join(shotDir, `menu-${width}.png`), fullPage: true })
      await page.keyboard.press('Escape')
      await page.locator('#shell-account').waitFor({ state: 'hidden' })
      for (const [name, href, heading] of shots) {
        await page.goto(`${origin}${href}`, { waitUntil: 'networkidle' })
        await page.getByRole('heading', { level: 1, name: heading }).waitFor()
        await page.screenshot({ path: path.join(shotDir, `${name}-${width}.png`), fullPage: true })
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${origin}/scripts/smoke/account-menu.html`, { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Back to account' }).waitFor()
    const checklistText = await page.locator('body').innerText()
    assert.match(checklistText, /Your path to full membership/)
    assert.equal(checklistText.includes('\u2014'), false)
    assert.equal(/\$\d/.test(checklistText), false)
    await page.screenshot({ path: path.join(shotDir, 'membership-checklist-1440.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(shotDir, 'membership-checklist-390.png'), fullPage: true })

    const expected = [
      'menu-1440.png',
      'menu-390.png',
      'chrome-1440.png',
      'chrome-390.png',
      'staff-menu-1440.png',
      'staff-menu-390.png',
      'partner-menu-1440.png',
      'partner-menu-390.png',
      'home-1440.png',
      'home-390.png',
      'digest-1440.png',
      'digest-390.png',
      'privacy-1440.png',
      'privacy-390.png',
      'two-step-1440.png',
      'two-step-390.png',
      'membership-1440.png',
      'membership-390.png',
      'membership-checklist-1440.png',
      'membership-checklist-390.png',
      'help-1440.png',
      'help-390.png',
      'delete-1440.png',
      'delete-390.png',
      'ai-tools-1440.png',
      'ai-tools-390.png',
      'profile-1440.png',
      'profile-390.png',
    ]
    for (const name of expected) {
      const file = path.join(shotDir, name)
      assert.ok(statSync(file).size > 1000, name)
    }
  } finally {
    await browser.close()
    await vite.close()
    rmSync(shotDir, { recursive: true, force: true })
  }
})

async function signIn(page: Page, origin: string) {
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
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
          email: 'member@example.com',
          factors: [{ id: 'factor-example', status: 'verified', factor_type: 'totp' }],
        },
      }),
    )
  }, sessionToken())
}

async function readyHome(page: Page) {
  await page.getByRole('heading', { level: 1, name: 'Example Member' }).waitFor()
  const welcome = page.getByRole('button', { name: 'Continue' })
  if (await welcome.count()) {
    await welcome.click()
    await welcome.waitFor({ state: 'hidden' })
  }
}

async function walkAccountRoutes(page: Page, origin: string) {
  await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
  await readyHome(page)
  await assertMenuCloses(page)
  for (const [label, href] of ROW_LABELS.map((label, index) => [label, ROW_PATHS[index]] as const)) {
    await openAccount(page)
    await page.locator(`#shell-account a[data-account-row]`).filter({ hasText: label }).click()
    await page.waitForURL((url) => url.pathname === href)
    await page.locator('#shell-account').waitFor({ state: 'hidden' })
    await page.waitForFunction((next) => {
      const button = document.querySelector('[data-account-control="header"]')
      return button?.getAttribute('data-account-path') === next && button.getAttribute('data-account-route') === 'yes'
    }, href)
    const ring = await page.locator('[data-account-control="header"]').getAttribute('class')
    assert.match(ring || '', /ring-2/, label)
  }

  await page.goto(`${origin}/dashboard/digest`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await page.waitForURL((url) => url.pathname === '/dashboard')

  for (const href of ['/dashboard/privacy', '/dashboard/two-step', '/dashboard/membership']) {
    await page.goto(`${origin}${href}`, { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Back to account' }).click()
    await page.waitForURL((url) => url.pathname === '/dashboard/profile')
  }

  await page.goto(`${origin}/dashboard/privacy`, { waitUntil: 'networkidle' })
  await page.locator('[data-privacy-delete] a').click()
  await page.waitForURL((url) => url.pathname === DELETE_ACCOUNT_PATH)
  const confirm = page.getByRole('button', { name: 'Delete account' })
  await confirm.waitFor()
  assert.equal(await confirm.isDisabled(), true)
  await page.getByRole('checkbox', { name: 'I understand this removes my account.' }).check()
  assert.equal(await confirm.isDisabled(), false)
  await page.getByRole('link', { name: 'Back to Your privacy' }).click()
  await page.waitForURL((url) => url.pathname === '/dashboard/privacy')

  await page.goto(`${origin}/dashboard/help`, { waitUntil: 'networkidle' })
  const helpTargets: Array<[string, string]> = [
    ['This week', '/dashboard/digest'],
    ['Your privacy', '/dashboard/privacy'],
    ['Two-step sign-in', '/dashboard/two-step'],
    ['AI tools', '/dashboard/ai'],
  ]
  for (const [label, href] of helpTargets) {
    await page.goto(`${origin}/dashboard/help`, { waitUntil: 'networkidle' })
    await page.locator('nav[aria-label="Account pages"]').getByRole('link', { name: label }).click()
    await page.waitForURL((url) => url.pathname === href)
    await page.getByRole('heading', { level: 1 }).waitFor()
  }
}

async function assertOneControl(page: Page, origin: string, desktop: boolean) {
  await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
  await readyHome(page)
  assert.equal(await page.locator('[data-account-control="header"]').count(), 1)
  const headerText = await page.locator('header').innerText()
  assert.equal(/\bAccount\b/.test(headerText), false)
  const sidebar = page.locator('[data-account-entry="sidebar"]')
  assert.equal(await sidebar.isVisible(), desktop)
  if (desktop) {
    const labels = await sidebar.locator('[data-account-row]').allTextContents()
    assert.deepEqual(labels.map((label) => label.trim()), ROW_LABELS)
  }
}

async function assertMenuCloses(page: Page) {
  await openAccount(page)
  assert.equal(await page.locator('#shell-account').count(), 1)
  await page.keyboard.press('Escape')
  await page.locator('#shell-account').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Account')

  await openAccount(page)
  await page.locator('button.absolute[aria-label="Close"]').click()
  await page.locator('#shell-account').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Account')
}

async function openAccount(page: Page) {
  const button = page.locator('[data-account-control="header"]')
  if ((await page.locator('#shell-account').count()) === 0) await button.click()
  await page.locator('#shell-account').waitFor()
}

async function dialogRows(page: Page) {
  const labels = await page.locator('#shell-account [data-account-row]').allTextContents()
  return labels.map((label) => label.trim())
}

function sessionToken() {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = btoa(
    JSON.stringify({
      sub: '22222222-2222-4222-8222-222222222222',
      aud: 'authenticated',
      exp: 2000000000,
      iat: 1700000000,
      role: 'authenticated',
      aal: 'aal2',
      session_id: '00000000-0000-4000-8000-000000000001',
    }),
  )
  return `${header}.${payload}.sig`
}

async function mockSupabase(
  route: {
    request: () => { method: () => string; url: () => string; headers: () => Record<string, string> }
    fulfill: (value: unknown) => Promise<void>
  },
  mode: { staff: boolean; seat: string },
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
    id: '22222222-2222-4222-8222-222222222222',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'member@example.com',
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
  if (url.includes('/rest/v1/rpc/my_weekly_digest')) {
    return json({
      new_members: [{ full_name: 'Example Member B', headline: 'Director', company: 'Example Company B' }],
      new_mandates: [],
      upcoming_events: [{ title: 'Example gathering', starts_at: '2026-10-16T15:00:00.000Z', region: 'Riyadh' }],
      suggestions: [],
      notes: [],
    })
  }
  if (url.includes('/rest/v1/rpc/own_directory_visibility')) {
    return json({ directory_hidden: false, show_card_to_sponsors: false })
  }
  if (url.includes('/rest/v1/rpc/own_digest_preference')) return json({ digest_email_opt_in: false })
  if (url.includes('/rest/v1/rpc/read_ai_tool_frame')) {
    return json({
      retention_days: 30,
      tools: [
        { tool_key: 'cfo_check', enabled: true },
        { tool_key: 'market_brief', enabled: true },
        { tool_key: 'term_sheet_review', enabled: true },
        { tool_key: 'pricing_sense_check', enabled: false },
        { tool_key: 'deal_readiness', enabled: true },
      ],
    })
  }
  if (url.includes('/rest/v1/rpc/')) return json([])
  if (url.includes('/rest/v1/staff_users')) {
    if (!mode.staff) return json({ code: 'PGRST116', message: '0 rows' }, 406)
    return json(single ? { role: 'staff' } : [{ role: 'staff' }])
  }
  if (url.includes('/rest/v1/members')) {
    const row = {
      user_id: user.id,
      email: 'member@example.com',
      seat: mode.seat,
      status: 'active',
      must_set_password: false,
      invites_remaining: 2,
      invites_granted: 2,
      founding_number: mode.seat === 'sponsor' ? null : 1,
      tier: mode.seat === 'sponsor' ? 'member' : 'founding',
    }
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/profiles')) {
    const row = {
      user_id: user.id,
      full_name: 'Example Member',
      headline: 'Chair',
      company: 'Example Co',
      location: 'Riyadh',
      linkedin_url: 'https://example.com/in/member',
      bio: 'Example profile.',
      phone: '',
      calendar_url: null,
      investable_capacity_usd: null,
      fo_aum_usd: null,
      turnover_usd: null,
      capacity_currency: null,
      include_in_public_aggregates: false,
      capacity_verified: false,
      avatar_path: null,
      avatar_style: 'male',
      availability: 'open',
      sector_tags: ['Industry'],
      vision_themes: [],
    }
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/')) return json(single ? null : [])
  return json({})
}
