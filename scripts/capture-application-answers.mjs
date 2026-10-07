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

try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 2400 },
    })
    const page = await context.newPage()
    await page.goto(`${origin}/scripts/smoke/application-answers-profile.html`, {
      waitUntil: 'domcontentloaded',
    })
    const tags = page.locator('#profile-tags')
    await tags.waitFor()
    const energy = page.getByRole('button', { name: 'Energy transition', exact: true })
    const renewable = page.getByRole('button', { name: 'Renewable energy', exact: true })
    await energy.waitFor()
    await renewable.waitFor()
    if ((await energy.getAttribute('aria-pressed')) !== 'true') throw new Error('sector was not carried')
    if ((await renewable.getAttribute('aria-pressed')) !== 'true') throw new Error('theme was not carried')
    const file = path.join(outDir, `pf2-profile-tags-${width}.png`)
    await tags.screenshot({ path: file })
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
