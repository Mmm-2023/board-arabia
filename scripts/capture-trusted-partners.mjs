import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.env.TRUSTED_PARTNERS_SHOT_DIR || '/opt/cursor/artifacts/trusted-partners'
fs.mkdirSync(outDir, { recursive: true })

const png = fs.readFileSync(path.join(root, 'scripts/smoke/fixture-logo.png'))

function chromePath() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

const executablePath = chromePath()
if (!executablePath) throw new Error('Chrome is not installed')

function start(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'ignore' })
  return child
}

async function waitFor(url) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`timed out waiting for ${url}`)
}

const preview = start('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4178', '--strictPort'])
const smoke = start('npx', ['vite', '--config', 'scripts/smoke/vite.config.ts'])

const shots = [
  ['http://127.0.0.1:4178/', 'landing-zero', false],
  ['http://127.0.0.1:4179/trusted-partners.html?view=one', 'landing-one', true],
  ['http://127.0.0.1:4179/trusted-partners.html?view=member', 'member-sample', false],
  ['http://127.0.0.1:4179/trusted-partners.html?view=admin', 'admin-editor', true],
  ['http://127.0.0.1:4178/partners', 'partners-cta', false],
  ['http://127.0.0.1:4179/trusted-partners.html?view=showcase', 'sponsor-showcase', true],
]

try {
  await waitFor('http://127.0.0.1:4178/')
  await waitFor('http://127.0.0.1:4179/trusted-partners.html?view=one')
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
      await page.route('**/partner-logos/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }))
      for (const [url, name, logo] of shots) {
        await page.goto(url, { waitUntil: 'networkidle' })
        if (logo) await page.waitForSelector('img[alt="Example Capital"]')
        if (name === 'member-sample') await page.waitForSelector('text=Sample')
        if (name === 'landing-zero') {
          const html = await page.content()
          if (html.includes('id="partners"') || html.includes('Qaf Ledger')) throw new Error('zero landing rendered partners')
        }
        const file = path.join(outDir, `${name}-${width}.png`)
        await page.screenshot({ path: file, fullPage: true })
        console.log(file)
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
} finally {
  preview.kill('SIGTERM')
  smoke.kill('SIGTERM')
}
