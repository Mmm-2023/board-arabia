import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const outDir = process.env.PUSH_SHOT_DIR || '/opt/cursor/artifacts'
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

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
    })
    const page = await context.newPage()
    await page.goto(`${origin}/scripts/smoke/push-settings.html`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'Your privacy' }).waitFor()
    const panel = page.locator('[data-shot="web-privacy"]')
    await panel.screenshot({ path: path.join(outDir, `web-privacy-${width}.png`) })
    const text = await panel.innerText()
    if (text.includes('Push notifications')) throw new Error('web shot shows the push control')
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
