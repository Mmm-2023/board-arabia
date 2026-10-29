import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'
import { assembleHome, type AssembleInput } from '../src/lib/homeSnapshot.ts'
import { stampPromptDismissal } from '../src/lib/mfaFlow.ts'
import {
  profileCardVisible,
  profileCompleteness,
  WEEKLY_INTROS_CARD_LINE,
  WEEKLY_INTROS_EMPTY,
  weeklyIntrosOn,
} from '../src/lib/profileCompleteness.ts'
import {
  isProfilePromptDismissed,
  NO_SUGGESTIONS_THIS_WEEK,
  profilePromptStorageKey,
  suggestionProfileFromFields,
} from '../src/lib/suggestionProfile.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const EXAMPLE_MEMBER = 'example-member'
const EXAMPLE_OTHER = 'example-other'
const EXAMPLE_STAFF = 'example-staff'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function render(node: ReactNode) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

const emptyRows = profileCompleteness({
  photo: false,
  name: '',
  title: '',
  organisation: '',
  city: '',
  sectorCount: 0,
  availabilitySet: false,
})

const completeRows = profileCompleteness({
  photo: true,
  name: 'Example Member',
  title: 'Chair',
  organisation: 'Example House',
  city: 'Riyadh',
  sectorCount: 1,
  availabilitySet: true,
})

