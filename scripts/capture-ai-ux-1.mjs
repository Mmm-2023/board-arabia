import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const phase = process.argv[2] === 'after' ? 'after' : 'before'
const shotDir = path.join(root, 'handoff/ai-ux-1')
mkdirSync(shotDir, { recursive: true })

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
process.env.VITE_ANALYTICS_ENABLED = 'false'

const widths = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
]

const allViews = [
  { name: 'start', view: 'start', ready: 'h1', scroll: 'top' },
  { name: 'list', view: 'list', ready: 'text=Example Cold Chain', scroll: 'list' },
  { name: 'list-empty', view: 'start', ready: 'text=No checks yet', scroll: 'empty' },
  { name: 'report', view: 'report', ready: 'text=looks clear', scroll: 'top' },
  { name: 'loading', view: 'loading', ready: '[aria-busy="true"]', scroll: 'top' },
  { name: 'error', view: 'error', ready: '[role="alert"]', scroll: 'top' },
]
const only = process.argv.slice(3)
const views = only.length > 0 ? allViews.filter((item) => only.includes(item.name)) : allViews

const viteModule = await import('vite')
const vite = await viteModule.createServer({
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
    for (const item of views) {
      await page.goto(`${origin}/ai-ux-1.html?view=${item.view}`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForSelector(item.ready)
      if (item.scroll === 'list') {
        await page.locator('#dd-history').scrollIntoViewIfNeeded()
        await page.evaluate(() => {
          document.getElementById('dd-history')?.scrollIntoView({ block: 'start' })
          window.scrollBy(0, -72)
        })
      } else if (item.scroll === 'empty') {
        await page.getByText('No checks yet').scrollIntoViewIfNeeded()
        await page.evaluate(() => {
          const node = [...document.querySelectorAll('p')].find((item) => item.textContent?.includes('No checks yet'))
          node?.scrollIntoView({ block: 'center' })
        })
      } else {
        await page.evaluate(() => window.scrollTo(0, 0))
      }
      await page.waitForTimeout(80)
      await page.screenshot({ path: path.join(shotDir, `${phase}-${item.name}-${size.name}.png`) })
    }
  }
} finally {
  await browser.close()
  await vite.close()
}
