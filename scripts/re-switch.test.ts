import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createServer } from 'vite'
import { chromium, type Page } from 'playwright-core'
import { CHROME_SKIP, resolveChromePath } from './chrome-path.ts'

function chromePath() {
  const resolved = resolveChromePath()
  if (resolved) return resolved
  for (const candidate of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

test('real estate keeps partners and roles query values and a segmented switch', () => {
  const page = read('src/pages/dashboard/RealEstatePage.tsx')
  const board = read('src/pages/dashboard/RealEstateBoard.tsx')
  const redirects = read('src/shell/redirects.ts')
  assert.match(page, /view === 'partners' \? 'partners' : view === 'roles' \? 'roles'/)
  assert.match(page, /nextParams\.set\('view', 'partners'\)/)
  assert.match(page, /nextParams\.set\('view', 'roles'\)/)
  assert.match(page, /nextParams\.delete\('view'\)/)
  assert.equal(page.includes("set('view', 'firms')"), false)
  assert.equal(page.includes("set('view', 'board-roles')"), false)
  assert.match(board, /label: 'Opportunities'/)
  assert.match(board, /label: 'Firms'/)
  assert.match(board, /label: 'Board roles'/)
  assert.equal(board.includes('Real estate firms'), false)
  assert.match(board, /data-re-segment/)
  assert.match(board, /role="tablist"/)
  assert.match(board, /onKeyDown=\{onTabKey\}/)
  assert.equal(board.includes('rounded-full'), false)
  assert.match(read('src/shell/SectionTabs.tsx'), /rounded-full/)
  assert.match(read('src/pages/dashboard/DealsLayout.tsx'), /SectionTabs/)
  assert.match(read('src/shell/destinations.ts'), /label: 'Real estate', to: '\/dashboard\/deals\/real-estate'/)
  assert.match(redirects, /'\/dashboard\/real-estate': '\/dashboard\/deals\/real-estate'/)
  for (const file of [page, board]) {
    assert.equal(file.includes('\u2014'), false)
    assert.equal(file.includes('\u2013'), false)
    assert.equal(/\bdesk\b/i.test(file), false)
    assert.equal(/\bsponsor\b/i.test(file), false)
  }
})

test('deep links open the matching real estate panel', async () => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const pageMod = await vite.ssrLoadModule('/src/pages/dashboard/RealEstatePage.tsx')
    const layoutMod = await vite.ssrLoadModule('/src/pages/dashboard/DealsLayout.tsx')
    const cases = [
      { href: '/dashboard/deals/real-estate', tab: 'opportunities', label: 'Opportunities' },
      { href: '/dashboard/deals/real-estate?view=partners', tab: 'partners', label: 'Firms' },
      { href: '/dashboard/deals/real-estate?view=roles', tab: 'roles', label: 'Board roles' },
      { href: '/dashboard/deals/real-estate?view=firms', tab: 'opportunities', label: 'Opportunities' },
      { href: '/dashboard/deals/real-estate?view=board-roles', tab: 'opportunities', label: 'Opportunities' },
    ]
    for (const entry of cases) {
      const html = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: [entry.href] },
          createElement(
            Routes,
            null,
            createElement(
              Route,
              { path: '/dashboard/deals', element: createElement(layoutMod.DealsLayout) },
              createElement(Route, {
                path: 'real-estate',
                element: createElement(pageMod.RealEstatePage),
              }),
            ),
          ),
        ),
      )
      assert.match(html, new RegExp(`data-re-panel="${entry.tab}"`), entry.href)
      assert.match(html, /data-re-segment/)
      assert.match(html, /data-section-tabs/)
      assert.match(html, /href="\/dashboard\/deals\/real-estate"/)
      assert.equal((html.match(/data-re-panel=/g) || []).length, 1, entry.href)
      const selected = new RegExp(
        `data-re-tab="${entry.tab}"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-re-tab="${entry.tab}"`,
      )
      assert.match(html, selected, entry.href)
      assert.match(html, new RegExp(`>${entry.label}<`), entry.href)
      const segment = html.slice(html.indexOf('data-re-segment'), html.indexOf('</header>'))
      assert.equal(segment.includes('rounded-full'), false, entry.href)
    }
  } finally {
    await vite.close()
  }
})

const SHOTS = '/opt/cursor/artifacts'