test('suggestion fields come from the member profile and dismissal is per member', () => {
  assert.deepEqual(suggestionProfileFromFields(null), {
    sectorSet: false,
    themeSet: false,
    locationSet: false,
    availabilitySet: false,
  })
  assert.deepEqual(
    suggestionProfileFromFields({ location: '  ', sector_tags: [], vision_themes: ['Not a theme'] }),
    { sectorSet: false, themeSet: false, locationSet: false, availabilitySet: false },
  )
  const tagsOnly = suggestionProfileFromFields({
    location: '',
    sector_tags: ['Health'],
    vision_themes: [],
    availability: 'open',
  })
  assert.equal(weeklyIntrosOn({ sectorCount: tagsOnly.sectorSet ? 1 : 0, availabilitySet: tagsOnly.availabilitySet }), true)
  assert.equal(weeklyIntrosOn({ sectorCount: 1, availabilitySet: true }), true)
  assert.equal(weeklyIntrosOn({ sectorCount: 1, availabilitySet: false }), false)
  assert.equal(weeklyIntrosOn({ sectorCount: 0, availabilitySet: true }), false)
  assert.notEqual(profilePromptStorageKey(EXAMPLE_MEMBER), profilePromptStorageKey(EXAMPLE_OTHER))
  assert.equal(isProfilePromptDismissed('1'), true)
  assert.equal(isProfilePromptDismissed(null), false)
  assert.equal(isProfilePromptDismissed('0'), false)

  const loader = read('src/lib/suggestionProfileLoad.ts')
  assert.match(loader, /\.select\('location, sector_tags, vision_themes, availability'\)/)
  assert.match(loader, /\.eq\('user_id', userId\)/)
  assert.equal(loader.includes('security definer'), false)
  assert.match(read('src/pages/dashboard/DashboardHome.tsx'), /staff=\{staffRole != null\}/)
  assert.match(read('src/pages/dashboard/ProfileCompletenessPrompt.tsx'), /profileCardVisible\(\{ staff, dismissed, status, rows \}\)/)
  assert.equal(profileCardVisible({ staff: true, dismissed: false, status: 'ready', rows: emptyRows }), false)
  assert.equal(profileCardVisible({ staff: false, dismissed: true, status: 'ready', rows: emptyRows }), false)
  assert.equal(profileCardVisible({ staff: false, dismissed: false, status: 'ready', rows: completeRows }), false)
  assert.equal(profileCardVisible({ staff: false, dismissed: false, status: 'ready', rows: emptyRows }), true)
  assert.match(read('src/pages/dashboard/IntrosPage.tsx'), /weeklyIntrosOn/)
  for (const file of [
    'src/pages/dashboard/ProfilePage.tsx',
    'src/pages/dashboard/DashboardHome.tsx',
    'src/pages/dashboard/IntrosPage.tsx',
  ]) {
    assert.match(read(file), /profileCompleteness|weeklyIntrosOn/)
  }

  const owned = [
    'src/lib/suggestionProfile.ts',
    'src/lib/suggestionProfileLoad.ts',
    'src/pages/dashboard/ProfileCompletenessPrompt.tsx',
    'src/pages/dashboard/IntroSuggestions.tsx',
  ]
  for (const file of owned) {
    const text = read(file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
    assert.equal(/\bthe desk\b/i.test(text), false, file)
    assert.equal(/nammco/i.test(text), false, file)
    assert.equal(/@(?!example\.com)/.test(text), false, file)
  }
})

test('the prompt is member-only and the empty states use the two lines', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const prompt = await vite.ssrLoadModule('/src/pages/dashboard/ProfileCompletenessPrompt.tsx')
    const suggestions = await vite.ssrLoadModule('/src/pages/dashboard/IntroSuggestions.tsx')
    const props = {
      rows: [],
      quota: null,
      introStatus: () => null,
      busyId: null,
      errorId: null,
      error: '',
      showEmpty: true,
      onRequest: () => {},
    }
    const needs = render(createElement(suggestions.IntroSuggestions, { ...props, emptyMode: 'needs_tags' }))
    assert.match(needs, new RegExp(WEEKLY_INTROS_EMPTY.replace(/[.]/g, '\\.')))
    assert.equal(needs.includes(NO_SUGGESTIONS_THIS_WEEK), false)
    assert.equal(anchorHrefs(needs), 1)
    assert.match(needs, /href="\/dashboard\/profile#focus"/)
    assert.match(needs, />Fill it in</)
    assert.equal(directoryLinks(needs), 0)

    const complete = render(createElement(suggestions.IntroSuggestions, { ...props, emptyMode: 'complete' }))
    assert.match(complete, /No suggested introductions this week\./)
    assert.equal(complete.includes(WEEKLY_INTROS_EMPTY), false)
    assert.equal(anchorHrefs(complete), 0)

    const member = render(
      createElement(prompt.ProfileCompletenessPrompt, {
        userId: EXAMPLE_MEMBER,
        staff: false,
        status: 'ready',
        rows: emptyRows,
      }),
    )
    assert.match(member, /data-profile-prompt/)
    assert.match(member, new RegExp(WEEKLY_INTROS_CARD_LINE.replace(/[.]/g, '\\.')))
    assert.match(member, />Fill it in</)
    assert.match(member, />Dismiss</)
    assert.equal(anchorHrefs(member), 1)

    const staff = render(
      createElement(prompt.ProfileCompletenessPrompt, {
        userId: EXAMPLE_STAFF,
        staff: true,
        status: 'ready',
        rows: emptyRows,
      }),
    )
    assert.equal(staff.includes('data-profile-prompt'), false)
    assert.equal(staff.includes(WEEKLY_INTROS_CARD_LINE), false)

    const done = render(
      createElement(prompt.ProfileCompletenessPrompt, {
        userId: EXAMPLE_MEMBER,
        staff: false,
        status: 'ready',
        rows: completeRows,
      }),
    )
    assert.equal(done.includes('data-profile-prompt'), false)
  } finally {
    await vite.close()
  }
})

function quietHome() {
  const input: AssembleInput = {
    nowMs: Date.parse('2026-10-05T09:00:00.000Z'),
    seat: 'ksa',
    name: 'Example Member',
    photoUrl: null,
    profileReady: true,
    mustSetPassword: false,
    invitesRemaining: 0,
    personalCapacityIncluded: false,
    attention: [],
    mandates: [],
    rooms: [],
    directory: [],
    partners: [],
    gatherings: [],
    admitted: 2,
    ksa: 1,
    intl: 1,
    money: [],
    activity: [],
    activityStatus: 'empty',
    loading: false,
    partialError: false,
    updatedLabel: null,
    profileMatch: { status: 'ready', availabilitySet: true, sectorSet: true },
  }
  return assembleHome(input)
}

