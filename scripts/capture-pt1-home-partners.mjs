import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'

const outDir = '/opt/cursor/artifacts/pt1-home-partners'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  configFile: path.resolve('vite.config.ts'),
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
})
await vite.listen()
const address = vite.httpServer?.address()
const port = address && typeof address === 'object' ? address.port : 0
const origin = `http://127.0.0.1:${port}`
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const shots = []

try {
  for (const state of ['partners-examples', 'partners-bank']) {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height } })
      const page = await context.newPage()
      await page.goto(`${origin}/scripts/smoke/home.html?state=${state}`, { waitUntil: 'networkidle' })
      await page.locator('[data-home-snapshot]').waitFor()
      const summary = page.locator('[data-home-more] summary')
      await summary.filter({ hasText: 'See more' }).click()
      await summary.filter({ hasText: 'See less' }).waitFor()
      const gallery = page.locator('[data-gallery="partners"]')
      await gallery.waitFor()
      if (state === 'partners-examples') {
        await page.locator('[data-partner-name="Dar Clearing"]').waitFor()
        await page.locator('[data-partner-name="Harbour Clearing"]').waitFor({ state: 'detached' })
      } else {
        await page.locator('[data-partner-name="Harbour Clearing"]').waitFor()
        await page.locator('[data-partner-name="Dar Clearing"]').waitFor({ state: 'detached' })
        await page.locator('[data-partner-name="Qaf Counsel"]').waitFor()
      }
      const file = `home-${state}-${width}.png`
      await gallery.scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(outDir, file), fullPage: true })
      shots.push(file)
      await context.close()
    }
  }
  console.log(JSON.stringify({ outDir, shots }, null, 2))
} finally {
  await browser.close()
  await vite.close()
}
