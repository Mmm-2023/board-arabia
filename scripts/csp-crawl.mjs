/**
 * Serve dist with the built CSP as a report-only header, then crawl.
 * The meta tag is enforced at the same time. Any securitypolicyviolation
 * fails the run. Turnstile must be Cloudflare's always-pass test site key.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { readCspMeta } from './csp-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const TEST_SITE_KEY = '1x00000000000000000000AA'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const shotDir = process.env.TRUST_SHOT_DIR || ''

function fail(message) {
  throw new Error(message)
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

function htmlPaths(dir) {
  const files = []
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.html')) files.push(full)
    }
  }
  walk(dir)
  return files.sort()
}

function routeFor(file) {
  const relative = path.relative(dist, file).split(path.sep).join('/')
  if (relative === 'index.html') return '/'
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'index.html'.length)}`
  return `/${relative}`
}

function resolveFile(pathname) {
  const base = path.resolve(dist)
  let rel = decodeURIComponent(pathname.split('?')[0])
  if (rel.endsWith('/')) rel += 'index.html'
  rel = rel.replace(/^\/+/, '')
  const file = path.resolve(base, rel)
  if (file !== base && !file.startsWith(`${base}${path.sep}`)) return null
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file
  const nested = path.resolve(base, rel, 'index.html')
  if (nested.startsWith(`${base}${path.sep}`) && fs.existsSync(nested)) return nested
  if (!path.extname(rel)) return path.join(base, 'shell.html')
  return null
}

function contentType(file) {
  const ext = path.extname(file)
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json',
  }
  return types[ext] || 'application/octet-stream'
}

function b64url(value) {
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
    email: 'member@example.com',
    role: 'authenticated',
    aal: 'aal1',
    session_id: '00000000-0000-4000-8000-000000000001',
  })
  return `${header}.${payload}.sig`
}

function memberUser(factors) {
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'member@example.com',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
  if (factors === 'verified') {
    user.factors = [
      {
        id: 'factor-example',
        status: 'verified',
        factor_type: 'totp',
        friendly_name: 'Authenticator app',
      },
    ]
  }
  return user
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
}

function fulfillJson(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  })
}

async function mockSupabase(route, state) {
  const url = route.request().url()
  if (state.trace) console.error(`supabase ${route.request().method()} ${url}`)
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: CORS })
  }
  const accept = route.request().headers().accept || ''
  const single = accept.includes('application/vnd.pgrst.object+json')
  const user = memberUser(state.factors)
  const member = {
    user_id: USER_ID,
    email: 'member@example.com',
    seat: 'ksa',
    status: 'active',
    must_set_password: false,
    invites_remaining: 0,
    invites_granted: 0,
    founding_number: 1,
    tier: 'founding',
  }
  const profile = {
    user_id: USER_ID,
    full_name: 'Example Member',
    headline: 'Chair',
    company: 'Example Co',
    location: 'Riyadh',
    linkedin_url: 'https://www.linkedin.com/in/example',
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
  if (url.includes('/auth/v1/user')) return fulfillJson(route, memberUser(state.factors))
  if (url.includes('/auth/v1/factors')) {
    const factor = {
      id: 'factor-example',
      status: 'verified',
      factor_type: 'totp',
      friendly_name: 'Authenticator app',
    }
    const totp = state.factors === 'verified' ? [factor] : []
    return fulfillJson(route, { all: totp, totp })
  }
  if (url.includes('/auth/v1/token')) {
    return fulfillJson(route, {
      access_token: sessionToken(),
      refresh_token: 'refresh-example',
      expires_in: 3600,
      expires_at: 2000000000,
      token_type: 'bearer',
      user,
    })
  }
  if (url.includes('/functions/v1/submit-application')) {
    state.submitted = true
    return fulfillJson(route, { id: '00000000-0000-4000-8000-000000000002' })
  }
  if (url.includes('/rest/v1/rpc/read_ai_tool_frame')) {
    return fulfillJson(route, {
      retention_days: 30,
      tools: [
        { tool_key: 'cfo_check', enabled: true },
        { tool_key: 'deal_readiness', enabled: true },
        { tool_key: 'market_brief', enabled: true },
        { tool_key: 'term_sheet_review', enabled: true },
        { tool_key: 'pricing_sense_check', enabled: true },
      ],
    })
  }
  if (url.includes('/rest/v1/rpc/read_dd_retention_copy')) return fulfillJson(route, false)
  if (url.includes('/rest/v1/rpc/')) return fulfillJson(route, [])
  if (url.includes('/rest/v1/members')) return fulfillJson(route, single ? member : [member])
  if (url.includes('/rest/v1/profiles')) return fulfillJson(route, single ? profile : [profile])
  if (url.includes('/rest/v1/staff_users') || url.includes('/rest/v1/candidates')) {
    if (single) {
      return fulfillJson(route, { code: 'PGRST116', message: '0 rows' }, 406)
    }
    return fulfillJson(route, [])
  }
  if (url.includes('/rest/v1/')) return fulfillJson(route, single ? null : [])
  if (url.includes('/storage/v1/')) return fulfillJson(route, [])
  return fulfillJson(route, {})
}

function assertTestKey() {
  const assets = path.join(dist, 'assets')
  let bundled = ''
  if (fs.existsSync(assets)) {
    for (const name of fs.readdirSync(assets)) {
      if (name.endsWith('.js')) bundled += fs.readFileSync(path.join(assets, name), 'utf8')
    }
  }
  const keys = bundled.match(/[0-3]x[A-Za-z0-9_-]{20,}/g) || []
  const unique = [...new Set(keys)]
  if (!unique.includes(TEST_SITE_KEY)) {
    fail('CSP crawl requires Cloudflare always-pass site key 1x00000000000000000000AA in the build')
  }
  const other = unique.filter((key) => key !== TEST_SITE_KEY)
  if (other.length) fail(`CSP crawl found a Turnstile key other than the test key: ${other.join(', ')}`)
}

function samePolicy(files) {
  const policies = new Set()
  const missing = []
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8')
    const policy = readCspMeta(html)
    if (!policy) missing.push(path.relative(dist, file))
    else policies.add(policy)
    if (!html.includes('name="referrer" content="strict-origin-when-cross-origin"')) {
      missing.push(`${path.relative(dist, file)} referrer`)
    }
  }
  if (missing.length) fail(`CSP or referrer meta missing:\n${missing.join('\n')}`)
  if (policies.size !== 1) fail(`expected one CSP, found ${policies.size}`)
  return [...policies][0]
}

async function violations(page) {
  return page.evaluate(() => window.__baCsp || [])
}

async function shot(page, name, width, selector) {
  if (!shotDir) return
  fs.mkdirSync(shotDir, { recursive: true })
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await page.evaluate(() => document.fonts.ready)
  const file = path.join(shotDir, `${name}-${width}.png`)
  if (!selector) {
    await page.screenshot({ path: file, fullPage: true })
    return
  }
  const locator = page.locator(selector).first()
  await locator.waitFor()
  await locator.scrollIntoViewIfNeeded()
  try {
    await locator.screenshot({ path: file })
  } catch {
    await page.screenshot({ path: file })
  }
}

async function shots(page, name, selector) {
  await shot(page, name, 1280, selector)
  await shot(page, name, 390, selector)
}

async function viewportShot(page, name, width, height) {
  if (!shotDir) return
  fs.mkdirSync(shotDir, { recursive: true })
  await page.setViewportSize({ width, height })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(shotDir, `${name}-${width}.png`), fullPage: false })
}

async function waitForHydration(page) {
  await page.waitForFunction(() => {
    const node = document.querySelector('#root input, #root button, #root a')
    if (!node) return false
    return Object.keys(node).some((key) => key.startsWith('__react'))
  })
}

async function main() {
  if (!fs.existsSync(path.join(dist, 'index.html'))) fail('dist is missing. Run scripts/build-for-csp-crawl.mjs first.')
  assertTestKey()
  const files = htmlPaths(dist)
  const policy = samePolicy(files)
  if (policy.includes('posthog')) fail('PostHog-off build must not mention posthog in the CSP')
  if (!policy.includes("object-src 'none'")) fail('CSP missing object-src')
  const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8')
  if (!sitemap.includes('https://boardarabia.com/security')) fail('sitemap is missing /security')
  const securityHtml = fs.readFileSync(path.join(dist, 'security/index.html'), 'utf8')
  if (!securityHtml.includes('Trust and privacy')) fail('prerendered /security is missing its title')
  if (!securityHtml.includes('href="/security"')) fail('footer link is missing on /security')

  const supabaseOrigin = policy.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  if (!supabaseOrigin) fail('CSP has no Supabase origin')
  const storageKey = `sb-${new URL(supabaseOrigin).hostname.split('.')[0]}-auth-token`
  const state = { factors: 'none', submitted: false }

  const server = http.createServer((req, res) => {
    const file = resolveFile(req.url || '/')
    if (!file) {
      res.writeHead(404, { 'Content-Security-Policy-Report-Only': policy })
      res.end('missing')
      return
    }
    res.writeHead(200, {
      'Content-Type': contentType(file),
      'Content-Security-Policy-Report-Only': policy,
      'Cache-Control': 'no-store',
    })
    res.end(fs.readFileSync(file))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const origin = `http://127.0.0.1:${port}`

  const executablePath = chromePath()
  if (!executablePath) fail('Chrome is not installed')
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const found = []
  const covered = []

  async function open({ session = false, factors = 'none' } = {}) {
    state.factors = factors
    const context = await browser.newContext()
    await context.addInitScript(() => {
      window.__baCsp = []
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__baCsp.push({
          disposition: event.disposition,
          directive: event.effectiveDirective || event.violatedDirective,
          blocked: event.blockedURI,
          source: event.sourceFile,
          line: event.lineNumber,
          sample: (event.sample || '').slice(0, 180),
        })
      })
    })
    if (session) {
      const value = JSON.stringify({
        access_token: sessionToken(),
        refresh_token: 'refresh-example',
        expires_in: 3600,
        expires_at: 2000000000,
        token_type: 'bearer',
        user: memberUser(factors),
      })
      await context.addInitScript(
        ({ key, stored }) => {
          localStorage.setItem(key, stored)
        },
        { key: storageKey, stored: value },
      )
    }
    await context.route('**/*supabase.co/**', (route) => mockSupabase(route, state))
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`console: ${msg.text()}`)
    })
    page.on('pageerror', (error) => {
      console.error(`pageerror: ${error.message}`)
    })
    return { context, page }
  }

  async function collect(page, label) {
    const rows = await violations(page)
    for (const row of rows) found.push({ label, ...row })
    covered.push(label)
  }

  try {
    const publicPage = await open()
    const staticFiles = process.env.CRAWL_SKIP_STATIC === '1' ? [] : files
    for (const file of staticFiles) {
      const route = routeFor(file)
      await publicPage.page.goto(`${origin}${route}`, { waitUntil: 'load' })
      await publicPage.page.waitForTimeout(400)
      await collect(publicPage.page, route)
    }

    await publicPage.page.goto(`${origin}/`, { waitUntil: 'load' })
    await publicPage.page.locator('[data-trust-strip="landing"]').waitFor()
    const landingHref = await publicPage.page.locator('[data-trust-strip="landing"] a').getAttribute('href')
    if (landingHref !== '/security') fail(`landing strip href is ${landingHref}`)
    await shots(publicPage.page, 'landing-strip', '[data-trust-strip="landing"]')
    await collect(publicPage.page, 'flow:landing-strip')

    await publicPage.page.goto(`${origin}/security`, { waitUntil: 'load' })
    await publicPage.page.locator('h1').waitFor()
    await shots(publicPage.page, 'security-full')
    await collect(publicPage.page, 'flow:security')

    await publicPage.page.goto(`${origin}/no-such-page`, { waitUntil: 'load' })
    await publicPage.page.getByRole('heading', { name: 'Page not found' }).waitFor()
    await collect(publicPage.page, 'flow:not-found')

    await publicPage.page.goto(`${origin}/`, { waitUntil: 'load' })
    await waitForHydration(publicPage.page)
    const heroApply = publicPage.page.locator('#hero-apply')
    if ((await heroApply.getAttribute('href')) !== '/apply') {
      fail('landing Apply for consideration does not go to /apply')
    }
    await heroApply.click()
    await publicPage.page.waitForURL(/\/apply$/)
    await waitForHydration(publicPage.page)
    console.log(`Clicked Apply for consideration. Landed on ${publicPage.page.url()}`)
    await publicPage.page.locator('h1').waitFor()
    await viewportShot(publicPage.page, 'apply-cta-destination', 1280, 800)
    await viewportShot(publicPage.page, 'apply-cta-destination', 390, 844)
    await publicPage.page.setViewportSize({ width: 1280, height: 800 })
    await publicPage.page.locator('[data-trust-strip="apply"]').waitFor()
    await shots(publicPage.page, 'apply-strip', '[data-trust-strip="apply"]')
    await publicPage.page.locator('#full_name').fill('Example Applicant')
    await publicPage.page.locator('#email').fill('applicant@example.com')
    await publicPage.page.locator('#turnover').fill('Example group revenue')
    await publicPage.page.locator('#linkedin_url').fill('https://www.linkedin.com/in/example')
    await publicPage.page.locator('#job_titles').fill('Chair')
    await publicPage.page.locator('#companies').fill('Example Co')
    await publicPage.page.getByRole('button', { name: 'Submit for consideration' }).click()
    try {
      await publicPage.page.getByRole('heading', { name: 'Consideration requested' }).waitFor()
    } catch (error) {
      const alert = await publicPage.page.locator('[role="alert"]').allTextContents()
      const name = await publicPage.page.locator('#full_name').inputValue().catch(() => '')
      console.error(`apply alert: ${alert.join(' | ')}`)
      console.error(`apply name field: ${name}`)
      throw error
    }
    if (!state.submitted) fail('Apply submit did not reach the application endpoint')
    await collect(publicPage.page, 'flow:apply-submit')

    await publicPage.page.goto(`${origin}/register`, { waitUntil: 'load' })
    await publicPage.page.locator('[data-turnstile="live"], [data-turnstile="missing"]').waitFor()
    const turnstileState = await publicPage.page.locator('[data-turnstile]').first().getAttribute('data-turnstile')
    if (turnstileState !== 'live') fail(`Turnstile did not mount (${turnstileState})`)
    try {
      await publicPage.page.waitForFunction(() => {
        const input = document.querySelector('input[name="cf-turnstile-response"]')
        return Boolean(input && input.value)
      }, null, { timeout: 15000 })
    } catch {
      const widget = await publicPage.page.locator('[data-turnstile="live"]').innerHTML().catch(() => '')
      console.error(`turnstile widget html: ${widget.slice(0, 500)}`)
      await collect(publicPage.page, 'flow:register-turnstile-failed')
      fail('Turnstile did not return a token')
    }
    const value = await publicPage.page.locator('input[name="cf-turnstile-response"]').inputValue()
    if (value !== 'XXXX.DUMMY.TOKEN.XXXX') fail(`Turnstile token was not the always-pass dummy: ${value}`)
    await collect(publicPage.page, 'flow:register-turnstile')
    await publicPage.context.close()

    const login = await open()
    await login.page.setViewportSize({ width: 1280, height: 900 })
    await login.page.goto(`${origin}/login`, { waitUntil: 'load' })
    await login.page.getByText('Signed-in area. Never share your one-time code.').waitFor()
    await shots(login.page, 'login-line', 'text=Signed-in area. Never share your one-time code.')
    await collect(login.page, 'flow:login')
    await login.context.close()

    const challenge = await open({ session: true, factors: 'verified' })
    await challenge.page.goto(`${origin}/login`, { waitUntil: 'load' })
    try {
      await challenge.page.getByRole('heading', { name: 'Enter your code' }).waitFor()
    } catch (error) {
      const text = await challenge.page.locator('body').innerText()
      const keys = await challenge.page.evaluate(() => Object.keys(localStorage))
      console.error(`login text:\n${text.slice(0, 1000)}`)
      console.error(`storage keys: ${keys.join(', ')}`)
      throw error
    }
    state.trace = false
    await collect(challenge.page, 'flow:two-step')
    await challenge.context.close()

    const member = await open({ session: true, factors: 'none' })
    await member.page.goto(`${origin}/dashboard`, { waitUntil: 'load' })
    await member.page.waitForTimeout(1500)
    await collect(member.page, 'flow:dashboard')

    await member.page.goto(`${origin}/dashboard/ai/due-diligence`, { waitUntil: 'load' })
    await member.page.locator('[data-dd-hint]').waitFor()
    await member.page.locator('[data-upload-handling]').waitFor()
    await shots(member.page, 'dd-upload-hint', '[data-dd-hint]')
    await collect(member.page, 'flow:dd-upload')

    await member.page.goto(`${origin}/dashboard/ai/cfo-check`, { waitUntil: 'load' })
    await member.page.locator('[data-ai-upload-hint]').waitFor()
    await shots(member.page, 'ai-upload-hint', '[data-ai-upload-hint]')
    await collect(member.page, 'flow:ai-cfo')

    await member.page.goto(`${origin}/dashboard/ai/deal-readiness`, { waitUntil: 'load' })
    await member.page.getByText('Only your account can open this file.').waitFor()
    await collect(member.page, 'flow:ai-deal-readiness')
    await member.context.close()
  } catch (error) {
    console.error(`violations before failure: ${found.length}`)
    if (found.length) console.error(JSON.stringify(found.slice(0, 30), null, 2))
    throw error
  } finally {
    await browser.close()
    server.close()
  }

  const report = {
    policy,
    routes: files.map(routeFor),
    covered,
    violations: found,
  }
  const reportPath = process.env.CSP_CRAWL_REPORT || '/tmp/csp-crawl-report.json'
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`CSP crawl covered ${covered.length} checks across ${files.length} HTML files`)
  console.log(`violations: ${found.length}`)
  if (found.length) {
    console.error(JSON.stringify(found, null, 2))
    fail('CSP crawl found violations')
  }
  console.log(policy)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
