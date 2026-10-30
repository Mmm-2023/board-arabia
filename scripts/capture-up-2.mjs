import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const phase = process.argv[2] === 'after' ? 'after' : 'before'
const shotDir = path.join(root, 'handoff/ba-up-2')
mkdirSync(shotDir, { recursive: true })

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
process.env.VITE_ANALYTICS_ENABLED = 'false'

const { createServer } = await import('vite')
const widths = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
]
const screens = ['deals', 'ai', 'real-estate', 'majlis']
const states = phase === 'after' ? ['ready', 'loading', 'empty', 'error'] : ['ready']

const vite = await createServer({
  configFile: path.join(root, 'scripts/smoke/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0, hmr: false },
  logLevel: 'error',
})
await vite.listen()
const address = vite.httpServer?.address()
const port = address && typeof address === 'object' ? address.port : 0
const origin = `http://127.0.0.1:${port}`
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  page.setDefaultTimeout(20_000)
  for (const size of widths) {
    await page.setViewportSize({ width: size.width, height: size.height })
    for (const screen of screens) {
      for (const state of states) {
        const suffix = state === 'ready' ? '' : `-${state}`
        await page.goto(`${origin}/up-2.html?screen=${screen}&state=${state}`, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForSelector('[data-up2-screen], [data-majlis-section], [data-re-segment]')
        await page.waitForTimeout(80)
        await page.screenshot({ path: path.join(shotDir, `${phase}-${screen}${suffix}-${size.name}.png`) })
      }
    }
  }
} finally {
  await browser.close()
  await vite.close()
}
