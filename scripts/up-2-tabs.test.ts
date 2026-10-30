import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { MEMBER_SECTIONS } from '../src/shell/destinations.ts'
import { resolveChromePath } from './chrome-path.ts'

const root = new URL('..', import.meta.url)

function read(rel: string) {
  return readFileSync(new URL(rel, root), 'utf8')
}

const changed = [
  'src/shell/dealsTabLabels.ts',
  'src/shell/SectionTabs.tsx',
  'src/pages/dashboard/DealsLayout.tsx',
  'src/pages/dashboard/AiToolsLayout.tsx',
  'src/pages/dashboard/MajlisLayout.tsx',
  'src/pages/dashboard/MajlisViewSwitch.tsx',
  'src/pages/dashboard/majlisCalendarQuery.ts',
  'src/pages/dashboard/MajlisPage.tsx',
  'src/pages/dashboard/RealEstateBoard.tsx',
  'src/pages/dashboard/AiToolsHome.tsx',
  'src/pages/dashboard/account/AccountRoutes.tsx',
]

test('deals routes and destination labels stay locked', () => {
  const destinations = read('src/shell/destinations.ts')
  assert.match(destinations, /label: 'Mandates', to: '\/dashboard\/deals\/mandates'/)
  assert.match(destinations, /label: 'Real estate', to: '\/dashboard\/deals\/real-estate'/)
  assert.match(destinations, /label: 'Board seats', to: '\/dashboard\/deals\/board-seats'/)
  assert.match(destinations, /label: 'Deal rooms', to: '\/dashboard\/deals\/rooms'/)
  assert.deepEqual(
    MEMBER_SECTIONS.deals?.map((item) => [item.id, item.label, item.to]),
    [
      ['mandates', 'Mandates', '/dashboard/deals/mandates'],
      ['real-estate', 'Real estate', '/dashboard/deals/real-estate'],
      ['board-seats', 'Board seats', '/dashboard/deals/board-seats'],
      ['deal-rooms', 'Deal rooms', '/dashboard/deals/rooms'],
    ],
  )
  assert.deepEqual(
    MEMBER_SECTIONS.ai?.map((item) => [item.label, item.to]),
    [
      ['Tools', '/dashboard/ai'],
      ['Due diligence', '/dashboard/ai/due-diligence'],
    ],
  )
  const app = read('src/App.tsx')
  assert.match(app, /path="deals" element=\{<DealsLayout/)
  assert.match(app, /path="real-estate" element=\{<RealEstatePage/)
  assert.match(app, /path="ai" element=\{<AiToolsLayout/)
  assert.match(app, /path="majlis" element=\{<MajlisLayout/)
  assert.match(app, /path="past" element=\{<MajlisPage/)
  assert.equal(read('src/pages/dashboard/AiToolsLayout.tsx').includes('SectionTabs'), false)
  assert.equal(read('src/pages/dashboard/account/AccountRoutes.tsx').includes('AI tools sections'), false)
})

test('changed tab files keep English copy rules', () => {
  for (const file of changed) {
    const source = read(file)
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(source.includes('\u2013'), false, file)
    assert.equal(/\b(nammco|the desk)\b/i.test(source), false, file)
  }
  for (const file of [
    'src/shell/dealsTabLabels.ts',
    'src/shell/SectionTabs.tsx',
    'src/pages/dashboard/MajlisViewSwitch.tsx',
    'src/pages/dashboard/majlisCalendarQuery.ts',
    'src/pages/dashboard/AiToolsLayout.tsx',
    'src/pages/dashboard/MajlisLayout.tsx',
  ]) {
    assert.equal(/\bsponsor/i.test(read(file)), false, file)
  }
})

test('deals tabs use short labels and AI tools drops the extra row', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const layout = await vite.ssrLoadModule('/src/pages/dashboard/DealsLayout.tsx')
    const ai = await vite.ssrLoadModule('/src/pages/dashboard/AiToolsLayout.tsx')
    const deals = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/deals/mandates'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/dashboard/deals',
            element: createElement(layout.DealsLayout),
          }, createElement(Route, { path: 'mandates', element: createElement('p', null, 'Mandates page') })),
        ),
      ),
    )
    assert.match(deals, /data-deals-tabs/)
    assert.match(deals, />Mandates</)
    assert.match(deals, />Property</)
    assert.match(deals, />Seats</)
    assert.match(deals, />Rooms</)
    assert.equal(deals.includes('>Real estate<'), false)
    assert.equal(deals.includes('>Board seats<'), false)
    assert.equal(deals.includes('>Deal rooms<'), false)
    assert.match(deals, /href="\/dashboard\/deals\/mandates"/)
    assert.match(deals, /href="\/dashboard\/deals\/real-estate"/)
    assert.match(deals, /href="\/dashboard\/deals\/board-seats"/)
    assert.match(deals, /href="\/dashboard\/deals\/rooms"/)
    assert.match(deals, /min-h-11/)
    const tools = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/ai'] },
        createElement(ai.AiToolsLayout),
      ),
    )
    assert.equal(tools.includes('data-section-tabs'), false)
    assert.equal(tools.includes('>Due diligence<'), false)
    assert.equal(tools.includes('>Tools<'), false)
  } finally {
    await vite.close()
  }
})

