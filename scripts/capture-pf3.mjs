import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'

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

try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1400 } })
    const page = await context.newPage()

    await page.goto(`${origin}/scripts/smoke/pf3.html?view=profile`, { waitUntil: 'networkidle' })
    const city = page.locator('#profile-city-block')
    await city.waitFor()
    const other = page.locator('#profile-city-other')
    await other.waitFor()
    if ((await other.inputValue()) !== 'Abha') throw new Error('other city was not open')
    await city.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
    await city.screenshot({ path: path.join(outDir, `pf3-city-other-${width}.png`) })
    const sectors = page.getByRole('group', { name: 'Sector' })
    await sectors.waitFor()
    const realEstate = sectors.getByRole('button', { name: 'Real estate', exact: true })
    await realEstate.waitFor()
    if ((await realEstate.getAttribute('aria-pressed')) !== 'true') throw new Error('Real estate was not selected')
    await sectors.screenshot({ path: path.join(outDir, `pf3-sectors-${width}.png`) })

    await page.goto(`${origin}/scripts/smoke/pf3.html?view=directory`, { waitUntil: 'networkidle' })
    const article = page.locator('article')
    await article.waitFor()
    if (width < 768) {
      await page.getByRole('button', { name: 'More', exact: true }).click()
    }
    const about = article.getByText('Example. Independent chair across family holdings.')
    await about.first().waitFor()
    await article.screenshot({ path: path.join(outDir, `pf3-directory-about-${width}.png`) })
    const request = article.getByRole('button', { name: 'Request intro', exact: true })
    await request.click()
    await article.getByRole('textbox', { name: 'Why this introduction' }).waitFor()
    await about.first().waitFor()
    await article.screenshot({ path: path.join(outDir, `pf3-intro-about-${width}.png`) })

    await page.goto(`${origin}/scripts/smoke/pf3.html?view=admin`, { waitUntil: 'networkidle' })
    const sectorGroup = page.getByRole('group', { name: 'Sector tags' })
    await sectorGroup.waitFor()
    await sectorGroup.getByText('Real estate', { exact: true }).waitFor()
    await sectorGroup.screenshot({ path: path.join(outDir, `pf3-admin-sectors-${width}.png`) })

    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