test('home keeps one next action and does not render suggestion cards', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const home = await vite.ssrLoadModule('/src/pages/dashboard/HomeSnapshotView.tsx')
    const model = quietHome()
    const quiet = render(createElement(home.HomeSnapshotView, { model, needsYou: [] }))
    assert.equal(quiet.includes('data-home-needs'), false)
    assert.equal(quiet.includes('Nothing needs you right now'), false)
    assert.equal(quiet.includes(NO_SUGGESTIONS_THIS_WEEK), false)
    assert.equal(quiet.includes(WEEKLY_INTROS_CARD_LINE), false)
    assert.equal((quiet.match(/data-home-cta=/g) || []).length, 1)
    assert.match(quiet, />Explore deals</)

    const withLink = render(createElement(home.HomeSnapshotView, {
      model,
      needsYou: [{
        id: 'suggestions',
        label: '2 suggested introductions for you',
        action: 'Suggested introductions',
        to: '/dashboard/people/intros',
      }],
    }))
    assert.match(withLink, /2 suggested introductions for you/)
    assert.match(withLink, /href="\/dashboard\/people\/intros"/)
    assert.equal(withLink.includes(NO_SUGGESTIONS_THIS_WEEK), false)
    assert.equal(withLink.includes('IntroSuggestions'), false)
  } finally {
    await vite.close()
  }
})

