import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'
import {
  homeMemberPrompt,
  PROMPT_RETURN_MS,
  promptWasDismissed,
  readPromptDismissal,
  rememberPromptDismissed,
  signOutToLogin,
} from '../src/lib/mfaFlow.ts'
import { cleanStaffDisplayName, ownStaffRowLabel, showStaffNameCard } from '../src/lib/staffDisplayName.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const DAY = 24 * 60 * 60 * 1000

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function render(node: ReactNode) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

test('two-step prompt shows on home only and returns after 14 days', () => {
  const now = 1_700_000_000_000
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard', verifiedFactor: false, dismissedAt: null, now }),
    true,
  )
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard/deals/mandates', verifiedFactor: false, dismissedAt: null, now }),
    false,
  )
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard/two-step', verifiedFactor: false, dismissedAt: null, now }),
    false,
  )
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard', verifiedFactor: false, dismissedAt: now - 13 * DAY, now }),
    false,
  )
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard', verifiedFactor: false, dismissedAt: now - 15 * DAY, now }),
    true,
  )
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard', verifiedFactor: false, dismissedAt: now - PROMPT_RETURN_MS, now }),
    true,
  )
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard', verifiedFactor: true, dismissedAt: null, now }),
    false,
  )
  const legacy = readPromptDismissal({ userId: 'example-member', raw: null, metadata: true, now })
  assert.equal(legacy.at, now)
  assert.equal(legacy.migrate, true)
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard', verifiedFactor: false, dismissedAt: legacy.at, now }),
    false,
  )
  assert.equal(
    homeMemberPrompt({ pathname: '/dashboard', verifiedFactor: false, dismissedAt: legacy.at, now: now + 15 * DAY }),
    true,
  )
  const stored = readPromptDismissal({
    userId: 'example-member',
    raw: rememberPromptDismissed('example-member', null),
    metadata: false,
    now,
  })
  assert.equal(stored.at, now)
  assert.equal(stored.migrate, true)
  assert.equal(promptWasDismissed('example-member', rememberPromptDismissed('example-member', null), false), true)
})

test('home prompt is absent on mandates and two-step', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const screens = (await vite.ssrLoadModule('/src/components/mfa/TwoStepScreens.tsx')) as {
      MemberHomePrompt: (props: {
        pathname: string
        verifiedFactor: boolean
        dismissedAt: number | null
        now: number
        onDismiss: () => void
      }) => ReactNode
    }
    const now = 1_700_000_000_000
    const props = { verifiedFactor: false, dismissedAt: null, now, onDismiss: () => {} }
    const home = render(createElement(screens.MemberHomePrompt, { ...props, pathname: '/dashboard' }))
    assert.match(home, /Protect your seat: turn on two-step sign-in\./)
    assert.match(home, /href="\/dashboard\/two-step"/)
    assert.match(home, />Turn on</)
    assert.match(home, />Not now</)
    assert.match(home, /min-h-11/)
    assert.equal(home.includes('<h2'), false)
    for (const pathname of ['/dashboard/deals/mandates', '/dashboard/two-step']) {
      const html = render(createElement(screens.MemberHomePrompt, { ...props, pathname }))
      assert.equal(html.includes('Protect your seat'), false, pathname)
      assert.equal(html.includes('data-mfa-prompt'), false, pathname)
    }
  } finally {
    await vite.close()
  }
  const layout = read('src/pages/dashboard/DashboardLayout.tsx')
  assert.match(layout, /MemberHomePrompt/)
  assert.equal(layout.includes('MemberMfaPrompt'), false)
  assert.match(read('src/lib/mfaFlow.ts'), /export function routeHold/)
})