test('majlis view switch shares the section row and real estate keeps a header control', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const majlis = await vite.ssrLoadModule('/src/pages/dashboard/MajlisLayout.tsx')
    const estate = await vite.ssrLoadModule('/src/pages/dashboard/RealEstateBoard.tsx')
    const deals = await vite.ssrLoadModule('/src/pages/dashboard/DealsLayout.tsx')
    const upcoming = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/majlis'] },
        createElement(majlis.MajlisLayout),
      ),
    )
    assert.match(upcoming, /data-majlis-nav/)
    assert.match(upcoming, /data-majlis-view/)
    assert.match(upcoming, /aria-label="Majlis sections"/)
    assert.match(upcoming, /aria-label="Upcoming view"/)
    assert.match(upcoming, />Upcoming</)
    assert.match(upcoming, />Past</)
    assert.match(upcoming, />List</)
    assert.match(upcoming, />Calendar</)
    assert.match(upcoming, /min-h-11/)
    const past = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/majlis/past'] },
        createElement(majlis.MajlisLayout),
      ),
    )
    assert.equal(past.includes('data-majlis-view'), false)
    assert.match(past, />Upcoming</)
    assert.match(past, />Past</)
    const board = renderToStaticMarkup(
      createElement(estate.RealEstateBoard, {
        status: 'ready',
        cards: [],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
      }),
    )
    assert.match(board, /data-re-header-control/)
    assert.match(board, /data-re-segment/)
    assert.match(board, />Opportunities</)
    assert.match(board, />Firms</)
    assert.match(board, />Board roles</)
    assert.match(board, /min-h-11/)
    const withDeals = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/deals/real-estate'] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { path: '/dashboard/deals', element: createElement(deals.DealsLayout) },
            createElement(Route, {
              path: 'real-estate',
              element: createElement(estate.RealEstateBoard, {
                status: 'loading',
                cards: [],
                busyId: null,
                requestError: false,
                onRetry: () => {},
                onRequest: () => {},
              }),
            }),
          ),
        ),
      ),
    )
    assert.match(withDeals, /data-deals-tabs/)
    assert.match(withDeals, /data-re-header-control/)
    assert.match(withDeals, />Property</)
    assert.equal((withDeals.match(/data-section-tabs/g) || []).length, 1)
  } finally {
    await vite.close()
  }
})

