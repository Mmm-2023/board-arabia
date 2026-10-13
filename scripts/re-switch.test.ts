import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createServer } from 'vite'

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
      const buttons = [...segment.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].map((match) => ({
        attrs: match[1] ?? '',
        name: match[2] ?? '',
      }))
      assert.deepEqual(
        buttons.map((button) => button.name),
        ['Opportunities', 'Firms', 'Board roles'],
        entry.href,
      )
      const selectedNames = buttons
        .filter((button) => /aria-selected="true"/.test(button.attrs))
        .map((button) => button.name)
      assert.deepEqual(selectedNames, [entry.label], entry.href)
      for (const button of buttons) {
        assert.match(button.attrs, /aria-selected="(?:true|false)"/, button.name)
        assert.equal(/aria-pressed=/.test(button.attrs), false, button.name)
        assert.match(button.attrs, /min-h-11/, button.name)
      }
    }
  } finally {
    await vite.close()
  }
})