test('home, intros, and profile show the prompt and both empty states', async (t) => {
  const chrome = resolveChromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const shotDir = process.env.UX_F_SHOT_DIR || path.join(tmpdir(), 'ux-f-shots')
  mkdirSync(shotDir, { recursive: true })
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
    await captureMember(browser, origin, shotDir, 'empty', 1280, 900, 'home-prompt-empty-1280.png', 'intros-needs-tags-1280.png', 'profile-destination-1280.png')
    await captureMember(browser, origin, shotDir, 'empty', 390, 844, 'home-prompt-empty-390.png', 'intros-needs-tags-390.png', 'profile-destination-390.png')
    await captureMember(browser, origin, shotDir, 'complete', 1280, 900, 'home-complete-1280.png')
    await captureMember(browser, origin, shotDir, 'complete', 390, 844, 'home-complete-390.png')
    await assertStaffSeesNoPrompt(browser, origin)
    for (const name of [
      'home-prompt-empty-1280.png',
      'home-prompt-empty-390.png',
      'intros-needs-tags-1280.png',
      'intros-needs-tags-390.png',
      'home-complete-1280.png',
      'home-complete-390.png',
      'profile-destination-1280.png',
      'profile-destination-390.png',
    ]) {
      const bytes = readFileSync(path.join(shotDir, name))
      assert.equal(bytes.toString('ascii', 1, 4), 'PNG', name)
      assert.ok(bytes.length > 2000, name)
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})

async function captureMember(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  origin: string,
  shotDir: string,
  tags: 'empty' | 'complete',
  width: number,
  height: number,
  homeShot: string,
  introsShot?: string,
  profileShot?: string,
) {
  const context = await browser.newContext({ viewport: { width, height } })
  await context.route('**/*supabase.co/**', (route) => mockSupabase(route, tags === 'complete' ? 'complete' : 'member'))
  await context.addInitScript(
    ([access, memberId, dismissed]) => {
      localStorage.setItem(
        'sb-example-auth-token',
        JSON.stringify({
          access_token: access,
          refresh_token: 'refresh-example',
          expires_in: 3600,
          expires_at: 2000000000,
          token_type: 'bearer',
          user: {
            id: memberId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'member@example.com',
          },
        }),
      )
      localStorage.setItem('ba-mfa-prompt-dismissed', dismissed)
    },
    [sessionToken(EXAMPLE_MEMBER), EXAMPLE_MEMBER, stampPromptDismissal(EXAMPLE_MEMBER, null, Date.now())] as const,
  )
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  try {
    await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded' })
    if (tags === 'empty') {
      await page.getByText(WEEKLY_INTROS_CARD_LINE).waitFor()
      assert.equal(await page.getByText('Your profile is 3 steps from complete').count(), 0)
      assert.equal(await page.getByText('Finish your profile: add sector and availability').count(), 0)
      assert.equal(await page.getByText(WEEKLY_INTROS_EMPTY).count(), 0)
      assert.equal(await page.getByText(NO_SUGGESTIONS_THIS_WEEK).count(), 0)
      assert.equal(await page.locator('[data-profile-prompt]').count(), 1)
      assert.equal(await page.locator('[data-needs-item="profile"]').count(), 0)
      assert.equal(await page.locator('[data-profile-prompt] a').getAttribute('href'), '/dashboard/profile#your-card')
      await saveShot(
        page,
        '[data-profile-prompt]',
        path.join(shotDir, homeShot),
        width,
        '[data-profile-prompt] a',
      )
      if (introsShot) {
        await page.goto(`${origin}/dashboard/people/intros`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Intros' }).waitFor()
        await page.getByText(WEEKLY_INTROS_EMPTY).waitFor()
        assert.equal(await page.getByText(NO_SUGGESTIONS_THIS_WEEK).count(), 0)
        assert.equal(await page.locator('[data-profile-prompt]').count(), 0)
        await saveShot(page, '[data-intro-suggestions]', path.join(shotDir, introsShot), width)
      }
      if (profileShot) {
        await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded' })
        await page.getByText(WEEKLY_INTROS_CARD_LINE).waitFor()
        await page.locator('[data-profile-prompt] a').click()
        await page.waitForURL((url) => url.pathname === '/dashboard/profile' && url.hash === '#your-card')
        await page.getByRole('heading', { name: 'Your details' }).waitFor()
        await page.locator('[data-profile-card-preview]').waitFor()
        await page.locator('#profile-name').waitFor()
        if (width < 800) {
          await page.screenshot({ path: path.join(shotDir, profileShot) })
        } else {
          await page.locator('[data-profile-card-preview]').screenshot({ path: path.join(shotDir, profileShot) })
        }
      }
      return
    }
    await page.getByRole('link', { name: 'Explore deals' }).waitFor()
    assert.equal(await page.getByText(NO_SUGGESTIONS_THIS_WEEK).count(), 0)
    assert.equal(await page.getByText(WEEKLY_INTROS_CARD_LINE).count(), 0)
    assert.equal(await page.getByText(WEEKLY_INTROS_EMPTY).count(), 0)
    assert.equal(await page.locator('[data-profile-prompt]').count(), 0)
    assert.equal(await page.locator('[data-needs-item="profile"]').count(), 0)
    await saveShot(page, '[data-home-next]', path.join(shotDir, homeShot), width)
  } finally {
    await context.close()
  }
}

async function assertStaffSeesNoPrompt(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  origin: string,
) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.route('**/*supabase.co/**', (route) => mockSupabase(route, 'staff'))
  await context.addInitScript(
    ([access, staffId]) => {
      localStorage.setItem(
        'sb-example-auth-token',
        JSON.stringify({
          access_token: access,
          refresh_token: 'refresh-example',
          expires_in: 3600,
          expires_at: 2000000000,
          token_type: 'bearer',
          user: {
            id: staffId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'staff@example.com',
          },
        }),
      )
    },
    [sessionToken(EXAMPLE_STAFF), EXAMPLE_STAFF] as const,
  )
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  try {
    await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL((url) => url.pathname.startsWith('/admin') || url.pathname.startsWith('/login'))
    assert.equal(await page.locator('[data-profile-prompt]').count(), 0)
    assert.equal(await page.getByText(WEEKLY_INTROS_CARD_LINE).count(), 0)
    assert.equal(await page.getByText(WEEKLY_INTROS_EMPTY).count(), 0)
  } finally {
    await context.close()
  }
}

async function saveShot(page: Page, selector: string, file: string, width: number, pin?: string) {
  const target = page.locator(selector)
  if (width >= 800) {
    await target.screenshot({ path: file })
    return
  }
  const placed = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!(el instanceof HTMLElement)) return `missing:${sel}`
    const root = document.documentElement
    root.style.scrollBehavior = 'auto'
    const rect = el.getBoundingClientRect()
    const next = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2
    window.scrollTo(0, Math.max(0, next))
    const after = el.getBoundingClientRect()
    return `top=${Math.round(after.top)} scroll=${Math.round(window.scrollY)}`
  }, pin ?? selector)
  if (pin && !placed.startsWith('top=')) throw new Error(placed)
  if (pin) {
    const top = Number(placed.slice(placed.indexOf('top=') + 4, placed.indexOf(' ')))
    if (top > 700 || top < 40) throw new Error(`prompt link not in view: ${placed}`)
  }
  await page.screenshot({ path: file })
}