test('staff sign-in copy and focus ring', () => {
  const login = read('src/pages/LoginPage.tsx')
  const layout = read('src/pages/dashboard/DashboardLayout.tsx')
  const screens = read('src/components/mfa/TwoStepScreens.tsx')
  assert.match(login, /Email and password for staff\. After sign-in you open admin\./)
  assert.match(login, /Staff sign in/)
  assert.match(login, /Member sign in/)
  assert.match(layout, /only after our admin team admits you/)
  assert.equal(/\bthe desk\b/i.test(login), false)
  assert.equal(/\bthe desk\b/i.test(layout), false)
  assert.match(login, /min-h-11 items-center[\s\S]{0,180}Back to site/)
  assert.match(screens, /focus-visible:outline-2/)
  assert.match(screens, /focus-visible:outline-offset-2/)
  assert.match(screens, /outline-\[var\(--ba-lavender-mist\)\]/)
  assert.match(screens, /outline-\[var\(--ba-copper-deep\)\]/)
  assert.match(login, /signInFieldClass/)
  assert.equal(login.includes('outline-none'), false)
  assert.equal(screens.includes('outline-none'), false)
})

test('code screen sign out ends the session and returns to the right door', async () => {
  const calls: string[] = []
  await signOutToLogin({
    endSession: async () => {
      calls.push('end')
    },
    go: (path) => {
      calls.push(path)
    },
    path: '/login/staff',
  })
  assert.deepEqual(calls, ['end', '/login/staff'])
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  let html = ''
  try {
    const screens = (await vite.ssrLoadModule('/src/components/mfa/TwoStepScreens.tsx')) as {
      TwoStepChallengeScreen: (props: {
        tone: 'dark' | 'light'
        code: string
        error: string
        busy: boolean
        onCode: () => void
        onSubmit: (event: { preventDefault: () => void }) => void
        onSignOut: () => void
      }) => ReactNode
    }
    html = render(
      createElement(screens.TwoStepChallengeScreen, {
        tone: 'dark',
        code: '',
        error: '',
        busy: false,
        onCode: () => {},
        onSubmit: (event) => event.preventDefault(),
        onSignOut: () => {},
      }),
    )
  } finally {
    await vite.close()
  }
  assert.match(html, /Sign out/)
  assert.match(html, /Board Arabia/)
  assert.match(html, /Enter your code/)
  const hold = read('src/components/mfa/MfaHold.tsx')
  assert.match(hold, /endAuthSession/)
  assert.match(hold, /signOutToLogin/)
  assert.match(read('src/pages/LoginPage.tsx'), /signOutTo=\{staffEntry \? '\/login\/staff' : '\/login'\}/)
})

test('staff name card shows only when the signed-in name is empty', async () => {
  assert.equal(showStaffNameCard('', true), true)
  assert.equal(showStaffNameCard('Example Name', true), false)
  assert.equal(showStaffNameCard('', false), false)
  assert.equal(cleanStaffDisplayName('name@example.com').ok, false)
  assert.equal(ownStaffRowLabel('staff@example.com', 'Admin', true, 'Example Name'), 'Example Name, Admin')
  assert.equal(ownStaffRowLabel('staff@example.com', 'Master', true, 'Example Name'), 'Example Name, Master')
  assert.equal(ownStaffRowLabel('other@example.com', 'Admin', false, 'Example Name'), 'other@example.com')
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const card = (await vite.ssrLoadModule('/src/pages/admin/StaffOwnNameCard.tsx')) as {
      StaffOwnNameCard: (props: {
        savedName: string
        ready: boolean
        busy: boolean
        error: string
        onSave: () => void
      }) => ReactNode
    }
    const empty = render(
      createElement(card.StaffOwnNameCard, {
        savedName: '',
        ready: true,
        busy: false,
        error: '',
        onSave: () => {},
      }),
    )
    assert.match(empty, /Add your name so the access log shows who opened a record\./)
    assert.match(empty, />Save</)
    const filled = render(
      createElement(card.StaffOwnNameCard, {
        savedName: 'Example Name',
        ready: true,
        busy: false,
        error: '',
        onSave: () => {},
      }),
    )
    assert.equal(filled.includes('data-staff-name-card'), false)
  } finally {
    await vite.close()
  }
})