test('phone and desktop tab rows meet the size floor', { timeout: 120_000 }, async (t) => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    t.skip('The smoke compile does not finish under the parallel suite.')
    return
  }
  const executablePath =
    resolveChromePath() ||
    (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : null)
  if (!executablePath) {
    t.skip('Chrome is not installed.')
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const vite = await createServer({
    configFile: path.join(path.dirname(new URL(import.meta.url).pathname), 'smoke/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const origin = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage()
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto(`${origin}/up-2.html?screen=deals&state=ready`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const deals = await page.evaluate(() => {
        const links = [...document.querySelectorAll('[data-deals-tabs] a')].map((node) => {
          const rect = node.getBoundingClientRect()
          return {
            t: (node.textContent || '').trim(),
            w: rect.width,
            h: rect.height,
            top: rect.top,
            fs: Number.parseFloat(getComputedStyle(node).fontSize),
          }
        })
        return {
          links,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          pack: document.querySelector('[data-deals-tabs]')?.getAttribute('data-tab-pack'),
        }
      })
      assert.deepEqual(
        deals.links.map((link) => link.t),
        ['Mandates', 'Property', 'Seats', 'Rooms'],
        String(width),
      )
      assert.equal(deals.pack, 'row', String(width))
      assert.equal(deals.overflow, false, String(width))
      const top = deals.links[0]?.top ?? 0
      for (const link of deals.links) {
        assert.ok(link.h >= 44 && link.w >= 44, `${width} ${link.t} ${link.w}x${link.h}`)
        assert.ok(link.fs >= 15, `${width} ${link.t} ${link.fs}`)
        assert.ok(Math.abs(link.top - top) < 2, `${width} ${link.t} wrapped`)
      }
      if (width === 390) {
        const tabs = await page.locator('nav[aria-label="Primary"] a').count()
        assert.equal(tabs, 5)
      }
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${origin}/up-2.html?screen=ai&state=ready`, { waitUntil: 'networkidle' })
    const ai = await page.evaluate(() => ({
      tabs: document.querySelectorAll('[data-section-tabs]').length,
      text: document.body.innerText,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }))
    assert.equal(ai.tabs, 0)
    assert.equal(ai.overflow, false)
    assert.match(ai.text, /CFO check/)
    assert.match(ai.text, /Deal readiness memo/)
    assert.match(ai.text, /AI Due Diligence/)
    assert.equal(ai.text.includes('Due diligence'), false)
    await page.goto(`${origin}/up-2.html?screen=majlis&state=ready`, { waitUntil: 'networkidle' })
    const majlis = await page.evaluate(() => {
      const row = document.querySelector('[data-majlis-nav]')
      const items = [...(row?.querySelectorAll('a, button') ?? [])].map((node) => {
        const rect = node.getBoundingClientRect()
        return { t: (node.textContent || '').trim(), top: rect.top, h: rect.height, w: rect.width }
      })
      return { items, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }
    })
    assert.deepEqual(
      majlis.items.map((item) => item.t),
      ['Upcoming', 'Past', 'List', 'Calendar'],
    )
    const majlisTop = majlis.items[0]?.top ?? 0
    for (const item of majlis.items) {
      assert.ok(Math.abs(item.top - majlisTop) < 2, item.t)
      assert.ok(item.h >= 44 && item.w >= 44, `${item.t} ${item.w}x${item.h}`)
    }
    assert.equal(majlis.overflow, false)
    await page.goto(`${origin}/up-2.html?screen=real-estate&state=ready`, { waitUntil: 'networkidle' })
    const estate = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[data-re-header-control] button')].map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          t: (node.textContent || '').trim(),
          h: rect.height,
          w: rect.width,
          fs: Number.parseFloat(getComputedStyle(node).fontSize),
        }
      })
      return {
        buttons,
        tabs: document.querySelectorAll('[data-section-tabs]').length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }
    })
    assert.deepEqual(
      estate.buttons.map((button) => button.t),
      ['Opportunities', 'Firms', 'Board roles'],
    )
    for (const button of estate.buttons) {
      assert.ok(button.h >= 44 && button.w >= 44, button.t)
      assert.ok(button.fs >= 15, `${button.t} ${button.fs}`)
    }
    assert.equal(estate.tabs, 1)
    assert.equal(estate.overflow, false)
  } finally {
    await browser.close()
    await vite.close()
  }
})
