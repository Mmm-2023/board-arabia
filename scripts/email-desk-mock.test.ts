import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { resolveChromePath } from './chrome-path.ts'

const EMAIL_DESK_SHOTS = [
  'weekly',
  'letters',
  'results',
  'step-1',
  'step-3',
  'step-5',
  'step-6',
  'plain',
  'details',
  'contacts-list',
  'contacts-upload',
  'contacts-map',
  'contacts-basis',
  'contacts-summary',
] as const

function chromePath() {
  return resolveChromePath()
    || (existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : null)
    || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : null)
}

test('email desk mock shots at 1440 and 390', { timeout: 180_000 }, async (t) => {
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  const shotDir = path.join('/opt/cursor/artifacts', 'em-1e-email-desk')
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
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    for (const shot of EMAIL_DESK_SHOTS) {
      for (const width of [1440, 390] as const) {
        const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
        await page.goto(`${origin}/scripts/smoke/email-desk-mock.html?shot=${shot}`, { waitUntil: 'networkidle' })
        const root = page.locator('[data-email-mock]')
        await root.waitFor()
        assert.equal(await root.getAttribute('data-email-mock'), shot)
        const text = await page.locator('body').innerText()
        assert.equal(text.includes('\u2014') || text.includes('\u2013'), false, shot)
        assert.equal(/\bsponsor\b/i.test(text), false, shot)
        assert.equal(text.toLowerCase().includes('the desk'), false, shot)
        if (shot === 'results') {
          assert.match(text, /Opens are approximate/)
          assert.match(text, /turned measurement on/)
          assert.match(text, /<5/)
          assert.equal(text.includes('@'), false, shot)
        }
        if (shot === 'step-6') {
          assert.equal(await page.locator('[data-release]').getAttribute('data-release'), 'disabled')
          assert.equal(await page.getByRole('button', { name: 'Release', exact: true }).isDisabled(), true)
          assert.equal(await page.locator('[data-status]').getAttribute('data-status'), 'Sending off')
        }
        if (shot === 'step-1' || shot === 'plain') {
          assert.equal(await page.locator('[data-plain]').getAttribute('data-plain'), shot === 'plain' ? 'on' : 'off')
        }
        if (shot === 'details') {
          assert.equal(await page.locator('[data-details]').getAttribute('data-details'), 'open')
          assert.match(await page.locator('[data-summary]').innerText(), /128 to send/)
        }
        if (shot === 'weekly' || shot === 'letters' || shot.startsWith('step-') || shot === 'plain' || shot === 'details') {
          assert.match(await page.locator('[data-summary]').innerText(), /128 to send/)
          assert.equal(text.includes('@'), false, shot)
        }
        if (shot === 'contacts-basis') {
          const basis = page.locator('[data-basis]')
          assert.equal(await basis.getAttribute('data-basis'), 'unset')
          assert.equal(await basis.getAttribute('data-import'), 'blocked')
          const radios = basis.locator('input[name="basis"]')
          assert.equal(await radios.count(), 2)
          assert.equal(await radios.nth(0).isChecked(), false)
          assert.equal(await radios.nth(1).isChecked(), false)
          assert.match(await basis.innerText(), /Opted in/)
          assert.match(await basis.innerText(), /Known contact/)
          assert.match(await basis.innerText(), /source note/i)
          assert.equal(await basis.getByRole('button', { name: 'Import', exact: true }).isDisabled(), true)
          assert.equal((await page.locator('body').innerText()).includes('Placeholder copy'), false)
        }
        if (shot.startsWith('contacts')) {
          assert.match(text, /example\.com/)
          assert.match(text, /does not send|Nothing was emailed|does not import/)
        }
        const file = path.join(shotDir, `${shot}-${width}.png`)
        const height = await page.evaluate(() => document.documentElement.scrollHeight)
        await page.setViewportSize({ width, height: Math.max(height, width === 390 ? 844 : 900) })
        await page.screenshot({ path: file, fullPage: false })
        assert.equal(existsSync(file), true)
        await page.close()
      }
    }
    for (const width of [1440, 390] as const) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
      await page.goto(`${origin}/scripts/smoke/email-desk-mock.html?shot=your-privacy-toggle`, { waitUntil: 'networkidle' })
      const panel = page.locator('[data-measure-email]')
      await panel.waitFor()
      assert.equal(await panel.getAttribute('data-measure-email'), 'off')
      assert.match(await panel.innerText(), /Measure opens and clicks/i)
      const file = path.join(shotDir, `your-privacy-toggle-${width}.png`)
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      await page.setViewportSize({ width, height: Math.max(height, width === 390 ? 844 : 900) })
      await page.screenshot({ path: file, fullPage: false })
      assert.equal(existsSync(file), true)
      await page.close()
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})
