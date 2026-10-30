import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
process.env.VITE_ANALYTICS_ENABLED = 'false'
process.env.VITE_LEGAL_CONTACT_EMAIL = 'legal@example.com'

const out = path.resolve('handoff/ba-pf-7-focus-fields')
mkdirSync(out, { recursive: true })

const vite = await createServer({
  server: { host: '127.0.0.1', port: 0, hmr: false },
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

const shots = [
  { view: 'completeness', file: 'completeness', scroll: 'Better intro reasons' },
  { view: 'focus', file: 'focus', scroll: 'I can help with' },
  { view: 'directory', file: 'directory-chips', scroll: 'Can help with' },
  { view: 'directory', file: 'directory-lines', scroll: 'Introductions to operators', more: true },
  { view: 'suggestion', file: 'suggestion', scroll: 'They can help with deal introductions' },
]

try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 1100 : 1000 } })
    const page = await context.newPage()
    for (const shot of shots) {
      await page.goto(`${origin}/scripts/smoke/focus.html?view=${shot.view}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(400)
      if (shot.more && width < 768) {
        await page.getByRole('button', { name: 'More' }).click()
        await page.waitForTimeout(200)
      }
      const target = page.getByText(shot.scroll, { exact: false }).filter({ visible: true }).first()
      await target.waitFor({ state: 'visible', timeout: 8000 })
      await target.scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(out, `${shot.file}-${width}.png`) })
    }
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
