import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium, type Page, type Route } from 'playwright-core'
import { createServer } from 'vite'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'
import {
  LINK_PROBLEM_COOLDOWN_MS,
  LINK_PROBLEM_EMAIL,
  LINK_PROBLEM_HEADING,
  LINK_PROBLEM_NETWORK,
  LINK_PROBLEM_SENT,
  LINK_PROBLEM_WAIT,
  linkProblemCooling,
  linkProblemEmailProblem,
  linkProblemWaitUntil,
  presentLinkProblem,
} from '../src/lib/linkProblem.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const shots = path.join(root, 'handoff/ba-fd-4')
const ENDPOINT_MESSAGE = 'If this inbox can sign in, a reset link is on its way.'
const LEAK = 'No account for this inbox'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('a new link uses the same sentence for every address', () => {
  const known = presentLinkProblem({ ok: true, status: 200 })
  const unknown = presentLinkProblem({ ok: true, status: 200 })
  assert.equal(known.kind, 'sent')
  assert.equal(known.text, LINK_PROBLEM_SENT)
  assert.equal(unknown.text, known.text)
  assert.equal(known.text.includes('@'), false)
  assert.equal(presentLinkProblem({ ok: false, status: 400 }).text, LINK_PROBLEM_EMAIL)
  assert.equal(presentLinkProblem({ ok: false, status: 429 }).text, LINK_PROBLEM_WAIT)
  assert.equal(presentLinkProblem({ ok: false, status: 0, network: true }).text, LINK_PROBLEM_NETWORK)
  assert.equal(presentLinkProblem({ ok: false, status: 503, network: true }).kind, 'network')
  assert.equal(linkProblemEmailProblem(''), LINK_PROBLEM_EMAIL)
  assert.equal(linkProblemEmailProblem('not-an-email'), LINK_PROBLEM_EMAIL)
  assert.equal(linkProblemEmailProblem('layla@example.com'), '')
  assert.equal(linkProblemEmailProblem('nobody@example.com'), '')
  const now = 1_700_000_000_000
  const until = linkProblemWaitUntil(now)
  assert.equal(LINK_PROBLEM_COOLDOWN_MS, 60_000)
  assert.equal(until - now, 60_000)
  assert.equal(linkProblemCooling(now + 59_000, until), true)
  assert.equal(linkProblemCooling(until, until), false)
})

test('the link problem page calls the existing reset function and keeps password setup', () => {
  const screen = read('src/pages/LinkProblemScreen.tsx')
  const copy = read('src/lib/linkProblem.ts')
  const confirm = read('src/pages/AuthConfirmPage.tsx')
  const client = read('src/lib/supabase.ts')
  const start = client.indexOf('export async function requestPasswordResetLetter')
  const letter = client.slice(start, client.indexOf('async function staffHeaders'))
  assert.match(copy, /That link did not work\. Enter your email to get a new one\./)
  assert.match(copy, /If that address has an account, a link is on its way\./)
  assert.match(screen, /LINK_PROBLEM_HEADING/)
  assert.match(screen, /Email me a new link/)
  assert.match(screen, /Back to sign in/)
  assert.match(screen, /requestPasswordResetLetter/)
  assert.match(screen, /presentLinkProblem\(call\)/)
  assert.equal(/presentLinkProblem\([^)]*email/.test(screen), false)
  assert.equal(screen.includes('resetPasswordForEmail'), false)
  assert.equal(screen.includes('sendPasswordReset'), false)
  assert.equal(screen.includes(ENDPOINT_MESSAGE), false)
  const wording = `${screen}\n${copy}`
  assert.equal(wording.includes('\u2014'), false)
  assert.equal(wording.includes('\u2013'), false)
  assert.equal(/\bsponsor\b/i.test(wording), false)
  assert.equal(/\bthe desk\b/i.test(wording), false)
  assert.equal(/nammco/i.test(wording), false)
  assert.match(screen, /text-\[17px\]/)
  assert.match(screen, /min-h-11/)
  assert.match(screen, /signInFieldClassLight/)
  assert.equal(confirm.includes('Link not accepted'), false)
  assert.equal(confirm.includes('Staff sign in'), false)
  assert.equal(confirm.includes('Member sign in'), false)
  assert.match(confirm, /LinkProblemScreen/)
  assert.match(confirm, /clearPasswordFlag/)
  assert.match(confirm, /updateUser\(\{ password \}\)/)
  assert.match(letter, /\/request-password-reset/)
  assert.equal(letter.includes('.json('), false)
  assert.equal(letter.includes('error.message'), false)
  assert.match(read('supabase/functions/request-password-reset/index.ts'), /generateLink/)
  assert.match(read('supabase/config.toml'), /\[functions\.request-password-reset\]\nverify_jwt = false/)
})

