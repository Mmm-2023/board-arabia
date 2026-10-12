import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { orderDirectoryCards } from '../src/lib/directoryOrder.ts'
import { formatListDate } from '../src/lib/recentReports.ts'
import { liveToolLinks, OFF_TOOL_LEAD } from '../src/lib/aiToolUi.ts'
import { AI_TOOL_FLAG_DEFAULTS, type AiToolKey } from '../supabase/functions/_shared/ai_tools.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function accessibleText(html: string): string {
  let index = 0
  let out = ''
  while (index < html.length) {
    if (html[index] !== '<') {
      const next = html.indexOf('<', index)
      out += html.slice(index, next < 0 ? html.length : next)
      index = next < 0 ? html.length : next
      continue
    }
    const end = html.indexOf('>', index)
    const tag = html.slice(index, end + 1)
    const name = (tag.match(/^<\/?([a-zA-Z0-9]+)/) || [])[1] || ''
    const hidden = !tag.startsWith('</') && /aria-hidden="true"/.test(tag) && !tag.endsWith('/>')
    if (!hidden) {
      index = end + 1
      continue
    }
    let depth = 1
    index = end + 1
    while (depth > 0 && index < html.length) {
      const next = html.indexOf('<', index)
      if (next < 0) break
      const closeEnd = html.indexOf('>', next)
      const inner = html.slice(next, closeEnd + 1)
      const innerName = (inner.match(/^<\/?([a-zA-Z0-9]+)/) || [])[1] || ''
      if (!inner.startsWith('</') && !inner.endsWith('/>') && innerName === name) depth += 1
      if (inner.startsWith('</') && innerName === name) depth -= 1
      index = closeEnd + 1
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

test('directory order puts you first, admitted next, invited last, and keeps samples after', () => {
  const cards = [
    { id: 'sample-a', is_demo: true, membership_status: null },
    { id: 'invited-a', is_demo: false, membership_status: 'invited' as const },
    { id: 'self', is_demo: false, membership_status: 'active' as const },
    { id: 'admitted-b', is_demo: false, membership_status: 'active' as const },
    { id: 'sample-b', is_demo: true, membership_status: null },
    { id: 'invited-b', is_demo: false, membership_status: 'invited' as const },
  ]
  assert.deepEqual(
    orderDirectoryCards(cards, 'self').map((card) => card.id),
    ['self', 'admitted-b', 'invited-a', 'invited-b', 'sample-a', 'sample-b'],
  )
  assert.deepEqual(
    orderDirectoryCards(cards, null).map((card) => card.id),
    ['self', 'admitted-b', 'invited-a', 'invited-b', 'sample-a', 'sample-b'],
  )
  const board = read('src/pages/dashboard/DirectoryBoard.tsx')
  assert.match(board, /orderDirectoryCards\(cards, selfId\)/)
  assert.match(board, /Email and phone stay private/)
})

test('recent report dates use 6 Oct 2026 and off-tool links follow live flags only', () => {
  assert.equal(formatListDate('2026-10-06T00:30:00.000Z'), '6 Oct 2026')
  assert.equal(formatListDate('not-a-date'), '')
  const flags = { ...AI_TOOL_FLAG_DEFAULTS, cfo_check: true, deal_readiness: true }
  const links = liveToolLinks(flags, 'term_sheet_review')
  assert.deepEqual(
    links.map((link) => link.name),
    ['CFO check', 'Deal readiness memo'],
  )
  assert.deepEqual(
    links.map((link) => link.to),
    ['/dashboard/ai/cfo-check', '/dashboard/ai/deal-readiness'],
  )
  const onlyCfo = liveToolLinks({ ...AI_TOOL_FLAG_DEFAULTS, cfo_check: true }, 'market_brief')
  assert.deepEqual(onlyCfo.map((link) => link.key), ['cfo_check'])
  const none = liveToolLinks(AI_TOOL_FLAG_DEFAULTS, 'cfo_check')
  assert.deepEqual(none, [])
  const currentOn = liveToolLinks({ ...flags, term_sheet_review: true }, 'term_sheet_review')
  assert.equal(currentOn.some((link) => link.key === 'term_sheet_review'), false)
  assert.equal(OFF_TOOL_LEAD, 'This tool is not open yet.')
  const ui = read('src/lib/aiToolUi.ts')
  assert.equal(ui.includes('This check is not available.'), false)
  assert.equal(/openai|anthropic|gemini|claude/i.test(ui), false)
  for (const key of Object.keys(AI_TOOL_FLAG_DEFAULTS) as AiToolKey[]) {
    if (!flags[key]) assert.equal(links.some((link) => link.key === key), false)
  }
})

test('public copy keeps one booking phrase, invite email, and the scale pair', () => {
  const landing = read('src/pages/LandingPage.tsx')
  const footer = read('src/components/Footer.tsx')
  const seo = read('src/content/seo.ts')
  const apply = read('src/pages/ApplyPage.tsx')
  assert.equal((landing.match(/No public booking calendar/g) || []).length, 1)
  assert.equal(footer.includes('No public calendar'), false)
  assert.equal(seo.includes('private next-step email'), false)
  assert.equal(seo.includes('Private next step by email'), false)
  assert.match(seo, /private invite email/)
  assert.match(apply, /Turnover \(one of these is required\)/)
  assert.match(apply, /Family-office size \(one of these is required\)/)
  assert.match(apply, /<fieldset>/)
  assert.match(apply, /aria-describedby=\{describedBy\}/)
  assert.match(apply, /Provide turnover or family-office AUM \/ size\./)
  assert.equal(landing.includes('\u2014') || footer.includes('\u2014') || apply.includes('\u2014'), false)
  assert.equal(landing.includes('\u2013') || seo.includes('\u2013'), false)
})

test('register fax trap stays hidden and the server check remains', () => {
  const screen = read('src/pages/apply/RegisterScreen.tsx')
  assert.match(screen, /aria-hidden="true"/)
  assert.match(screen, /tabIndex=\{-1\}/)
  assert.match(screen, /autoComplete="off"/)
  assert.match(screen, /companyFax/)
  const flow = read('supabase/functions/_shared/candidate_flow.ts')
  assert.match(flow, /company_fax/)
  assert.match(flow, /trim\(\)/)
})

test('create room says who can see it and the radio row is a 44 px target', () => {
  const form = read('src/pages/dashboard/CreateRoomForm.tsx')
  assert.match(form, /Only people you invite, and admin, can see this room\./)
  assert.match(form, /min-h-11 items-center/)
  assert.match(form, /className="h-5 w-5 shrink-0"/)
  assert.equal(form.includes('the desk'), false)
})

test('member grids widen at xl and phone cards expose a More control', () => {
  for (const file of [
    'src/pages/dashboard/MandatesBoard.tsx',
    'src/pages/dashboard/DirectoryBoard.tsx',
    'src/pages/dashboard/RoomsBoard.tsx',
    'src/pages/dashboard/MemberRoomsList.tsx',
  ]) {
    assert.match(read(file), /xl:grid-cols-2/, file)
  }
  assert.match(read('src/pages/dashboard/MandatesPage.tsx'), /xl:max-w-6xl/)
  assert.match(read('src/pages/dashboard/DealRoomsView.tsx'), /xl:max-w-6xl/)
  assert.match(read('src/pages/dashboard/DirectoryBoard.tsx'), /aria-expanded=\{open\}/)
  assert.match(read('src/pages/dashboard/DirectoryBoard.tsx'), /'More'/)
  assert.match(read('src/pages/dashboard/OpportunityCard.tsx'), /aria-expanded=\{open\}/)
  assert.match(read('src/pages/dashboard/OpportunityCard.tsx'), /'More'/)
  assert.match(read('src/pages/dashboard/ReadinessStrip.tsx'), /collapsed/)
  const dd = read('src/pages/dashboard/DueDiligencePage.tsx')
  assert.ok(dd.indexOf('siteLabel') < dd.indexOf('type="submit"'))
  assert.match(dd, /AiReportOperatorLine/)
  const home = read('src/pages/dashboard/AiToolsHome.tsx')
  assert.match(home, /Report actions/)
  assert.match(home, /Delete this report\?/)
})

test('admin checkbox rows stay 44 px with a 20 px box', () => {
  for (const file of [
    'src/pages/admin/PeoplePage.tsx',
    'src/pages/admin/SponsorPackagesPanel.tsx',
    'src/pages/admin/RePartnersEditor.tsx',
    'src/pages/admin/MembershipDesk.tsx',
  ]) {
    const source = read(file)
    assert.match(source, /min-h-11/, file)
    assert.match(source, /size-5 shrink-0/, file)
  }
})

test('place lines speak Riyadh, Residential and Tabuk, Red Sea', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const place = await vite.ssrLoadModule('/src/components/RePlace.tsx')
    const meta = await vite.ssrLoadModule('/src/components/CardMeta.tsx')
    const tabuk = renderToStaticMarkup(createElement(place.RePlace, { city: 'Red Sea' }))
    const riyadh = renderToStaticMarkup(
      createElement(meta.PlaceMeta, { city: 'Riyadh', trailing: ['Residential'] }),
    )
    assert.equal(accessibleText(tabuk), 'Tabuk, Red Sea')
    assert.equal(accessibleText(riyadh), 'Riyadh, Residential')
    assert.equal(tabuk.includes('TabukRed Sea'), false)
  } finally {
    await vite.close()
  }
})
