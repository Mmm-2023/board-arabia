import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'
import { resolveChromePath } from './chrome-path.ts'

const SHOTS = ['staff-create', 'member-before', 'member-after'] as const

function chromePath() {
  return resolveChromePath()
    || (existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : null)
    || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : null)
}

test('virtual majlis shots at 1440 and 390', { timeout: 180_000 }, async (t) => {
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  const shotDir = path.join('/opt/cursor/artifacts', 'mj-3-virtual-majlis')
  mkdirSync(shotDir, { recursive: true })
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
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    for (const shot of SHOTS) {
      for (const width of [1440, 390] as const) {
        const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
        await page.goto(`${origin}/scripts/smoke/majlis-virtual.html?shot=${shot}`, { waitUntil: 'networkidle' })
        await page.locator(`[data-shot="${shot}"]`).waitFor()
        if (shot === 'staff-create') await prepareStaffCreate(page)
        if (shot.startsWith('member')) await page.locator('[data-meet-access]').scrollIntoViewIfNeeded()
        if (shot === 'member-before') {
          await page.getByText('Register to receive the Meet link.').waitFor()
          assert.equal(await page.getByRole('link', { name: 'Join Google Meet' }).count(), 0)
        }
        if (shot === 'member-after') {
          await page.getByRole('link', { name: 'Join Google Meet' }).waitFor()
          assert.equal(await page.getByText('Register to receive the Meet link.').count(), 0)
        }
        const text = await page.locator('body').innerText()
        assert.equal(text.includes('\u2014') || text.includes('\u2013'), false, shot)
        assert.equal(/\bsponsor\b/i.test(text), false, shot)
        assert.equal(/co-host|breakout|recording|livestream|attendance/i.test(text), false, shot)
        if (shot.startsWith('member')) {
          assert.match(text, /Q&A and polls/)
          assert.equal(/\bstaff\b/i.test(text), false, shot)
        }
        if (shot === 'staff-create') {
          assert.match(text, /Fallback if sync fails/)
          assert.match(text, /Google is not connected/)
          assert.equal(await page.locator('[data-majlis-format]').getAttribute('data-majlis-format'), 'virtual')
        }
        const file = path.join(shotDir, `${shot}-${width}.png`)
        await page.screenshot({ path: file, fullPage: false })
        assert.equal(existsSync(file), true)
        await page.close()
      }
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})

async function prepareStaffCreate(page: Page) {
  const format = page.getByRole('combobox', { name: 'Format' }).first()
  await format.waitFor()
  await format.scrollIntoViewIfNeeded()
  await format.selectOption('virtual')
  await page.getByText('Fallback if sync fails').waitFor()
  await format.evaluate((el) => el.scrollIntoView({ block: 'center' }))
}
