import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'

const outDir = '/opt/cursor/artifacts/home-reorder'
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

const sizes = [
  [1440, 900],
  [1280, 800],
  [390, 844],
]

try {
  const heights = {}
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    await page.goto(`${origin}/scripts/smoke/home.html?state=populated`, { waitUntil: 'networkidle' })
    await page.locator('[data-home-snapshot]').waitFor()
    heights[width] = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.screenshot({ path: path.join(outDir, `after-home-full-${width}.png`), fullPage: true })
    await context.close()
  }

  const first = {}
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    await page.goto(`${origin}/scripts/smoke/home-reorder.html?view=home`, { waitUntil: 'networkidle' })
    await page.locator('[data-home-needs]').waitFor()
    await page.locator('[data-home-next]').waitFor()
    const box = await page.locator('[data-home-next]').boundingBox()
    if (!box) throw new Error(`next action missing at ${width}`)
    first[width] = { top: Math.round(box.y), bottom: Math.round(box.y + box.height), viewport: height }
    if (box.y + box.height > height) {
      throw new Error(`next action below the fold at ${width}: bottom ${Math.round(box.y + box.height)} > ${height}`)
    }
    const needs = await page.locator('[data-home-needs]').boundingBox()
    if (!needs || needs.y + needs.height > height) throw new Error(`needs you below the fold at ${width}`)
    await page.screenshot({ path: path.join(outDir, `after-home-first-${width}.png`) })
    await context.close()
  }

  const destinations = ['digest', 'deals', 'intros', 'rooms', 'room', 'profile', 'two-step']
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    for (const view of destinations) {
      await page.goto(`${origin}/scripts/smoke/home-reorder.html?view=${view}`, { waitUntil: 'networkidle' })
      await page.locator(`[data-destination="${view}"]`).waitFor()
      await page.screenshot({ path: path.join(outDir, `dest-${view}-${width}.png`) })
    }
    await context.close()
  }

  const before = { 1280: 3393, 1440: 3393, 390: 4079 }
  const report = { before, after: heights, first }
  writeFileSync(path.join(outDir, 'heights.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
  await vite.close()
}
