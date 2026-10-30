import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'
import {
  memberEmailProblem,
  presentSignInNotice,
  SIGN_IN_CODE,
  SIGN_IN_CODE_FIELD,
  SIGN_IN_EMAIL,
  SIGN_IN_MISMATCH,
  SIGN_IN_NETWORK,
  SIGN_IN_PASSWORD,
  SIGN_IN_RATE,
  SIGN_IN_RESET_FAIL,
  SIGN_IN_RESET_WAIT,
} from '../src/lib/signInNotice.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('sign-in notices say what happened and what to do', () => {
  assert.deepEqual(presentSignInNotice({ message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }, 'password'), {
    tone: 'error',
    text: SIGN_IN_MISMATCH,
  })
  assert.equal(presentSignInNotice({ message: 'Email not confirmed', status: 400, code: 'email_not_confirmed' }, 'password').text, SIGN_IN_MISMATCH)
  assert.equal(presentSignInNotice({ message: 'User banned', status: 400, code: 'user_banned' }, 'password').text, SIGN_IN_MISMATCH)
  assert.deepEqual(presentSignInNotice({ message: 'Request rate limit reached', status: 429, code: 'over_request_rate_limit' }, 'password'), {
    tone: 'warn',
    text: SIGN_IN_RATE,
  })
  assert.equal(presentSignInNotice({ message: 'Failed to fetch', status: 0, name: 'AuthRetryableFetchError' }, 'password').text, SIGN_IN_NETWORK)
  assert.equal(presentSignInNotice({ message: 'Load failed', name: 'TypeError' }, 'password').text, SIGN_IN_NETWORK)
  assert.equal(presentSignInNotice({ status: 503, message: 'upstream' }, 'password').text, SIGN_IN_NETWORK)
  assert.equal(presentSignInNotice({ message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' }, 'code').text, SIGN_IN_CODE)
  assert.equal(presentSignInNotice({ status: 429, code: 'over_request_rate_limit' }, 'code').text, SIGN_IN_RATE)
  assert.equal(presentSignInNotice({ message: 'Failed to fetch', name: 'AuthRetryableFetchError' }, 'code').text, SIGN_IN_NETWORK)
  assert.equal(presentSignInNotice({ message: 'For security purposes, you can only request this after 60 seconds' }, 'reset').text, SIGN_IN_RESET_WAIT)
  assert.equal(presentSignInNotice({ code: 'over_email_send_rate_limit', status: 429 }, 'reset').text, SIGN_IN_RESET_WAIT)
  assert.equal(presentSignInNotice({ message: 'Unable to validate email address: invalid format' }, 'reset').text, SIGN_IN_RESET_FAIL)
  assert.equal(presentSignInNotice(null, 'password').text, SIGN_IN_MISMATCH)
  assert.equal(memberEmailProblem(''), SIGN_IN_EMAIL)
  assert.equal(memberEmailProblem('not-an-email'), SIGN_IN_EMAIL)
  assert.equal(memberEmailProblem('layla@example.com'), '')
  assert.equal(SIGN_IN_PASSWORD, 'Enter your password.')
  assert.equal(SIGN_IN_CODE_FIELD, 'Enter the one-time code.')
})

test('member sign-in copy matches the porcelain page and keeps the auth calls', () => {
  const login = read('src/pages/LoginPage.tsx')
  assert.equal(login.includes('Admission is by invitation'), false)
  assert.match(login, /Not a member yet\?/)
  assert.match(login, /Board Arabia is by application\./)
  assert.match(login, /to="\/apply"/)
  assert.match(login, /Apply for consideration/)
  assert.match(login, /Accepted already\? Use the link in your acceptance email to create your account\./)
  assert.match(login, /Email me a new link/)
  assert.match(login, /Forgot your password\?/)
  assert.match(login, /Use a one-time code instead/)
  assert.match(login, /Use my password instead/)
  assert.match(login, /Admin sign in/)
  assert.match(login, /to="\/login\/staff"/)
  assert.match(login, /Back to the site/)
  assert.match(login, /For members of Board Arabia\./)
  assert.match(login, /signInWithPassword/)
  assert.match(login, /verifyOtp/)
  assert.match(login, /sendPasswordReset/)
  assert.match(login, /clearPasswordFlag\(data\.user\.id\)/)
  assert.match(login, /signOutTo=\{staffEntry \? '\/login\/staff' : '\/login'\}/)
  assert.equal(login.includes('Supabase'), false)
  assert.equal(login.includes('outline-none'), false)
  assert.equal(login.includes('\u2014'), false)
  assert.equal(login.includes('\u2013'), false)
  assert.equal(/\bthe desk\b/i.test(login), false)
  assert.equal(/\bsponsor\b/i.test(login), false)
  assert.equal(/nammco/i.test(login), false)
  assert.match(login, /text-\[17px\]/)
  assert.match(login, /min-h-11/)
  assert.match(login, /signInFieldClassLight/)
  const line = 'Signed-in area. Never share your one-time code.'
  assert.equal(login.split(line).length - 1, 1)
})

test('sign-in page meets the type, target, and error floors', async (t) => {
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
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      await page.goto(`${origin}/login`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
      const body = await page.locator('body').innerText()
      assert.match(body, /For members of Board Arabia\./)
      assert.match(body, /Not a member yet\?/)
      assert.equal(body.includes('Admission is by invitation'), false)
      assert.equal(/nammco/i.test(body), false)
      assert.equal(body.includes('\u2014'), false)
      const audit = await auditPage(page)
      assert.deepEqual(audit.small, [], `${width} small text ${JSON.stringify(audit.small)}`)
      assert.deepEqual(audit.short, [], `${width} short targets ${JSON.stringify(audit.short)}`)
      assert.ok(audit.overflow <= 1, `${width} overflow ${audit.overflow}`)
      const button = await page.getByRole('button', { name: 'Sign in', exact: true }).evaluate((el) => {
        const style = getComputedStyle(el)
        return { size: parseFloat(style.fontSize), transform: style.textTransform, height: el.getBoundingClientRect().height }
      })
      assert.ok(button.size >= 17, `${width} button ${button.size}`)
      assert.equal(button.transform, 'none')
      assert.ok(button.height >= 44)
      const border = await page.locator('#sign-in-email').evaluate((el) => getComputedStyle(el).borderTopColor)
      assert.equal(border, 'rgb(109, 101, 147)')
      await context.close()
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    await page.route('**/*supabase.co/**', (route) => mockAuth(route, 'invalid'))
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#sign-in-email').fill('layla@example.com')
    await page.locator('#sign-in-password').fill('example-pass')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /That email and password do not match/)
    assert.equal(await page.locator('#sign-in-email').inputValue(), 'layla@example.com')
    assert.equal(await page.locator('#sign-in-password').inputValue(), 'example-pass')
    await page.unroute('**/*supabase.co/**')
    await page.route('**/*supabase.co/**', (route) => mockAuth(route, 'network'))
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByText('We could not reach Board Arabia. Check your connection and try again.').waitFor()
    assert.equal(await page.locator('#sign-in-email').inputValue(), 'layla@example.com')
    assert.equal(await page.locator('#sign-in-password').inputValue(), 'example-pass')
    await page.unroute('**/*supabase.co/**')
    await page.route('**/*supabase.co/**', (route) => mockAuth(route, 'rate'))
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const rate = page.getByRole('alert')
    await rate.waitFor()
    assert.match(await rate.innerText(), /Too many attempts\. Wait a few minutes, or reset your password\./)
    await page.getByRole('button', { name: 'Use a one-time code instead' }).click()
    await page.getByRole('button', { name: 'Use code' }).waitFor()
    await page.getByRole('button', { name: 'Use my password instead' }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
    await page.locator('#sign-in-email').fill('')
    await page.locator('#sign-in-password').fill('')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.locator('#sign-in-email-error').waitFor()
    assert.match(await page.locator('#sign-in-email-error').innerText(), /Enter the email address you use for Board Arabia\./)
    assert.match(await page.locator('#sign-in-password-error').innerText(), /Enter your password\./)
    const apply = await page.getByRole('link', { name: 'Apply for consideration' }).getAttribute('href')
    assert.equal(apply, '/apply')
    const admin = await page.getByRole('link', { name: 'Admin sign in' }).getAttribute('href')
    assert.equal(admin, '/login/staff')
    await context.close()

    const staff = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const staffPage = await staff.newPage()
    staffPage.setDefaultTimeout(20000)
    await staffPage.goto(`${origin}/login/staff`, { waitUntil: 'networkidle' })
    await staffPage.getByRole('heading', { name: 'Staff sign in' }).waitFor()
    assert.equal(await staffPage.locator('[aria-labelledby="not-a-member"]').count(), 0)
    assert.match(await staffPage.locator('body').innerText(), /Email and password for staff\. After sign-in you open admin\./)
    await staff.close()
  } finally {
    await browser.close()
    await vite.close()
  }
})

async function auditPage(page: { evaluate: <T>(fn: () => T) => Promise<T> }) {
  return page.evaluate(() => {
    const small: Array<{ text: string; size: number }> = []
    for (const node of document.querySelectorAll('body *')) {
      const text = [...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => (child.textContent || '').trim())
        .join(' ')
      if (!text) continue
      const size = parseFloat(getComputedStyle(node).fontSize)
      if (size < 15) small.push({ text: text.slice(0, 60), size })
    }
    const short: Array<{ text: string; height: number }> = []
    for (const node of document.querySelectorAll('a, button, input')) {
      const height = node.getBoundingClientRect().height
      if (height >= 44) continue
      short.push({ text: (node.textContent || node.id || '').trim().slice(0, 60), height })
    }
    return {
      small,
      short,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}

async function mockAuth(
  route: { request: () => { method: () => string; url: () => string }; fulfill: (value: unknown) => Promise<void>; abort: (reason?: string) => Promise<void> },
  mode: 'invalid' | 'network' | 'rate',
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
  if (!url.includes('/auth/v1/token') && !url.includes('/auth/v1/verify')) {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: 'null' })
    return
  }
  if (mode === 'network') {
    await route.abort('failed')
    return
  }
  if (mode === 'rate') {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({ code: 'over_request_rate_limit', error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }),
    })
    return
  }
  await route.fulfill({
    status: 400,
    contentType: 'application/json',
    headers: cors,
    body: JSON.stringify({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
  })
}
