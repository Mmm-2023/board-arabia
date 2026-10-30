import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function chromePath() {
  const resolved = resolveChromePath()
  if (resolved) return resolved
  if (existsSync('/usr/bin/google-chrome')) return '/usr/bin/google-chrome'
  if (existsSync('/usr/local/bin/google-chrome')) return '/usr/local/bin/google-chrome'
  return null
}

test('directory, deal rooms, and post a seat keep the 15px and 44px floors in source', () => {
  const css = read('src/index.css')
  assert.match(css, /\[data-read-floor\]/)
  assert.match(css, /font-size: 1rem !important/)
  assert.match(css, /font-size: 1\.0625rem !important/)
  assert.match(css, /min-height: 44px/)
  const floor = css.slice(css.indexOf('[data-read-floor]'))
  assert.equal(floor.includes('\u2014'), false)
  assert.equal(floor.includes('\u2013'), false)

  for (const file of [
    'src/pages/dashboard/DirectoryBoard.tsx',
    'src/pages/dashboard/DirectoryEmpty.tsx',
    'src/pages/dashboard/DirectoryPage.tsx',
    'src/pages/dashboard/DealRoomsView.tsx',
    'src/pages/dashboard/MemberBoardSeatsView.tsx',
  ]) {
    const source = read(file)
    assert.match(source, /data-read-floor/, file)
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(source.includes('\u2013'), false, file)
  }

  const directory = read('src/pages/dashboard/DirectoryBoard.tsx')
  assert.match(directory, /min-h-12 min-w-11 items-center justify-center[\s\S]{0,400}Less' : 'More'/)
  assert.match(directory, /min-h-11 border border-ink\/15/)
  const rooms = read('src/pages/dashboard/DealRoomsView.tsx')
  assert.match(rooms, /text-\[1\.0625rem\]/)
  assert.match(rooms, /xl:max-w-6xl/)
  const form = read('src/pages/dashboard/MemberBoardSeatsView.tsx')
  assert.match(form, /data-member-seat-form/)
  assert.match(form, /absolute inset-0 size-full min-h-11 min-w-11/)
  assert.match(form, /formButtonClass/)
  const tabs = read('src/shell/SectionTabs.tsx')
  assert.match(tabs, /flex-wrap/)
  assert.match(tabs, /text-\[1rem\]/)
  assert.match(tabs, /min-h-11/)
  assert.equal(tabs.includes('overflow-x-auto'), false)
})

type Measured = {
  tiny: { t: string; fs: number; chip: boolean }[]
  small: { t: string; tag: string; w: number; h: number }[]
  shout: { t: string; fs: number; transform: string }[]
  overflow: boolean
  checks: number
}

async function measure(page: Page, scope: string): Promise<Measured> {
  return page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector)
    const tiny: { t: string; fs: number; chip: boolean }[] = []
    const small: { t: string; tag: string; w: number; h: number }[] = []
    const shout: { t: string; fs: number; transform: string }[] = []
    if (!(root instanceof HTMLElement)) {
      return { tiny, small, shout, overflow: true, checks: 0 }
    }
    const ownText = (node: HTMLElement) =>
      [...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    const visible = (node: HTMLElement) => {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (node.classList.contains('sr-only')) return false
      const rect = node.getBoundingClientRect()
      return rect.width >= 1 && rect.height >= 1
    }
    const nodes = root.querySelectorAll('p, span, a, button, label, legend, li, dt, dd, h1, h2, h3')
    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || !visible(node)) continue
      const text = ownText(node)
      if (!text) continue
      const fs = Number.parseFloat(getComputedStyle(node).fontSize)
      const chip = node.closest('[data-chip]') instanceof HTMLElement
      if (chip ? fs < 13 : fs < 15) tiny.push({ t: text.slice(0, 60), fs, chip })
    }
    const taps = root.querySelectorAll('a, button, input, select, textarea, summary')
    for (const node of taps) {
      if (!(node instanceof HTMLElement) || !visible(node)) continue
      const rect = node.getBoundingClientRect()
      if (rect.width < 44 || rect.height < 44) {
        const style = getComputedStyle(node)
        small.push({
          t: (ownText(node) || node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.tagName)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60),
          tag: `${node.tagName.toLowerCase()}${node.getAttribute('type') ? `[${node.getAttribute('type')}]` : ''}`,
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        })
        void style
      }
      const label = ownText(node)
      if (label && (node.tagName === 'BUTTON' || (node.tagName === 'A' && node.classList.contains('inline-flex')))) {
        const style = getComputedStyle(node)
        const fs = Number.parseFloat(style.fontSize)
        if (fs < 17 || style.textTransform === 'uppercase') {
          shout.push({
            t: label.slice(0, 60),
            fs,
            transform: style.textTransform,
          })
        }
      }
    }
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    const checks = root.querySelectorAll('input[type="checkbox"], input[type="radio"]').length
    return { tiny, small, shout, overflow, checks }
  }, scope)
}

