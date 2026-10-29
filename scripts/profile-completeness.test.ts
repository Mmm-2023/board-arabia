import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'
import {
  addThingsLabel,
  firstMissingHref,
  profileCompleteness,
  profilePasswordTarget,
  weeklyIntrosOn,
  WEEKLY_INTROS_CARD_CTA,
  WEEKLY_INTROS_CARD_LINE,
} from '../src/lib/profileCompleteness.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const readyCard = {
  photo: true,
  name: 'Example Member',
  title: 'Chair',
  organisation: 'Example House',
  city: 'Riyadh',
  sectorCount: 1,
  availabilitySet: true,
}

test('one completeness module is the profile, home, and intros definition', () => {
  for (const file of [
    'src/pages/dashboard/ProfilePage.tsx',
    'src/pages/dashboard/DashboardHome.tsx',
    'src/pages/dashboard/IntrosPage.tsx',
    'src/pages/dashboard/IntroSuggestions.tsx',
  ]) {
    assert.match(read(file), /from '\.\.\/\.\.\/lib\/profileCompleteness'/)
  }
  const banned = [
    'Finish your profile: add sector and availability',
    'Add your sectors, themes, and location. Intro suggestions depend on them.',
    'Add your sectors and themes to get suggested introductions.',
    'Your profile is 3 steps from complete',
    'One step left to complete your profile',
  ]
  const scanned = [
    'src/lib/profileCompleteness.ts',
    'src/lib/homeSnapshot.ts',
    'src/lib/homeNeeds.ts',
    'src/lib/suggestionProfile.ts',
    'src/pages/dashboard/DashboardHome.tsx',
    'src/pages/dashboard/ProfilePage.tsx',
    'src/pages/dashboard/ProfileCompletenessPrompt.tsx',
    'src/pages/dashboard/IntroSuggestions.tsx',
  ]
  for (const file of scanned) {
    const text = read(file)
    for (const line of banned) assert.equal(text.includes(line), false, `${file} ${line}`)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
  }
  assert.equal(read('src/lib/profileCompleteness.ts').includes('%'), false)
  assert.equal(weeklyIntrosOn({ sectorCount: 1, availabilitySet: true }), true)
  assert.equal(addThingsLabel(1), 'Add 1 thing')
  assert.equal(addThingsLabel(3), 'Add 3 things')
  const open = profileCompleteness({ ...readyCard, photo: false, sectorCount: 1, availabilitySet: true })
  assert.equal(open.find((row) => row.id === 'weekly')?.done, true)
  assert.equal(open.some((row) => row.id === 'reasons' || row.id === 'board'), false)
  assert.equal(firstMissingHref(open), '/dashboard/profile#your-card')
  assert.equal(firstMissingHref(profileCompleteness(readyCard)), null)
})

test('PF-6 and PF-7 rows appear only when their fields are passed', () => {
  const plain = profileCompleteness(readyCard)
  assert.deepEqual(plain.map((row) => row.id), ['directory', 'weekly'])
  const reasons = profileCompleteness({ ...readyCard, helpWith: '', lookingFor: 'A board seat' })
  assert.deepEqual(reasons.map((row) => row.id), ['directory', 'weekly', 'reasons'])
  assert.equal(reasons.find((row) => row.id === 'reasons')?.addLabel, 'Add 1 thing')
  const board = profileCompleteness({ ...readyCard, boardSeatType: '', boardSeatWhere: '' })
  assert.deepEqual(board.map((row) => row.id), ['directory', 'board', 'weekly'])
  assert.equal(board.find((row) => row.id === 'board')?.href, '/dashboard/profile#boardroom')
  assert.equal(board.find((row) => row.id === 'board')?.addLabel, 'Add 2 things')
  const both = profileCompleteness({
    ...readyCard,
    helpWith: 'Governance',
    lookingFor: 'A board seat',
    boardSeatType: 'Chair',
    boardSeatWhere: 'Riyadh',
  })
  assert.equal(both.every((row) => row.done), true)
  assert.equal(firstMissingHref(both), null)
})

test('profile password hash redirects to the sign-in page anchor', () => {
  assert.equal(profilePasswordTarget('#password'), '/dashboard/two-step#password')
  assert.equal(profilePasswordTarget('#focus'), null)
  assert.equal(profilePasswordTarget(''), null)
  assert.match(read('src/pages/dashboard/DashboardHome.tsx'), /to: '\/dashboard\/two-step#password'/)
  assert.match(read('src/pages/dashboard/ProfilePage.tsx'), /to="\/dashboard\/two-step#password"/)
  assert.match(read('src/pages/dashboard/ProfilePage.tsx'), /profilePasswordTarget\(hash\)/)
  assert.equal(read('src/shell/destinations.ts').includes('password'), false)
  const migrations = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'))
  assert.equal(migrations.some((name) => /profile_completeness|profile-page/.test(name)), false)
  assert.equal(migrations.includes('20270107120000_staff_list_profiles.sql'), true)
})