test('src says the desk only inside Who runs the desk', () => {
  const src = path.join(root, 'src')
  const hits: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue
      const text = readFileSync(full, 'utf8')
      if (/\bthe desk\b/i.test(text)) hits.push(path.relative(src, full))
    }
  }
  walk(src)
  assert.deepEqual(hits, ['components/WhoRunsTheDesk.tsx'])
  const who = read('src/components/WhoRunsTheDesk.tsx')
  assert.match(who, /Who runs the desk/)
  assert.match(who, /Michael Mateer, Co-Founder and CEO/)
  assert.equal(who.replace(/Who runs the desk/g, '').toLowerCase().includes('the desk'), false)
})

test('staff more sheet pads the safe area and can scroll', () => {
  const css = read('src/index.css')
  const sheet = css.slice(css.indexOf('.shell-more-sheet'))
  assert.match(sheet, /max-height: 100dvh/)
  assert.match(sheet, /overflow-y: auto/)
  assert.match(sheet, /padding-bottom: calc\(1rem \+ env\(safe-area-inset-bottom, 0px\)\)/)
  assert.match(read('src/shell/AppShell.tsx'), /shell-more-sheet/)
})

test('staff home hides the empty email heading while email is parked', async () => {
  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  const home = read('src/pages/admin/AdminHome.tsx')
  assert.match(home, /recent\.length > 0 \|\| room\.panelFailed\.email/)
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const mod = (await vite.ssrLoadModule('/src/pages/admin/AdminHome.tsx')) as {
      StaffDesk: () => ReactNode
    }
    const preview = (await vite.ssrLoadModule('/src/pages/admin/context.tsx')) as {
      AdminPreview: (props: { room: unknown; children: ReactNode }) => ReactNode
    }
    const parked = render(
      createElement(preview.AdminPreview, { room: staffRoom([]) }, createElement(mod.StaffDesk)),
    )
    assert.equal(parked.includes('Recent email'), false)
    assert.equal(parked.includes('>Email<'), false)
    const live = render(
      createElement(
        preview.AdminPreview,
        {
          room: staffRoom([
            {
              id: 'event-1',
              created_at: '2026-10-01T00:00:00.000Z',
              kind: 'note',
              recipient: 'member@example.com',
              subject: 'Example note',
              status: 'sent',
            },
          ]),
        },
        createElement(mod.StaffDesk),
      ),
    )
    assert.match(live, /Recent email/)
    assert.match(live, /Example note/)
  } finally {
    await vite.close()
  }
})

test('sign-in, home prompt, and code screen render in the browser', async (t) => {
  const chrome = resolveChromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
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
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await context.route('**/*supabase.co/**', (route) => mockSupabase(route, { factors: false }))
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    await page.addInitScript((access) => {
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
          },
        }),
      )
    }, sessionToken('aal1'))
    await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
    await page.getByText('Protect your seat: turn on two-step sign-in.').waitFor()
    const titleTop = await page.evaluate(() => {
      const heading = document.querySelector('h1')
      return heading instanceof HTMLElement ? heading.getBoundingClientRect().top : 999
    })
    assert.ok(titleTop < 200, `home title at ${titleTop}`)
    await page.goto(`${origin}/dashboard/deals/mandates`)
    await page.getByRole('heading', { name: 'Mandates' }).waitFor()
    assert.equal(await page.getByText('Protect your seat: turn on two-step sign-in.').count(), 0)
    await page.goto(`${origin}/dashboard/two-step`)
    await page.getByRole('heading', { name: 'Two-step sign-in' }).waitFor()
    assert.equal(await page.getByText('Protect your seat: turn on two-step sign-in.').count(), 0)
    await context.close()

    const guest = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const guestPage = await guest.newPage()
    guestPage.setDefaultTimeout(20000)
    await guestPage.goto(`${origin}/login/staff`, { waitUntil: 'networkidle' })
    await guestPage.getByRole('heading', { name: 'Staff sign in' }).waitFor()
    assert.match(await guestPage.locator('body').innerText(), /Email and password for staff\. After sign-in you open admin\./)
    await guestPage.getByRole('link', { name: 'Back to site' }).click()
    await guestPage.waitForURL((url) => url.pathname === '/')
    await guestPage.goto(`${origin}/login/staff`)
    await guestPage.getByRole('link', { name: 'Member sign in' }).click()
    await guestPage.waitForURL((url) => url.pathname === '/login')
    await guestPage.getByRole('heading', { name: 'Sign in' }).waitFor()
    await guest.close()

    const challengeContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await challengeContext.route('**/*supabase.co/**', (route) => mockSupabase(route, { factors: true }))
    const challenge = await challengeContext.newPage()
    challenge.setDefaultTimeout(20000)
    await challenge.addInitScript((access) => {
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
    }, sessionToken('aal1'))
    await challenge.goto(`${origin}/login/staff`, { waitUntil: 'networkidle' })
    await challenge.getByRole('heading', { name: 'Enter your code' }).waitFor()
    await challenge.getByRole('button', { name: 'Sign out' }).click()
    await challenge.waitForURL((url) => url.pathname === '/login/staff')
    await challenge.getByRole('heading', { name: 'Staff sign in' }).waitFor()
    await challengeContext.close()
  } finally {
    await browser.close()
    await vite.close()
  }
})