test('directory, deal rooms, and post a seat measure 15px text and 44px targets', { timeout: 180_000 }, async (t) => {
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
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
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(20_000)
    const widths = [390, 768, 1440]
    const views = ['directory', 'rooms', 'seat'] as const
    for (const view of views) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await page.goto(`${origin}/ux-p1-3.html?view=${view}&state=ready`, { waitUntil: 'networkidle' })
        await page.locator('[data-read-floor]').waitFor()
        const measured = await measure(page, '[data-read-floor]')
        assert.equal(measured.overflow, false, `${view} ${width} overflows sideways`)
        assert.deepEqual(measured.tiny, [], `${view} ${width} text under the floor`)
        assert.deepEqual(measured.small, [], `${view} ${width} tap targets under 44px`)
        assert.deepEqual(measured.shout, [], `${view} ${width} buttons under 17px or still uppercase`)
        const tabs = await measure(page, '[data-section-tabs]')
        assert.deepEqual(tabs.tiny, [], `${view} ${width} section tab text under 15px`)
        assert.deepEqual(tabs.small, [], `${view} ${width} section tabs under 44px`)
        if (view === 'seat') assert.equal(measured.checks, 29, `${width} seat checks`)
      }
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${origin}/ux-p1-3.html?view=directory&state=ready`, { waitUntil: 'networkidle' })
    const peerCard = page.locator('article', { hasText: 'Example Peer' })
    await peerCard.getByRole('button', { name: 'More' }).click()
    await peerCard.getByRole('button', { name: 'Request intro' }).click()
    await page.getByRole('button', { name: 'Filters' }).click()
    const open = await measure(page, '[data-read-floor]')
    assert.deepEqual(open.tiny, [], 'open directory text under the floor')
    assert.deepEqual(open.small, [], 'open directory tap targets under 44px')
    assert.deepEqual(open.shout, [], 'open directory buttons under 17px')
    for (const [view, state] of [
      ['directory', 'empty'],
      ['directory', 'error'],
      ['directory', 'loading'],
      ['rooms', 'empty'],
      ['rooms', 'error'],
      ['seat', 'error'],
    ] as const) {
      await page.goto(`${origin}/ux-p1-3.html?view=${view}&state=${state}`, { waitUntil: 'networkidle' })
      await page.locator('[data-read-floor]').waitFor()
      const measured = await measure(page, '[data-read-floor]')
      assert.equal(measured.overflow, false, `${view} ${state} overflows`)
      assert.deepEqual(measured.tiny, [], `${view} ${state} text under the floor`)
      assert.deepEqual(measured.small, [], `${view} ${state} tap targets under 44px`)
      assert.deepEqual(measured.shout, [], `${view} ${state} buttons under 17px`)
    }
    await page.goto(`${origin}/ux-p1-3.html?view=directory&state=empty`, { waitUntil: 'networkidle' })
    assert.match(await page.locator('[data-read-floor]').innerText(), /Founding 100 is filling/)
    await page.goto(`${origin}/ux-p1-3.html?view=directory&state=error`, { waitUntil: 'networkidle' })
    assert.match(await page.locator('[role="alert"]').innerText(), /Retry|try|again|refresh|load/i)
    await page.goto(`${origin}/ux-p1-3.html?view=rooms&state=empty`, { waitUntil: 'networkidle' })
    assert.match(await page.locator('[data-read-floor]').innerText(), /None are open|No rooms|empty|Open a room/i)
    await page.goto(`${origin}/ux-p1-3.html?view=seat&state=error`, { waitUntil: 'networkidle' })
    assert.match(await page.locator('[role="alert"]').innerText(), /Add a title/)
  } finally {
    await browser.close()
    await vite.close()
  }
})