test('profile fold, sticky save, and the set-password route', async (t) => {
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
  const mode = { password: false }
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await context.route('**/*supabase.co/**', (route) => mockSupabase(route, mode))
    await context.addInitScript((access) => {
      localStorage.setItem(
        'sb-example-auth-token',
        JSON.stringify({
          access_token: access,
          refresh_token: 'refresh-example',
          expires_in: 3600,
          expires_at: 2000000000,
          token_type: 'bearer',
          user: {
            id: 'example-member',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'member@example.com',
          },
        }),
      )
    }, sessionToken())
    const page = await context.newPage()
    page.setDefaultTimeout(20000)

    await page.goto(`${origin}/dashboard/profile`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Your details' }).waitFor()
    await page.locator('[data-profile-card-preview]').waitFor()
    await page.locator('#profile-name').waitFor()
    const fold = await page.evaluate(() => {
      const card = document.querySelector('[data-profile-card-preview]')
      const name = document.getElementById('profile-name')
      const bar = document.querySelector('.shell-tab-bar')
      const barTop = bar instanceof HTMLElement ? bar.getBoundingClientRect().top : window.innerHeight
      return {
        cardTop: card instanceof HTMLElement ? card.getBoundingClientRect().top : -1,
        nameTop: name instanceof HTMLElement ? name.getBoundingClientRect().top : -1,
        nameBottom: name instanceof HTMLElement ? name.getBoundingClientRect().bottom : 9999,
        barTop,
      }
    })
    assert.ok(fold.cardTop >= 0 && fold.cardTop < fold.barTop, JSON.stringify(fold))
    assert.ok(fold.nameBottom <= fold.barTop + 1, JSON.stringify(fold))
    assert.equal(await page.locator('[data-profile-save-sticky]').count(), 0)
    assert.equal(await page.getByRole('heading', { name: 'Password' }).count(), 0)
    assert.equal(await page.getByRole('link', { name: 'Leave Board Arabia' }).count(), 0)

    await page.locator('#profile-name').fill('Example Edited')
    const sticky = page.locator('[data-profile-save-sticky]')
    await sticky.waitFor()
    const box = await sticky.locator('button').boundingBox()
    assert.ok(box && box.height >= 48, JSON.stringify(box))
    const gap = await page.evaluate(() => {
      const bar = document.querySelector('.shell-tab-bar')
      const save = document.querySelector('[data-profile-save-sticky]')
      if (!(bar instanceof HTMLElement) || !(save instanceof HTMLElement)) return -1
      return bar.getBoundingClientRect().top - save.getBoundingClientRect().bottom
    })
    assert.ok(gap >= -1, `sticky gap ${gap}`)

    let asked = false
    page.once('dialog', async (dialog) => {
      asked = true
      assert.match(dialog.message(), /Your profile changes are not saved/)
      await dialog.dismiss()
    })
    await page.locator('.shell-tab-bar a[data-destination="Home"]').click()
    await page.waitForTimeout(300)
    assert.equal(asked, true)
    assert.equal(new URL(page.url()).pathname, '/dashboard/profile')

    await page.goto(`${origin}/dashboard/profile#password`)
    await page.locator('#password').waitFor()
    const landed = new URL(page.url())
    assert.equal(landed.pathname, '/dashboard/two-step')
    assert.equal(landed.hash, '#password')
    await page.getByRole('heading', { name: 'Two-step sign-in' }).waitFor()

    mode.password = true
    await page.goto(`${origin}/dashboard`)
    await page.getByRole('link', { name: 'Set password' }).waitFor()
    const order = await page.evaluate(() => {
      const password = document.querySelector('[data-needs-item="password"]')
      const card = document.querySelector('[data-profile-prompt]')
      if (!(password instanceof HTMLElement) || !(card instanceof HTMLElement)) return ''
      return password.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING ? 'password-first' : 'card-first'
    })
    assert.equal(order, 'password-first')
    assert.equal(await page.getByText(WEEKLY_INTROS_CARD_LINE).count(), 1)
    assert.equal(await page.getByRole('link', { name: WEEKLY_INTROS_CARD_CTA }).count(), 1)
    await page.getByRole('link', { name: 'Set password' }).click()
    await page.locator('#new-password').waitFor()
    assert.equal(new URL(page.url()).pathname, '/dashboard/two-step')
    assert.match(await page.locator('#password').innerText(), /Replace the invitation/)
  } finally {
    await browser.close()
    await vite.close()
  }
})

function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sessionToken() {
  const header = b64url({ alg: 'none', typ: 'JWT' })
  const payload = b64url({
    iss: 'https://example.supabase.co/auth/v1',
    sub: 'example-member',
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
  mode: { password: boolean },
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
    id: 'example-member',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'member@example.com',
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
      access_token: sessionToken(),
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
      user_id: 'example-member',
      email: 'member@example.com',
      seat: 'ksa',
      status: 'active',
      must_set_password: mode.password,
      invites_remaining: 0,
      invites_granted: 0,
      founding_number: null,
      tier: 'founding',
    }
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/profiles')) {
    const row = {
      user_id: 'example-member',
      full_name: 'Example Member',
      headline: 'Chair',
      company: 'Example House',
      location: '',
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
      sector_tags: [],
      vision_themes: [],
      city_key: null,
    }
    return json(single ? row : [row])
  }
  if (url.includes('/rest/v1/')) return json(single ? null : [])
  return json({})
}
