import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const outDir = 'handoff/ba-sm-1'
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
  ['may-fit', 'member-card'],
  ['no-fit', 'member-empty'],
  ['loading', 'member-loading'],
  ['error', 'member-error'],
  ['not-a-fit', 'member-not-a-fit'],
  ['open-card', 'member-yes'],
  ['admin', 'admin-board-seats'],
  ['admin', 'admin-switch-off'],
]

try {
  const only = process.env.ONLY
  for (const width of [390, 1440]) {
    for (const [shot, name] of shots) {
      if (only && name !== only) continue
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await page.goto(`${origin}/scripts/smoke/seat-match.html?shot=${shot}`, { waitUntil: 'networkidle' })
      await page.locator(`[data-shot="${shot}"]`).waitFor()
      const anchor = shot === 'open-card' ? '#boardroom-open-label' : shot === 'admin' ? '[data-seat-suggestions-switch]' : null
      if (anchor) {
        await page.locator(anchor).evaluate((el) => {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        })
      }
      await page.screenshot({ path: path.join(outDir, `${name}-${width}.png`) })
      await context.close()
    }
  }
} finally {
  await browser.close()
  await vite.close()
}
