import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function chromePath() {
  const resolved = resolveChromePath()
  if (resolved) return resolved
  if (existsSync('/usr/bin/google-chrome')) return '/usr/bin/google-chrome'
  if (existsSync('/usr/bin/chromium')) return '/usr/bin/chromium'
  return null
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const screen = document.querySelector('[data-dd-screen]')
    if (!(screen instanceof HTMLElement)) return { titles: [] as string[], small: [] as string[], taps: [] as string[], odd: false }
    const titles = [...screen.querySelectorAll('[data-dd-title]')].map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
    const small: string[] = []
    const taps: string[] = []
    const textNodes = screen.querySelectorAll('p, span, a, button, h1, h2, li, label, dd')
    for (const node of textNodes) {
      if (!(node instanceof HTMLElement)) continue
      let text = ''
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) text += child.textContent || ''
      }
      text = text.replace(/\s+/g, ' ').trim()
      if (!text) continue
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const size = Number.parseFloat(style.fontSize)
      const weight = Number.parseInt(style.fontWeight, 10) || 400
      const chip =
        node.className.includes('rounded-full') ||
        node.className.includes('dd-pill') ||
        Boolean(node.closest('.dd-pill, [data-chip]'))
      const label = weight >= 600 && size >= 13 && size < 15
      if (!chip && !label && size < 15) small.push(`${size.toFixed(2)} ${text.slice(0, 60)}`)
      if ((chip || label) && size < 13) small.push(`${size.toFixed(2)} label ${text.slice(0, 40)}`)
    }
    const controls = screen.querySelectorAll('a, button, input, summary')
    for (const node of controls) {
      if (!(node instanceof HTMLElement)) continue
      if (node.classList.contains('sr-only')) continue
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const box =
        node instanceof HTMLInputElement && node.type === 'checkbox'
          ? node.closest('div') ?? node
          : node
      const rect = box.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      if (rect.height < 44 || rect.width < 44) {
        const name = (node.textContent || node.getAttribute('aria-label') || node.id || node.tagName).replace(/\s+/g, ' ').trim().slice(0, 40)
        taps.push(`${Math.round(rect.width)}x${Math.round(rect.height)} ${name} ${node.className.toString().slice(0, 80)}`)
      }
    }
    return {
      titles,
      small,
      taps,
      odd: (screen.textContent || '').includes('\u00D2') || (screen.textContent || '').includes('\u00D3'),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }
  })
}

test('due diligence title shots at 390 and 1440', { timeout: 180_000 }, async (t) => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    t.skip('The smoke compile does not finish under the parallel suite. Title logic is covered by scripts/deck-title.test.ts.')
    return
  }
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const shotDir = process.env.DD_TITLE_SHOTS
  if (shotDir) mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    configFile: path.join(root, 'scripts/smoke/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const address = vite.httpServer?.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const origin = `http://127.0.0.1:${port}`
    const page = await browser.newPage()
    const views = ['list', 'title', 'loading', 'empty', 'error'] as const
    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      for (const view of views) {
        await page.goto(`${origin}/dd-titles.html?view=${view}`, { waitUntil: 'networkidle' })
        await page.waitForSelector('[data-dd-screen]')
        const measured = await measure(page)
        assert.equal(measured.odd, false, `${view} ${width}`)
        assert.equal(measured.overflow, false, `${view} ${width}`)
        if (view === 'list' || view === 'title') {
          assert.deepEqual(measured.small, [], `${view} ${width} ${measured.small?.join(' | ')}`)
          assert.deepEqual(measured.taps, [], `${view} ${width} ${measured.taps?.join(' | ')}`)
        }
        if (view === 'list') {
          assert.ok(measured.titles.includes('Made In KSA Gateway to Centralized Economy'), measured.titles.join(' | '))
          assert.ok(measured.titles.includes('Northwind Logistics'))
          assert.ok(measured.titles.includes('Harborline Robotics'))
          assert.equal(await page.locator('text=No checks yet').count(), 0)
        }
        if (view === 'title') {
          assert.ok(measured.titles.includes('Made In KSA Gateway to Centralized Economy'), measured.titles.join(' | '))
          assert.equal(await page.locator('text=\u00D2').count(), 0)
        }
        if (view === 'loading') assert.equal(await page.locator('[aria-busy="true"]').count(), 1)
        if (view === 'empty') assert.equal(await page.locator('text=No checks yet').count(), 1)
        if (view === 'error') assert.equal(await page.locator('[role="alert"]').count(), 1)
        if (shotDir) {
          await page.screenshot({
            path: path.join(shotDir, `${view}-${width}.png`),
            fullPage: view === 'list' || view === 'empty',
          })
        }
      }
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})
