import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const outDir = '/opt/cursor/artifacts'
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

const shots = {
  list: { text: 'My applications', height: { 1440: 1100, 390: 1280 } },
  apply: { text: 'Put yourself forward', height: { 1440: 1100, 390: 1200 } },
  shortlist: { text: 'Open introduction', height: { 1440: 1100, 390: 1100 } },
}

try {
  for (const width of [1440, 390]) {
    for (const [shot, spec] of Object.entries(shots)) {
      const context = await browser.newContext({
        viewport: { width, height: spec.height[width] },
      })
      const page = await context.newPage()
      await page.goto(`${origin}/scripts/smoke/board-seats-sm2.html?shot=${shot}`, { waitUntil: 'networkidle' })
      await page.getByText(spec.text, { exact: false }).first().waitFor()
      await page.screenshot({
        path: path.join(outDir, `sm2-${shot}-${width}.png`),
      })
      await context.close()
    }
  }
} finally {
  await browser.close()
  await vite.close()
}