test('link problem page states meet the type and target floors', async (t) => {
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
  const failed = `${origin}/auth/confirm?error=access_denied&error_description=Email+link+is+invalid+or+has+expired`
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      await page.route('**/*supabase.co/**', (route) => mockBackend(route, 'quiet'))
      await page.goto(failed, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: LINK_PROBLEM_HEADING }).waitFor()
      const body = await page.locator('body').innerText()
      assert.equal(body.includes('Email link is invalid or has expired'), false)
      assert.equal(body.includes('Link not accepted'), false)
      assert.equal(body.includes('Staff sign in'), false)
      assert.equal(/\bthe desk\b/i.test(body), false)
      assert.equal(/\bsponsor\b/i.test(body), false)
      assert.equal(body.includes('\u2014'), false)
      const audit = await auditPage(page)
      assert.deepEqual(audit.small, [], `${width} small text ${JSON.stringify(audit.small)}`)
      assert.deepEqual(audit.short, [], `${width} short targets ${JSON.stringify(audit.short)}`)
      assert.ok(audit.overflow <= 1, `${width} overflow ${audit.overflow}`)
      const button = await page.getByRole('button', { name: 'Email me a new link' }).evaluate((el) => {
        const style = getComputedStyle(el)
        return { size: parseFloat(style.fontSize), transform: style.textTransform, height: el.getBoundingClientRect().height }
      })
      assert.ok(button.size >= 17, `${width} button ${button.size}`)
      assert.equal(button.transform, 'none')
      assert.ok(button.height >= 44)
      const border = await page.locator('#link-email').evaluate((el) => getComputedStyle(el).borderTopColor)
      assert.equal(border, 'rgb(109, 101, 147)')
      const back = await page.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')
      assert.equal(back, '/login')
      await page.screenshot({ path: path.join(shots, `after-${width}.png`), fullPage: true })
      await context.close()
    }

    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      const posts: string[] = []
      let release = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/*supabase.co/**', (route) => mockBackend(route, 'hold', posts, gate))
      await page.goto(failed, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: LINK_PROBLEM_HEADING }).waitFor()
      await page.locator('#link-email').fill('layla@example.com')
      const submit = page.getByRole('button', { name: 'Email me a new link' }).click()
      await page.getByRole('button', { name: 'Sending…' }).waitFor()
      release()
      await submit
      await page.locator('[data-link-sent]').waitFor()
      assert.equal(await page.locator('[data-link-sent]').innerText(), LINK_PROBLEM_SENT)
      assert.equal((await page.locator('[data-link-sent]').innerText()).includes('layla@example.com'), false)
      assert.equal(await page.locator('body').innerText().then((text) => text.includes(ENDPOINT_MESSAGE)), false)
      assert.equal(await page.locator('[data-link-wait]').innerText(), LINK_PROBLEM_WAIT)
      assert.equal(await page.locator('#link-email').inputValue(), 'layla@example.com')
      assert.equal(await page.getByRole('button', { name: 'Email me a new link' }).isDisabled(), true)
      assert.deepEqual(posts, ['layla@example.com'])
      await page.screenshot({ path: path.join(shots, `success-${width}.png`), fullPage: true })
      await context.close()
    }

    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      await page.route('**/*supabase.co/**', (route) => mockBackend(route, 'network'))
      await page.goto(failed, { waitUntil: 'domcontentloaded' })
      await page.locator('#link-email').fill('layla@example.com')
      await page.getByRole('button', { name: 'Email me a new link' }).click()
      await page.getByRole('alert').waitFor()
      assert.match(await page.getByRole('alert').innerText(), /We could not reach Board Arabia\. Check your connection and try again\./)
      assert.equal(await page.locator('[data-link-sent]').count(), 0)
      assert.equal(await page.locator('#link-email').inputValue(), 'layla@example.com')
      await page.screenshot({ path: path.join(shots, `error-${width}.png`), fullPage: true })
      await context.close()
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    const posts: string[] = []
    await page.route('**/*supabase.co/**', (route) => mockBackend(route, 'ok', posts))
    await page.goto(failed, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Email me a new link' }).click()
    await page.locator('#link-email-error').waitFor()
    assert.match(await page.locator('#link-email-error').innerText(), /Enter the email address you use for Board Arabia\./)
    assert.match(await page.getByRole('alert').innerText(), /Enter the email address you use for Board Arabia\./)
    assert.deepEqual(posts, [])
    await page.locator('#link-email').fill('not-an-email')
    await page.getByRole('button', { name: 'Email me a new link' }).click()
    assert.match(await page.locator('#link-email-error').innerText(), /Enter the email address you use for Board Arabia\./)
    assert.deepEqual(posts, [])
    await page.locator('#link-email').fill('nobody@example.com')
    await page.getByRole('button', { name: 'Email me a new link' }).click()
    await page.locator('[data-link-sent]').waitFor()
    assert.equal(await page.locator('[data-link-sent]').innerText(), LINK_PROBLEM_SENT)
    assert.equal((await page.locator('[data-link-sent]').innerText()).includes('nobody@example.com'), false)
    assert.deepEqual(posts, ['nobody@example.com'])
    await context.close()

    const rejected = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const rejectedPage = await rejected.newPage()
    rejectedPage.setDefaultTimeout(20000)
    await rejectedPage.route('**/*supabase.co/**', (route) => mockBackend(route, 'rejected'))
    await rejectedPage.goto(failed, { waitUntil: 'domcontentloaded' })
    await rejectedPage.locator('#link-email').fill('layla@example.com')
    await rejectedPage.getByRole('button', { name: 'Email me a new link' }).click()
    await rejectedPage.getByRole('alert').waitFor()
    const rejectedText = await rejectedPage.locator('body').innerText()
    assert.equal(rejectedText.includes(LEAK), false)
    assert.match(rejectedText, /Enter the email address you use for Board Arabia\./)
    assert.equal(await rejectedPage.locator('#link-email').inputValue(), 'layla@example.com')
    await rejected.close()

    const limited = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const limitedPage = await limited.newPage()
    limitedPage.setDefaultTimeout(20000)
    await limitedPage.route('**/*supabase.co/**', (route) => mockBackend(route, 'rate'))
    await limitedPage.goto(failed, { waitUntil: 'domcontentloaded' })
    await limitedPage.locator('#link-email').fill('layla@example.com')
    await limitedPage.getByRole('button', { name: 'Email me a new link' }).click()
    await limitedPage.locator('[data-link-wait]').waitFor()
    const limitedText = await limitedPage.locator('body').innerText()
    assert.match(limitedText, /You can ask again in 60 seconds\./)
    assert.equal(limitedText.includes(LEAK), false)
    assert.equal(limitedText.includes(ENDPOINT_MESSAGE), false)
    assert.equal(await limitedPage.locator('[data-link-sent]').count(), 0)
    await limited.close()

    const missing = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const missingPage = await missing.newPage()
    missingPage.setDefaultTimeout(20000)
    await missingPage.route('**/*supabase.co/**', (route) => mockBackend(route, 'quiet'))
    await missingPage.goto(`${origin}/auth/confirm`, { waitUntil: 'networkidle' })
    await missingPage.getByRole('heading', { name: LINK_PROBLEM_HEADING }).waitFor()
    await missingPage.goto(`${origin}/auth/reset`, { waitUntil: 'networkidle' })
    await missingPage.getByRole('heading', { name: LINK_PROBLEM_HEADING }).waitFor()
    await missing.close()

    const used = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const usedPage = await used.newPage()
    usedPage.setDefaultTimeout(20000)
    await usedPage.route('**/*supabase.co/**', (route) => mockBackend(route, 'used'))
    await usedPage.goto(`${origin}/auth/confirm?token_hash=example&type=invite`, { waitUntil: 'networkidle' })
    await usedPage.getByRole('heading', { name: LINK_PROBLEM_HEADING }).waitFor()
    const usedText = await usedPage.locator('body').innerText()
    assert.equal(usedText.includes('Token has expired or is invalid'), false)
    assert.equal(usedText.includes('otp_expired'), false)
    await used.close()
  } finally {
    await browser.close()
    await vite.close()
  }
})

async function auditPage(page: Page) {
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
      short.push({ text: (node.textContent || (node as HTMLElement).id || '').trim().slice(0, 60), height })
    }
    return {
      small,
      short,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}

async function mockBackend(route: Route, mode: 'quiet' | 'ok' | 'hold' | 'network' | 'rejected' | 'rate' | 'used', posts: string[] = [], gate?: Promise<void>) {
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
  const json = (body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
  if (url.includes('/functions/v1/request-password-reset')) {
    if (mode === 'hold' && gate) await gate
    if (mode === 'network') {
      await route.abort('failed')
      return
    }
    const raw = route.request().postData() || '{}'
    const email = (JSON.parse(raw) as { email?: string }).email || ''
    posts.push(email)
    if (mode === 'rate') {
      await json({ error: LEAK, message: ENDPOINT_MESSAGE }, 429)
      return
    }
    if (mode === 'rejected') {
      await json({ error: LEAK }, 400)
      return
    }
    await json({ ok: true, message: ENDPOINT_MESSAGE })
    return
  }
  if (url.includes('/auth/v1/verify')) {
    await json({ error: 'Token has expired or is invalid', error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }, 403)
    return
  }
  await json(null)
}
