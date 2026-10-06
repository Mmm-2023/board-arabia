/**
 * Layout check for the landing features section against vite preview of dist.
 * Saves full-page shots of the landing, /for-members, and each section CTA destination.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { LANDING_FEATURES } from '../src/content/landingFeatures.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.env.LANDING_SHOT_DIR || '/opt/cursor/artifacts'
const port = 4178
fs.mkdirSync(outDir, { recursive: true })

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

const executablePath = chromePath()
if (!executablePath) throw new Error('Chrome is not installed')

const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: root, stdio: 'ignore' },
)

const shots = [
  ['/', 'landing-features', 'Where Saudi boardrooms meet international capital', 'Features and tools'],
  ['/for-members', 'for-members', 'Built for founding members', ''],
  ['/apply', 'apply', 'Apply for consideration', ''],
  ['/login', 'login', 'Sign in', ''],
  ['/for-capital', 'for-capital', 'Capital engages through our admin team', ''],
  ['/security', 'security', 'Trust and privacy', ''],
]

try {
  await waitForPreview()
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    for (const reduced of [false, true]) {
      for (const [width, height] of [
        [1280, 900],
        [390, 844],
      ]) {
        const context = await browser.newContext({
          viewport: { width, height },
          reducedMotion: reduced ? 'reduce' : 'no-preference',
        })
        const page = await context.newPage()
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
        await page.waitForSelector('#membership [data-feature]')
        const layout = await page.evaluate(async (expected) => {
          const root = document.documentElement
          const section = document.querySelector('#membership')
          if (!section) return { ok: false, reason: 'missing section' }
          section.scrollIntoView()
          const cards = [...section.querySelectorAll('[data-feature]')]
          for (const card of cards) card.scrollIntoView({ block: 'center' })
          await new Promise((resolve) => setTimeout(resolve, 400))
          const hidden = cards.filter((card) => !isShown(card)).map((card) => card.getAttribute('data-feature'))
          const groups = [...section.querySelectorAll('[data-feature-group]')].map((group) => {
            const items = [...group.querySelectorAll('[data-feature]')]
            return {
              id: group.getAttribute('data-feature-group'),
              count: items.length,
              columns: new Set(items.map((item) => item.offsetLeft)).size,
            }
          })
          const controls = [...section.querySelectorAll('a, button')].map((node) => ({
            text: (node.textContent || '').trim().slice(0, 40),
            height: node.getBoundingClientRect().height,
          }))
          const short = controls.filter((control) => control.height < 44)
          return {
            ok: hidden.length === 0 && short.length === 0 && root.scrollWidth <= window.innerWidth && cards.length === expected,
            scrollWidth: root.scrollWidth,
            innerWidth: window.innerWidth,
            count: cards.length,
            hidden,
            groups,
            short,
          }

          function isShown(node) {
            let current = node
            while (current && current !== document.body) {
              const style = getComputedStyle(current)
              if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
              current = current.parentElement
            }
            const rect = node.getBoundingClientRect()
            return rect.width > 8 && rect.height > 8
          }
        }, LANDING_FEATURES.length)
        if (!layout.ok) {
          throw new Error(`layout ${width} reduced=${reduced} ${JSON.stringify(layout)}`)
        }
        const wide = width === 1280
        for (const group of layout.groups) {
          if (wide && group.count >= 3 && group.columns !== 3) {
            throw new Error(`${group.id} has ${group.columns} columns at 1280`)
          }
          if (!wide && group.columns !== 1) {
            throw new Error(`${group.id} has ${group.columns} columns at 390`)
          }
        }
        await context.close()
      }
    }

    for (const [route, name, heading, also] of shots) {
      for (const [width, height] of [
        [1280, 900],
        [390, 844],
      ]) {
        const context = await browser.newContext({ viewport: { width, height } })
        const page = await context.newPage()
        await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle' })
        await page.waitForSelector('h1')
        await page.waitForTimeout(1500)
        const text = await page.locator('h1').first().innerText()
        if (!text.includes(heading)) throw new Error(`${route} heading was ${text}`)
        if (also) {
          const body = await page.locator('body').innerText()
          if (!body.includes(also)) throw new Error(`${route} missing ${also}`)
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        if (!overflow) throw new Error(`${route} overflows at ${width}`)
        await page.screenshot({
          path: path.join(outDir, `${name}-${width}.png`),
          fullPage: true,
        })
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
} finally {
  preview.kill('SIGTERM')
}

async function waitForPreview() {
  const started = Date.now()
  while (Date.now() - started < 20000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.ok) return
    } catch {
      // Preview is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('vite preview did not start')
}
