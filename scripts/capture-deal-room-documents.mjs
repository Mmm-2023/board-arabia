import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const shots = [
  ['docs-empty', 'deal-docs-empty'],
  ['docs-files', 'deal-docs-files'],
  ['docs-viewer-off', 'deal-docs-viewer-off'],
  ['docs-viewer-on', 'deal-docs-viewer-on'],
  ['docs-expiry', 'deal-docs-expiry'],
  ['docs-log', 'deal-docs-log'],
  ['docs-expired', 'deal-docs-expired'],
  ['staff-counts', 'deal-docs-staff-counts'],
]

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
  for (const width of [1280, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 900 : 1000 },
    })
    const page = await context.newPage()
    await page.goto(`${origin}/scripts/smoke/deal-room-documents.html`, { waitUntil: 'networkidle' })
    await page.getByText('viewer@example.com').first().waitFor()
    await page.getByText('3 documents').waitFor()
    await page.getByText('Access expired').waitFor()
    for (const [id, name] of shots) {
      const file = path.join(outDir, `${name}-${width}.png`)
      await page.locator(`#${id}`).screenshot({ path: file })
    }
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
