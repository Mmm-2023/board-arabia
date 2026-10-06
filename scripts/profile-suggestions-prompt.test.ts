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
import { stampPromptDismissal } from '../src/lib/mfaFlow.ts'
import {
  ADD_SECTORS_AND_THEMES,
  isProfilePromptDismissed,
  NO_SUGGESTIONS_THIS_WEEK,
  PROFILE_PROMPT_LINE,
  profilePromptStorageKey,
  suggestionProfileFromFields,
  suggestionProfileNeedsPrompt,
  suggestionTagsReady,
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

const emptyProfile = {
  status: 'ready' as const,
  sectorSet: false,
  themeSet: false,
  locationSet: false,
}

const completeProfile = {
  status: 'ready' as const,
  sectorSet: true,
  themeSet: true,
  locationSet: true,
}

test('suggestion fields come from the member profile and dismissal is per member', () => {
  assert.deepEqual(suggestionProfileFromFields(null), {
    sectorSet: false,
    themeSet: false,
    locationSet: false,
  })
  assert.deepEqual(
    suggestionProfileFromFields({ location: '  ', sector_tags: [], vision_themes: ['Not a theme'] }),
    { sectorSet: false, themeSet: false, locationSet: false },
  )
  const tagsOnly = suggestionProfileFromFields({
    location: '',
    sector_tags: ['Health'],
    vision_themes: ['Housing'],
  })
  assert.equal(suggestionTagsReady(tagsOnly), true)
  assert.equal(suggestionProfileNeedsPrompt(tagsOnly), true)
  const located = suggestionProfileFromFields({
    location: 'Riyadh',
    sector_tags: ['Health'],
    vision_themes: ['Housing'],
  })
  assert.equal(suggestionTagsReady(located), true)
  assert.equal(suggestionProfileNeedsPrompt(located), false)
  assert.equal(suggestionTagsReady({ sectorSet: true, themeSet: false }), false)
  assert.equal(suggestionTagsReady({ sectorSet: false, themeSet: true }), false)
  assert.notEqual(profilePromptStorageKey(EXAMPLE_MEMBER), profilePromptStorageKey(EXAMPLE_OTHER))
  assert.equal(isProfilePromptDismissed('1'), true)
  assert.equal(isProfilePromptDismissed(null), false)
  assert.equal(isProfilePromptDismissed('0'), false)

  const loader = read('src/lib/suggestionProfileLoad.ts')
  assert.match(loader, /\.select\('location, sector_tags, vision_themes'\)/)
  assert.match(loader, /\.eq\('user_id', userId\)/)
  assert.equal(loader.includes('security definer'), false)
  assert.match(read('src/pages/dashboard/DashboardHome.tsx'), /staff=\{staffRole != null\}/)
  assert.match(read('src/pages/dashboard/ProfileCompletenessPrompt.tsx'), /if \(staff\) return null/)
  assert.match(read('src/pages/dashboard/IntrosPage.tsx'), /emptyMode=\{suggestionTagsReady/)

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
    assert.match(needs, new RegExp(ADD_SECTORS_AND_THEMES.replace(/[.]/g, '\\.')))
    assert.equal(needs.includes(NO_SUGGESTIONS_THIS_WEEK), false)
    assert.equal(anchorHrefs(needs), 1)
    assert.match(needs, /href="\/dashboard\/profile#profile-tags"/)
    assert.match(needs, />Profile</)
    assert.equal(directoryLinks(needs), 0)

    const complete = render(createElement(suggestions.IntroSuggestions, { ...props, emptyMode: 'complete' }))
    assert.match(complete, /No suggested introductions this week\./)
    assert.equal(complete.includes(ADD_SECTORS_AND_THEMES), false)
    assert.equal(anchorHrefs(complete), 0)

    const member = render(
      createElement(prompt.ProfileCompletenessPrompt, {
        userId: EXAMPLE_MEMBER,
        staff: false,
        profile: emptyProfile,
      }),
    )
    assert.match(member, /data-profile-prompt/)
    assert.match(member, /Intro suggestions depend on them/)
    assert.match(member, />Profile</)
    assert.match(member, />Dismiss</)
    assert.equal(anchorHrefs(member), 1)

    const staff = render(
      createElement(prompt.ProfileCompletenessPrompt, {
        userId: EXAMPLE_STAFF,
        staff: true,
        profile: emptyProfile,
      }),
    )
    assert.equal(staff.includes('data-profile-prompt'), false)
    assert.equal(staff.includes(PROFILE_PROMPT_LINE), false)

    const done = render(
      createElement(prompt.ProfileCompletenessPrompt, {
        userId: EXAMPLE_MEMBER,
        staff: false,
        profile: completeProfile,
      }),
    )
    assert.equal(done.includes('data-profile-prompt'), false)
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
      await page.getByText(PROFILE_PROMPT_LINE).waitFor()
      await page.getByText(ADD_SECTORS_AND_THEMES).waitFor()
      assert.equal(await page.getByText(NO_SUGGESTIONS_THIS_WEEK).count(), 0)
      const empty = page.locator('[data-suggestion-empty="needs-tags"]')
      assert.equal(await empty.getByRole('link').count(), 1)
      await saveShot(
        page,
        'section[aria-label="Next actions"]',
        path.join(shotDir, homeShot),
        width,
        '[data-suggestion-empty="needs-tags"] a',
      )
      if (width === 1280) {
        await page.getByRole('button', { name: 'Dismiss' }).click()
        await page.locator('[data-profile-prompt]').waitFor({ state: 'hidden' })
        const stored = await page.evaluate(
          (key) => localStorage.getItem(key),
          profilePromptStorageKey(EXAMPLE_MEMBER),
        )
        assert.equal(stored, '1')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByText(ADD_SECTORS_AND_THEMES).waitFor()
        assert.equal(await page.locator('[data-profile-prompt]').count(), 0)
      }
      if (introsShot) {
        await page.goto(`${origin}/dashboard/people/intros`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Intros' }).waitFor()
        await page.getByText(ADD_SECTORS_AND_THEMES).waitFor()
        assert.equal(await page.getByText(NO_SUGGESTIONS_THIS_WEEK).count(), 0)
        assert.equal(await page.locator('[data-profile-prompt]').count(), 0)
        await saveShot(page, '[data-intro-suggestions]', path.join(shotDir, introsShot), width)
      }
      if (profileShot) {
        await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded' })
        await page.getByText(ADD_SECTORS_AND_THEMES).waitFor()
        await page.locator('[data-suggestion-empty="needs-tags"] a').click()
        await page.waitForURL((url) => url.pathname === '/dashboard/profile')
        await page.getByRole('heading', { name: 'Your details' }).waitFor()
        await page.getByText('Sector', { exact: true }).waitFor()
        await page.getByText('Vision 2030', { exact: true }).waitFor()
        if (width < 800) {
          await page.locator('#profile-tags').scrollIntoViewIfNeeded()
          await page.evaluate(() => {
            const el = document.getElementById('profile-tags')
            if (!(el instanceof HTMLElement)) return
            document.documentElement.style.scrollBehavior = 'auto'
            const top = el.getBoundingClientRect().top
            window.scrollTo(0, Math.max(0, window.scrollY + top - 72))
          })
          await page.screenshot({ path: path.join(shotDir, profileShot) })
        } else {
          await page.locator('form').filter({ hasText: 'Location' }).screenshot({ path: path.join(shotDir, profileShot) })
        }
      }
      return
    }
    await page.getByText(NO_SUGGESTIONS_THIS_WEEK).waitFor()
    assert.equal(await page.getByText(PROFILE_PROMPT_LINE).count(), 0)
    assert.equal(await page.getByText(ADD_SECTORS_AND_THEMES).count(), 0)
    assert.equal(await page.locator('[data-profile-prompt]').count(), 0)
    await saveShot(page, '[data-suggestion-empty="complete"]', path.join(shotDir, homeShot), width)
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
    assert.equal(await page.getByText(PROFILE_PROMPT_LINE).count(), 0)
    assert.equal(await page.getByText(ADD_SECTORS_AND_THEMES).count(), 0)
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
      avatar_path: null,
      avatar_style: 'male',
      availability: null,
      sector_tags: complete ? ['Health'] : [],
      vision_themes: complete ? ['Housing'] : [],
    }
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/')) return json(single ? null : [])
  return json({})
}
