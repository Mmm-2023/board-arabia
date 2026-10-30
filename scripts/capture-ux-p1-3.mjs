import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const phase = process.argv[2] === 'after' || process.argv[2] === 'tabs' ? process.argv[2] : 'before'
const shotDir = path.join(root, 'handoff/ba-ux-p1-3')
mkdirSync(shotDir, { recursive: true })

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
process.env.VITE_ANALYTICS_ENABLED = 'false'

const widths = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
]

const views = ['directory', 'rooms', 'seat']

const chrome = '/usr/bin/google-chrome'
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
  executablePath: chrome,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  page.setDefaultTimeout(20_000)
  if (phase === 'tabs') {
    const hubs = ['people', 'majlis', 'ai', 'staff-people', 'staff-majlis']
    const sizes = [
      { name: '390', width: 390, height: 844 },
      { name: '1440', width: 1440, height: 900 },
    ]
    for (const hub of hubs) {
      for (const size of sizes) {
        await page.setViewportSize({ width: size.width, height: size.height })
        await page.goto(`${origin}/ux-p1-3.html?view=tabs&hub=${hub}`, { waitUntil: 'networkidle' })
        await page.locator('[data-section-tabs]').waitFor()
        const report = await page.evaluate(() => {
          const nav = document.querySelector('[data-section-tabs] nav')
          if (!(nav instanceof HTMLElement)) return { missing: true }
          const box = nav.getBoundingClientRect()
          const links = [...nav.querySelectorAll('a')].map((node) => {
            const rect = node.getBoundingClientRect()
            return {
              t: (node.textContent || '').replace(/\s+/g, ' ').trim(),
              top: Math.round(rect.top),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
              outside: rect.right > box.right + 1 || rect.left < box.left - 1 || rect.bottom > box.bottom + 1,
            }
          })
          const rows = new Set(links.map((item) => item.top)).size
          return {
            rows,
            links,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          }
        })
        await page.screenshot({ path: path.join(shotDir, `tabs-${hub}-${size.name}.png`) })
        console.log(`tabs-${hub}-${size.name}`, JSON.stringify(report))
      }
    }
  } else for (const view of views) {
    for (const size of widths) {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto(`${origin}/ux-p1-3.html?view=${view}&state=ready`, { waitUntil: 'networkidle' })
      await page.locator('h1').first().waitFor()
      await page.screenshot({ path: path.join(shotDir, `${phase}-${view}-${size.name}.png`), fullPage: true })
      console.log(`${phase}-${view}-${size.name}`)
    }
  }
  if (phase !== 'tabs') {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [view, state] of [
    ['directory', 'empty'],
    ['directory', 'error'],
    ['directory', 'loading'],
    ['rooms', 'empty'],
    ['rooms', 'error'],
    ['seat', 'error'],
  ]) {
    await page.goto(`${origin}/ux-p1-3.html?view=${view}&state=${state}`, { waitUntil: 'networkidle' })
    await page.locator('h1').first().waitFor()
    await page.screenshot({ path: path.join(shotDir, `${phase}-${view}-${state}-390.png`), fullPage: true })
    console.log(`${phase}-${view}-${state}-390`)
  }
  }
} finally {
  await browser.close()
  await vite.close()
}
