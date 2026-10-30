import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'

const outDir = '/opt/cursor/artifacts'
const commitDir = path.resolve('handoff/ba-db-1')
mkdirSync(outDir, { recursive: true })
mkdirSync(commitDir, { recursive: true })

const shots = [
  ['[data-daily-brief-status]', 'admin-status'],
  ['[data-daily-brief-actions]', 'admin-actions'],
  ['[data-daily-brief-preview]', 'admin-preview'],
  ['#member-card', 'member-card'],
  ['#member-page', 'member-page'],
  ['#member-empty', 'member-empty'],
  ['#member-error', 'member-error'],
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
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 900 : 1100 },
    })
    const page = await context.newPage()
    await page.goto(`${origin}/scripts/smoke/daily-market-brief.html`, { waitUntil: 'networkidle' })
    const outlets = page.locator('[data-daily-brief-outlets]')
    await outlets.locator('input[value="Saudi Press Agency"]').waitFor()
    await outlets.locator('input[value="Vision 2030"]').waitFor()
    await outlets.locator('input[value="Asharq Business with Bloomberg"]').waitFor()
    if ((await outlets.locator('li').count()) !== 11) throw new Error('expected 11 seeded outlets')
    await page.getByText('Not configured: search key not set.').waitFor()
    await page.getByText('Example holding plans a sample venture').first().waitFor()
    await page.getByText("Today's brief is not ready yet").waitFor()
    await page.getByText('For information only, not advice.').first().waitFor()
    await page.getByRole('button', { name: 'Approve brief' }).waitFor()
    await page.getByText('We could not load the brief').waitFor()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    if (overflow) throw new Error(`horizontal overflow at ${width}`)
    const link = page.locator('#member-card a[href="/dashboard/market-brief"]')
    await link.waitFor()
    const source = page.locator('#member-page a[href="https://www.spa.gov.sa/w/example-deal"]')
    await source.waitFor()
    if ((await source.getAttribute('rel')) !== 'noopener noreferrer') throw new Error('source rel missing')
    if ((await source.getAttribute('target')) !== '_blank') throw new Error('source target missing')
    const text = await page.locator('body').innerText()
    if (text.includes('\u2014')) throw new Error('em dash on the brief screens')
    if (/\b(openai|grok|anthropic|chatgpt|claude)\b/i.test(text)) throw new Error('provider name on the brief screens')
    for (const [selector, name] of shots) {
      const file = path.join(commitDir, `${name}-${width}.png`)
      await page.locator(selector).screenshot({ path: file })
      await page.locator(selector).screenshot({ path: path.join(outDir, `${name}-${width}.png`) })
    }
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
