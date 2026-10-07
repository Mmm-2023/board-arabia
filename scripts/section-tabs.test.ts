import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { MEMBER_SECTIONS, STAFF_SECTIONS } from '../src/shell/destinations.ts'
import { nextSectionTabIndex } from '../src/shell/sectionTabKeys.ts'

const root = new URL('..', import.meta.url)

function read(rel: string) {
  return readFileSync(new URL(rel, root), 'utf8')
}

test('sub-tab keyboard moves by arrow, Home, and End', () => {
  assert.equal(nextSectionTabIndex('ArrowRight', 0, 3), 1)
  assert.equal(nextSectionTabIndex('ArrowRight', 2, 3), 0)
  assert.equal(nextSectionTabIndex('ArrowLeft', 0, 3), 2)
  assert.equal(nextSectionTabIndex('ArrowLeft', 1, 3), 0)
  assert.equal(nextSectionTabIndex('Home', 2, 3), 0)
  assert.equal(nextSectionTabIndex('End', 0, 3), 2)
  assert.equal(nextSectionTabIndex('Tab', 0, 3), null)
  assert.equal(nextSectionTabIndex('ArrowRight', -1, 3), null)
  assert.equal(nextSectionTabIndex('Home', 0, 0), null)
})

test('hub sub-tab hrefs stay on the existing routes', () => {
  assert.deepEqual(
    MEMBER_SECTIONS.deals?.map((item) => [item.label, item.to]),
    [
      ['Mandates', '/dashboard/deals/mandates'],
      ['Real estate', '/dashboard/deals/real-estate'],
      ['Deal rooms', '/dashboard/deals/rooms'],
    ],
  )
  assert.deepEqual(
    MEMBER_SECTIONS.people?.map((item) => [item.label, item.to]),
    [
      ['Directory', '/dashboard/people/directory'],
      ['Intros', '/dashboard/people/intros'],
      ['Invites', '/dashboard/people/invites'],
      ['Partners', '/dashboard/people/partners'],
    ],
  )
  assert.deepEqual(
    MEMBER_SECTIONS.ai?.map((item) => [item.label, item.to]),
    [
      ['Tools', '/dashboard/ai'],
      ['Due diligence', '/dashboard/ai/due-diligence'],
    ],
  )
  assert.deepEqual(
    STAFF_SECTIONS.people?.map((item) => [item.label, item.to]),
    [
      ['People', '/admin/people'],
      ['Intros', '/admin/people/intros'],
    ],
  )
})

test('review queue state chips stay off the shared sub-tab', () => {
  const desk = read('src/pages/admin/MembershipDesk.tsx')
  assert.match(desk, /aria-label="Request state"/)
  assert.match(desk, /role="tablist"/)
  assert.equal(desk.includes('SectionTabs'), false)
  assert.equal(desk.includes('data-section-tabs'), false)
})

test('active sub-tab is a link with aria-current and a 44px target', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const mod = await vite.ssrLoadModule('/src/shell/SectionTabs.tsx')
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/deals/mandates'] },
        createElement(mod.SectionTabs, {
          label: 'Deals sections',
          sections: MEMBER_SECTIONS.deals,
        }),
      ),
    )
    assert.match(html, /aria-label="Deals sections"/)
    assert.match(html, /data-section-tabs/)
    assert.equal(html.includes('role="tablist"'), false)
    assert.match(html, /<a aria-current="page"[^>]*href="\/dashboard\/deals\/mandates"/)
    assert.match(html, /href="\/dashboard\/deals\/real-estate"/)
    assert.match(html, /href="\/dashboard\/deals\/rooms"/)
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1)
    assert.match(html, /min-h-11/)
    assert.match(html, /bg-\[var\(--ba-indigo\)\]/)
    assert.match(html, /text-white/)
    assert.match(html, /text-\[var\(--ba-ink\)\]/)
    assert.match(html, /section-tab/)
    assert.match(read('src/index.css'), /\.section-tab:focus-visible\s*\{[^}]*outline:\s*2px solid/)
    assert.match(html, /md:me-8/)
    const source = read('src/shell/SectionTabs.tsx')
    assert.match(source, /onKeyDown/)
    assert.match(source, /nextSectionTabIndex/)
    assert.equal(source.includes('\u2014'), false)
    assert.equal(source.includes('\u2013'), false)
    assert.equal(/\bBasic\b/.test(source), false)
    const one = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/ai/due-diligence'] },
        createElement(mod.SectionTabs, {
          label: 'AI tools sections',
          sections: MEMBER_SECTIONS.ai?.slice(1) ?? [],
        }),
      ),
    )
    assert.equal(one.includes('data-section-tabs'), false)
  } finally {
    await vite.close()
  }
})
