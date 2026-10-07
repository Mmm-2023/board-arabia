/**
 * Shots of the admin logo control on the running settings page.
 * Reads are stubbed. The rows are example fixtures.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.env.PARTNER_LOGO_SHOT_DIR || '/opt/cursor/artifacts/partner-logo-admin'
fs.mkdirSync(outDir, { recursive: true })

const png = fs.readFileSync(path.join(root, 'scripts/smoke/fixture-logo.png'))
const envText = fs.readFileSync(path.join(root, '.env'), 'utf8')
const supabaseUrl = envText.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
if (!supabaseUrl) throw new Error('missing supabase url')
const host = new URL(supabaseUrl).host
const userId = '33333333-3333-4333-8333-333333333333'
const partnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

const partners = [
  {
    id: partnerId,
    is_demo: false,
    published: true,
    name: 'Example Capital',
    blurb: 'One line for a fixture partner.',
    monogram: 'EC',
    logo_path: `${partnerId}/logo`,
    category_slug: 'investment-banking',
    offer: 'A fixture offer.',
    sponsor_user_id: null,
    sort_order: 1,
  },
]

function exampleJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.example`
}

const sessionUser = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'staff@example.com',
  factors: [{ id: 'example-factor', status: 'verified', factor_type: 'totp' }],
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
}

function chromePath() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

const executablePath = chromePath()
if (!executablePath) throw new Error('Chrome is not installed')

const port = 4181
let devExited = false
const dev = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
})
dev.on('exit', () => {
  devExited = true
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
    if (devExited) throw new Error('dev server exited before it was ready')
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

try {
  await waitFor(`http://127.0.0.1:${port}/admin/settings`)
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
      await page.route(`**://${host}/**`, async (route) => {
        const url = route.request().url()
        if (url.includes('/storage/v1/object/public/partner-logos/')) {
          await route.fulfill({ status: 200, contentType: 'image/png', body: png })
          return
        }
        if (url.includes('/auth/v1/user')) {
          await route.fulfill(json(200, sessionUser))
          return
        }
        if (url.includes('/rest/v1/staff_users')) {
          await route.fulfill(json(200, { role: 'staff' }))
          return
        }
        if (url.includes('/rest/v1/rpc/staff_list_trusted_partners')) {
          await route.fulfill(json(200, partners))
          return
        }
        if (url.includes('/rest/v1/rpc/staff_get_intro_monthly_limit')) {
          await route.fulfill(json(200, { monthly_limit: 5 }))
          return
        }
        if (url.includes('/rest/v1/rpc/list_partner_categories')) {
          await route.fulfill(json(200, []))
          return
        }
        await route.fulfill(json(200, []))
      })
      await page.addInitScript(
        ({ storageKey, session }) => {
          localStorage.setItem(storageKey, JSON.stringify(session))
        },
        {
          storageKey: `sb-${host.split('.')[0]}-auth-token`,
          session: {
            access_token: exampleJwt({ aal: 'aal2', sub: userId, role: 'authenticated', exp: 4_000_000_000 }),
            refresh_token: 'example-refresh',
            expires_in: 3600,
            expires_at: 4_000_000_000,
            token_type: 'bearer',
            user: sessionUser,
          },
        },
      )
      await page.goto(`http://127.0.0.1:${port}/admin/settings`, { waitUntil: 'networkidle' })
      const section = page.locator('#trusted-partners')
      await section.waitFor({ timeout: 15000 })
      await section.getByText('Example Capital').waitFor()
      const remove = section.getByRole('button', { name: 'Remove logo' })
      await remove.waitFor()
      const file = path.join(outDir, `admin-logo-control-${width}.png`)
      if (width < 768) {
        await section.locator('h2').scrollIntoViewIfNeeded()
        const head = await section.locator('h2').boundingBox()
        const card = await section.locator('li').first().boundingBox()
        if (!head || !card) throw new Error('logo control was not on screen')
        await page.screenshot({
          path: file,
          clip: {
            x: 0,
            y: Math.max(0, head.y - 12),
            width,
            height: card.y + card.height - head.y + 28,
          },
        })
      } else {
        await section.screenshot({ path: file })
      }
      console.log(file)
      await page.close()
    }
  } finally {
    await browser.close()
  }
} finally {
  dev.kill('SIGTERM')
}