function staffRoom(events: unknown[]) {
  return {
    session: null,
    booting: false,
    isStaff: true,
    staffRole: 'staff',
    loading: false,
    hasLoaded: true,
    listError: '',
    refreshError: '',
    queryDetail: '',
    panelFailed: {},
    actionNote: '',
    apps: [],
    members: [],
    peerInvites: [],
    events,
    staffRows: [],
    profileByUser: {},
    capacity: null,
    platform: null,
    refreshedAt: null,
    updatingId: null,
    dryRunInvite: null,
    email: 'staff@example.com',
    isMember: false,
    masterKnown: false,
    seatById: {},
    setSeat: () => {},
    draftFor: (_key: string, fallback: unknown) => fallback,
    setDraft: () => {},
    refresh: () => {},
    onAccept: async () => {},
    onAdmit: async () => {},
    onReject: async () => {},
    runInvite: async () => {},
    onMemberStatus: async () => {},
    onSaveCapacity: async () => {},
    signOut: async () => {},
  }
}

function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sessionToken(aal: string) {
  const header = b64url({ alg: 'none', typ: 'JWT' })
  const payload = b64url({
    iss: 'https://example.supabase.co/auth/v1',
    sub: '22222222-2222-4222-8222-222222222222',
    aud: 'authenticated',
    exp: 2000000000,
    iat: 1700000000,
    role: 'authenticated',
    aal,
    session_id: '00000000-0000-4000-8000-000000000001',
  })
  return `${header}.${payload}.sig`
}

async function mockSupabase(
  route: { request: () => { method: () => string; url: () => string; headers: () => Record<string, string> }; fulfill: (value: unknown) => Promise<void> },
  mode: { factors: boolean },
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
  const factors = mode.factors
    ? [{ id: 'factor-example', status: 'verified', factor_type: 'totp', friendly_name: 'Authenticator app' }]
    : []
  const user = {
    id: '22222222-2222-4222-8222-222222222222',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'member@example.com',
    factors,
    user_metadata: {},
  }
  const json = (body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
  if (url.includes('/logout')) return json({})
  if (url.includes('/auth/v1/user')) return json(user)
  if (url.includes('/auth/v1/factors')) return json({ all: factors, totp: factors })
  if (url.includes('/auth/v1/token')) {
    return json({
      access_token: sessionToken(mode.factors ? 'aal1' : 'aal1'),
      refresh_token: 'refresh-example',
      expires_in: 3600,
      expires_at: 2000000000,
      token_type: 'bearer',
      user,
    })
  }
  if (url.includes('/rest/v1/rpc/')) return json([])
  if (url.includes('/rest/v1/staff_users')) return json({ code: 'PGRST116', message: '0 rows' }, 406)
  if (url.includes('/rest/v1/members')) {
    const row = {
      user_id: user.id,
      email: 'member@example.com',
      seat: 'ksa',
      status: 'active',
      must_set_password: false,
      invites_remaining: 2,
      invites_granted: 2,
      founding_number: 1,
      tier: 'founding',
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
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/')) return json(single ? null : [])
  return json({})
}
