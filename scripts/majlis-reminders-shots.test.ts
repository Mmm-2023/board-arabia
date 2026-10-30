import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shotDir = path.join(root, 'handoff/ba-p1a-majlis-reminders')

function chromePath() {
  return (
    resolveChromePath() ||
    (existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : null) ||
    (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : null)
  )
}

test('draft letter shots are stored for the handoff', (t) => {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    t.skip('The layout test writes the shots on a local run.')
    return
  }
  assert.equal(existsSync(path.join(shotDir, 'letters-390.png')), true)
  assert.equal(existsSync(path.join(shotDir, 'letters-1440.png')), true)
})

test('draft reminder letters stay plain at 390 and 1440', { timeout: 180_000 }, async (t) => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    t.skip('Shots are taken locally and committed.')
    return
  }
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
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
    for (const width of [390, 1440] as const) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
      page.setDefaultTimeout(60_000)
      await page.goto(`${origin}/scripts/smoke/majlis-reminder-letters.html`, { waitUntil: 'domcontentloaded' })
      await page.locator('[data-shot="letters"]').waitFor()
      const text = await page.locator('body').innerText()
      assert.equal(text.includes('\u2014') || text.includes('\u2013'), false, String(width))
      assert.equal(/\bsponsor\b/i.test(text), false, String(width))
      assert.equal(text.includes('meet.google.com'), false, String(width))
      assert.match(text, /The Meet link is not ready yet/)
      assert.match(text, /Your place is confirmed\. The Join link appears here when it is ready\./)
      assert.match(text, /is starting now/)
      assert.match(text, /starts in about one hour/)
      assert.match(text, /Open the majlis/)
      const bodySize = await page.locator('[data-letter-html] p').first().evaluate((el) => {
        return Number.parseFloat(getComputedStyle(el).fontSize)
      })
      assert.ok(bodySize >= 15, `body ${bodySize}`)
      const box = await page.locator('[data-letter-html] a').first().boundingBox()
      assert.ok(box && box.height >= 44 && box.width >= 44, JSON.stringify(box))
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
      assert.equal(overflow, true, String(width))
      await page.screenshot({
        path: path.join(shotDir, `letters-${width}.png`),
        fullPage: true,
      })
      await page.close()
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})