test('each segment sets the real estate view and arrows keep one row at 390', async (t) => {
  const chrome = chromePath()
  if (!chrome) {
    t.skip(CHROME_SKIP)
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  mkdirSync(SHOTS, { recursive: true })
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const origin = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
  })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(45000)
    const notes: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') notes.push(message.text())
    })
    page.on('pageerror', (error) => notes.push(error.message))

    await page.setViewportSize({ width: 1280, height: 800 })
    await openSwitch(page, origin, '')
    assert.equal(await page.locator('[data-section-tabs] a[aria-current="page"]').getAttribute('href'), '/dashboard/deals/real-estate')
    await page.screenshot({ path: `${SHOTS}/re-switch-route-opportunities-1280.png` })
    await page.getByRole('tab', { name: 'Firms', exact: true }).click()
    await page.waitForURL((url) => url.pathname.endsWith('/re-switch.html') && url.search === '?view=partners')
    await page.locator('[data-re-panel="partners"]').waitFor()
    assert.equal(await page.locator('[data-re-panel="opportunities"]').count(), 0)
    await page.getByRole('tab', { name: 'Board roles', exact: true }).click()
    await page.waitForURL((url) => url.search === '?view=roles')
    await page.locator('[data-re-panel="roles"]').waitFor()
    await page.getByRole('tab', { name: 'Opportunities', exact: true }).click()
    await page.waitForURL((url) => url.search === '')
    await page.locator('[data-re-panel="opportunities"]').waitFor()

    await openSwitch(page, origin, '?view=partners')
    await page.screenshot({ path: `${SHOTS}/re-switch-route-partners-1280.png` })
    await openSwitch(page, origin, '?view=roles')
    await page.screenshot({ path: `${SHOTS}/re-switch-route-roles-1280.png` })
    await openSwitch(page, origin, '?view=firms')
    assert.equal(new URL(page.url()).search, '?view=firms')
    assert.equal(await page.locator('[data-re-tab="opportunities"]').getAttribute('aria-selected'), 'true')
    await openSwitch(page, origin, '?view=board-roles')
    assert.equal(await page.locator('[data-re-tab="roles"]').getAttribute('aria-selected'), 'false')

    await page.setViewportSize({ width: 390, height: 844 })
    await openSwitch(page, origin, '')
    await assertOneRow(page)
    await page.screenshot({ path: `${SHOTS}/re-switch-route-opportunities-390.png` })
    await openSwitch(page, origin, '?view=partners')
    await assertOneRow(page)
    await page.screenshot({ path: `${SHOTS}/re-switch-route-partners-390.png` })
    await openSwitch(page, origin, '?view=roles')
    await assertOneRow(page)
    await page.screenshot({ path: `${SHOTS}/re-switch-route-roles-390.png` })

    await openSwitch(page, origin, '')
    await page.locator('[data-re-tab="opportunities"]').focus()
    await page.keyboard.press('ArrowRight')
    await waitForTab(page, 'partners', '?view=partners')
    const focus = await page.evaluate(() => {
      const el = document.activeElement
      if (!(el instanceof HTMLElement)) return null
      const style = getComputedStyle(el)
      return {
        tab: el.getAttribute('data-re-tab'),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
      }
    })
    assert.equal(focus?.tab, 'partners')
    assert.notEqual(focus?.outlineStyle, 'none')
    assert.ok((focus?.outlineWidth || 0) >= 2, JSON.stringify(focus))
    await page.keyboard.press('ArrowRight')
    await waitForTab(page, 'roles', '?view=roles')
    await page.keyboard.press('ArrowLeft')
    await waitForTab(page, 'partners', '?view=partners')
    await page.keyboard.press('ArrowLeft')
    await waitForTab(page, 'opportunities', '')
    assert.equal(notes.length, 0, notes.join('\n'))
  } finally {
    await browser.close()
    await vite.close()
  }
})

async function waitForTab(page: Page, id: string, search: string) {
  await page.waitForFunction(
    ({ id, search }) => {
      const el = document.activeElement
      return (
        el instanceof HTMLElement &&
        el.getAttribute('data-re-tab') === id &&
        el.getAttribute('aria-selected') === 'true' &&
        location.pathname.endsWith('/re-switch.html') &&
        location.search === search
      )
    },
    { id, search },
  )
}

async function openSwitch(page: Page, origin: string, search: string) {
  const panel = search === '?view=partners' ? 'partners' : search === '?view=roles' ? 'roles' : 'opportunities'
  await page.goto(`${origin}/scripts/smoke/re-switch.html${search}`, { waitUntil: 'domcontentloaded' })
  try {
    await page.locator(`[data-re-panel="${panel}"]`).waitFor()
    await page.locator(`[data-re-tab="${panel}"][aria-selected="true"]`).waitFor()
    await page.locator('[data-section-tabs]').waitFor()
  } catch (error) {
    const html = await page.content()
    throw new Error(`${page.url()}\n${html.slice(0, 900)}\n${error}`)
  }
  const url = new URL(page.url())
  assert.equal(url.pathname, '/scripts/smoke/re-switch.html')
  assert.equal(url.search, search)
}

async function assertOneRow(page: Page) {
  const metrics = await page.evaluate(() => {
    const segment = document.querySelector('[data-re-segment]')
    if (!(segment instanceof HTMLElement)) return null
    const tabs = [...segment.querySelectorAll('[role="tab"]')].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    )
    const box = segment.getBoundingClientRect()
    return {
      height: box.height,
      left: box.left,
      right: box.right,
      innerWidth: window.innerWidth,
      tops: tabs.map((el) => Math.round(el.getBoundingClientRect().top)),
      heights: tabs.map((el) => el.getBoundingClientRect().height),
      clipped: tabs.map((el) => el.scrollWidth - el.clientWidth),
      sectionTabs: document.querySelectorAll('[data-section-tabs]').length,
      segmentPills: segment.className.includes('rounded-full') || tabs.some((el) => el.className.includes('rounded-full')),
      labels: tabs.map((el) => el.textContent?.trim()),
    }
  })
  assert.ok(metrics, 'segment missing')
  assert.equal(new Set(metrics.tops).size, 1, JSON.stringify(metrics))
  assert.ok(metrics.height >= 44 && metrics.height <= 56, JSON.stringify(metrics))
  assert.ok(metrics.heights.every((height) => height >= 44), JSON.stringify(metrics))
  assert.ok(metrics.clipped.every((overflow) => overflow <= 1), JSON.stringify(metrics))
  assert.equal(metrics.sectionTabs, 1)
  assert.equal(metrics.segmentPills, false)
  assert.ok(metrics.left >= -1 && metrics.right <= metrics.innerWidth + 1, JSON.stringify(metrics))
  assert.deepEqual(metrics.labels, ['Opportunities', 'Firms', 'Board roles'])
}

