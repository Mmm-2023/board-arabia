import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'

const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  configFile: path.resolve('scripts/smoke/vite.config.ts'),
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } })
  const page = await context.newPage()

  await page.goto(`${origin}/owner-gate.html?view=people&role=owner`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Invite member' }).waitFor()
  await page.getByRole('heading', { name: 'Add staff' }).waitFor()
  const role = page.getByRole('combobox', { name: 'Role' })
  if ((await role.inputValue()) !== 'staff') throw new Error('new staff role was not Admin')
  await page.locator('[data-add-staff="true"]').screenshot({ path: path.join(outDir, 'owner-gate-add-staff.png') })

  await page.goto(`${origin}/owner-gate.html?view=people&role=admin`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'People' }).waitFor()
  if (await page.getByRole('heading', { name: 'Add staff' }).count()) throw new Error('admin saw add staff')
  await page.screenshot({ path: path.join(outDir, 'owner-gate-people-admin.png'), fullPage: false })

  await page.goto(`${origin}/owner-gate.html?view=settings&role=owner`, { waitUntil: 'networkidle' })
  const roster = page.locator('[data-staff-roster="true"]')
  await roster.waitFor()
  await roster.getByText('Example Owner').waitFor()
  await roster.getByText('The last owner stays in place.', { exact: true }).waitFor()
  await roster.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('dialog', { name: 'Remove this staff member?' }).waitFor()
  await page.screenshot({ path: path.join(outDir, 'owner-gate-settings-remove.png') })
  await page.getByRole('button', { name: 'Cancel' }).click()
  await roster.screenshot({ path: path.join(outDir, 'owner-gate-settings.png') })

  await page.goto(`${origin}/owner-gate.html?view=home&role=owner`, { waitUntil: 'networkidle' })
  const count = page.locator('[data-staff-count]')
  await count.waitFor()
  if ((await count.getAttribute('data-staff-count')) !== '2') throw new Error('staff count missed the owner')
  const card = page.locator('article', { has: count })
  await card.screenshot({ path: path.join(outDir, 'owner-gate-home-count.png') })

  await context.close()
} finally {
  await browser.close()
  await vite.close()
}