function anchorHrefs(html: string) {
  return (html.match(/<a\b/g) || []).length
}

function directoryLinks(html: string) {
  return [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter((text) => text === 'Directory').length
}

function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sessionToken(subject: string) {
  const header = b64url({ alg: 'none', typ: 'JWT' })
  const payload = b64url({
    iss: 'https://example.supabase.co/auth/v1',
    sub: subject,
    aud: 'authenticated',
    exp: 2000000000,
    iat: 1700000000,
    role: 'authenticated',
    aal: 'aal1',
    session_id: 'example-session',
  })
  return `${header}.${payload}.sig`
}

async function mockSupabase(
  route: {
    request: () => { method: () => string; url: () => string; headers: () => Record<string, string> }
    fulfill: (value: unknown) => Promise<void>
  },
  mode: 'member' | 'complete' | 'staff',
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
  const staff = mode === 'staff'
  const subject = staff ? EXAMPLE_STAFF : EXAMPLE_MEMBER
  const email = staff ? 'staff@example.com' : 'member@example.com'
  const user = {
    id: subject,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    factors: [],
    user_metadata: {},
  }
  const json = (body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
  if (url.includes('/logout')) return json({})
  if (url.includes('/auth/v1/user')) return json(user)
  if (url.includes('/auth/v1/factors')) return json({ all: [], totp: [] })
  if (url.includes('/auth/v1/token')) {
    return json({
      access_token: sessionToken(subject),
      refresh_token: 'refresh-example',
      expires_in: 3600,
      expires_at: 2000000000,
      token_type: 'bearer',
      user,
    })
  }
  if (url.includes('/rest/v1/rpc/')) return json([])
  if (url.includes('/rest/v1/staff_users')) {
    if (!staff) return json({ code: 'PGRST116', message: '0 rows' }, 406)
    const row = { role: 'staff' }
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/members')) {
    if (staff) return json({ code: 'PGRST116', message: '0 rows' }, 406)
    const row = {
      user_id: subject,
      email,
      seat: 'ksa',
      status: 'active',
      must_set_password: false,
      invites_remaining: 0,
      invites_granted: 0,
      founding_number: null,
      tier: 'founding',
    }
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/profiles')) {
    if (staff) return json(single ? null : [])
    const complete = mode === 'complete'
    const row = {
      user_id: subject,
      full_name: 'Example Member',
      headline: 'Chair',
      company: 'Example Co',
      location: complete ? 'Riyadh' : '',
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
      avatar_path: complete ? 'example-member/avatar' : null,
      avatar_style: 'male',
      availability: complete ? 'open' : null,
      sector_tags: complete ? ['Health'] : [],
      vision_themes: [],
    }
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/')) return json(single ? null : [])
  return json({})
}
