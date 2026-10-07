/**
 * Shots of the running app. Partner interest and gallery reads are stubbed
 * because the migration is not applied. The pages, form, and routes are the app.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.env.TRUSTED_PARTNERS_SHOT_DIR || '/opt/cursor/artifacts/trusted-partners'
fs.mkdirSync(outDir, { recursive: true })

const png = fs.readFileSync(path.join(root, 'scripts/smoke/fixture-logo.png'))
const envText = fs.readFileSync(path.join(root, '.env'), 'utf8')
const supabaseUrl = envText.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
if (!supabaseUrl) throw new Error('missing supabase url')
const host = new URL(supabaseUrl).host
const userId = '11111111-1111-4111-8111-111111111111'

const gallery = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    is_partner: true,
    name: 'Example Capital',
    blurb: 'One line for a fixture partner.',
    monogram: 'EC',
    logo_path: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/logo',
    category_slug: 'investment-banking',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    is_partner: false,
    name: 'Example Advisory',
    blurb: 'One line for a fixture adviser.',
    monogram: 'EA',
    logo_path: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/logo',
    category_slug: null,
  },
]

function chromePath() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

const executablePath = chromePath()
if (!executablePath) throw new Error('Chrome is not installed')

const dev = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '4177', '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
})

function json(status, body) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

async function waitFor(url) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status === 404) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function shoot(page, name, width) {
  const file = path.join(outDir, `${name}-${width}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(file)
}

try {
  await waitFor('http://127.0.0.1:4177/partners')
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
      let interestMode = 'ok'
      await page.route(`**://${host}/**`, async (route) => {
        const url = route.request().url()
        if (url.includes('/storage/v1/object/public/partner-logos/')) {
          await route.fulfill({ status: 200, contentType: 'image/png', body: png })
          return
        }
        if (url.includes('/rest/v1/rpc/list_trusted_partners')) {
          await route.fulfill(json(200, gallery))
          return
        }
        if (url.includes('/rest/v1/rpc/list_partner_categories')) {
          await route.fulfill(json(200, []))
          return
        }
        if (url.includes('/rest/v1/rpc/submit_partner_interest')) {
          if (interestMode === 'busy') {
            await route.fulfill(json(400, { code: 'P0001', message: 'busy_today', details: null, hint: null }))
            return
          }
          await route.fulfill(json(200, { ok: true }))
          return
        }
        if (url.includes('/rest/v1/rpc/list_sponsor_showcase')) {
          await route.fulfill(
            json(200, [
              {
                id: gallery[0].id,
                name: gallery[0].name,
                blurb: gallery[0].blurb,
                offer: 'A fixture offer.',
                monogram: gallery[0].monogram,
                logo_path: gallery[0].logo_path,
                category_slug: gallery[0].category_slug,
                my_request: null,
              },
            ]),
          )
          return
        }
        if (url.includes('/rest/v1/rpc/sponsor_intro_counts')) {
          await route.fulfill(json(200, { pending: 1, approved: 2 }))
          return
        }
        if (url.includes('/auth/v1/user')) {
          await route.fulfill(
            json(200, {
              id: userId,
              aud: 'authenticated',
              role: 'authenticated',
              email: 'member@example.com',
              app_metadata: { provider: 'email' },
              user_metadata: {},
              created_at: '2026-01-01T00:00:00.000Z',
            }),
          )
          return
        }
        if (url.includes('/rest/v1/staff_users') || url.includes('/rest/v1/candidates')) {
          await route.fulfill({
            status: 406,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }),
          })
          return
        }
        if (url.includes('/rest/v1/members')) {
          await route.fulfill(
            json(200, {
              user_id: userId,
              email: 'member@example.com',
              seat: 'ksa',
              status: 'active',
              must_set_password: false,
              invites_remaining: 0,
              invites_granted: 2,
              founding_number: null,
              tier: 'member',
            }),
          )
          return
        }
        if (url.includes('/rest/v1/profiles')) {
          await route.fulfill(
            json(200, {
              user_id: userId,
              full_name: 'Example Member',
              headline: 'Example chair',
              company: 'Example Firm',
              location: 'Riyadh',
              linkedin_url: null,
              bio: null,
              phone: null,
              avatar_path: null,
              avatar_style: 'male',
            }),
          )
          return
        }
        if (url.includes('/rest/v1/rpc/')) {
          await route.fulfill(json(200, []))
          return
        }
        await route.fulfill(json(200, []))
      })

      interestMode = 'ok'
      await page.goto('http://127.0.0.1:4177/partners', { waitUntil: 'networkidle' })
      await page.waitForSelector('text=Partner with us')
      await shoot(page, 'partners-form', width)

      await page.locator('#partner_name').fill('Example Person')
      await page.locator('#partner_firm').fill('Example Firm')
      await page.locator('#partner_category').selectOption({ index: 1 })
      await page.getByRole('button', { name: 'Partner with us' }).click()
      await page.waitForSelector('text=Thanks, our admin team will be in touch if it is a fit.')
      await shoot(page, 'partners-success', width)

      interestMode = 'busy'
      await page.getByRole('button', { name: 'Partner with us' }).click()
      await page.waitForSelector('text=We have had a lot of requests today. Please try again tomorrow.')
      await shoot(page, 'partners-busy', width)

      await page.goto('http://127.0.0.1:4177/', { waitUntil: 'networkidle' })
      await page.waitForSelector('text=Trusted advisers')
      await page.waitForSelector('text=Example Capital')
      await page.waitForSelector('text=Example Advisory')
      await shoot(page, 'home-advisers', width)

      await page.addInitScript(
        ({ storageKey, session }) => {
          localStorage.setItem(storageKey, JSON.stringify(session))
        },
        {
          storageKey: `sb-${host.split('.')[0]}-auth-token`,
          session: {
            access_token: 'example-token',
            refresh_token: 'example-refresh',
            expires_in: 3600,
            expires_at: 4_000_000_000,
            token_type: 'bearer',
            user: {
              id: userId,
              aud: 'authenticated',
              role: 'authenticated',
              email: 'member@example.com',
              app_metadata: { provider: 'email' },
              user_metadata: {},
              created_at: '2026-01-01T00:00:00.000Z',
            },
          },
        },
      )
      await page.goto('http://127.0.0.1:4177/dashboard/people/partners', { waitUntil: 'networkidle' })
      const notNow = page.getByRole('button', { name: 'Not now' })
      if (await notNow.count()) await notNow.click()
      await page.waitForSelector('text=Partner showcase', { timeout: 15000 })
      await shoot(page, 'partner-showcase-app', width)
      await page.close()
    }
  } finally {
    await browser.close()
  }
} finally {
  dev.kill('SIGTERM')
}
