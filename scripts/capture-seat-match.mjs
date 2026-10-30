import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const outDir = '/opt/cursor/artifacts/seat-match'
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
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const shots = [
  'may-fit',
  'not-open',
  'no-fit',
  'error',
  'loading',
  'seat',
  'people',
  'people-none',
  'pending',
  'open-card',
  'admin',
]

try {
  for (const width of [1440, 390]) {
    for (const shot of shots) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 1400 : 1200 },
      })
      const page = await context.newPage()
      await page.goto(`${origin}/scripts/smoke/seat-match.html?shot=${shot}`, { waitUntil: 'networkidle' })
      await page.locator(`[data-shot="${shot}"]`).waitFor()
      await page.screenshot({ path: path.join(outDir, `${shot}-${width}.png`), fullPage: true })
      await context.close()
    }
  }
} finally {
  await browser.close()
  await vite.close()
}
