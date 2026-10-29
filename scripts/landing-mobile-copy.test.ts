import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { LANDING_TILES } from '../src/content/landingFeatures.ts'
import { HOSTING_ENCRYPTION_LINE } from '../src/content/trust.ts'
import { LEGACY_CLOSING_BODY } from '../src/content/twoTierCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const HERO_LEAD =
  'Reviewed membership for Chairperson, Board members and C-suite executives, in Saudi Arabia and internationally.'
const WHY_LEAD = 'A reviewed membership linking Saudi boardrooms with international counterparts.'
const FOUNDING_LEAD =
  'One hundred complimentary founding places: fifty in Saudi Arabia and the GCC, fifty international.'
const MEMBERSHIP_LEAD = 'What admitted members use, after sign-in.'
const PROCESS_LEAD = 'Every application, mandate intro and real estate intro passes admin review.'

let landingServer: Awaited<ReturnType<typeof createServer>> | null = null

async function renderLanding() {
  if (!landingServer) {
    landingServer = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      logLevel: 'error',
    })
  }
  const mod = await landingServer.ssrLoadModule('/src/pages/LandingPage.tsx')
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(mod.LandingPage)),
  )
}

function anchors(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: /href="([^"]*)"/.exec(match[1])?.[1] || '',
    text: match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }))
}

test('home public CTAs keep one destination on desktop and mobile', async () => {
  const html = await renderLanding()
  const links = anchors(html)
  function hrefs(label: string) {
    return links.filter((link) => link.text === label).map((link) => link.href)
  }

  assert.deepEqual([...new Set(hrefs('Apply for consideration'))], ['/apply/'])
  assert.deepEqual(hrefs('See all member tools'), ['/for-members/'])
  assert.deepEqual(hrefs('Full sequence'), ['/how-it-works/'])
  assert.deepEqual([...new Set(hrefs('How we protect your data'))], ['/security/'])
  assert.deepEqual([...new Set(hrefs('Log in'))], ['/login'])
  assert.equal(hrefs('How it works').includes('#process'), true)
  assert.equal(hrefs('How it works').includes('/how-it-works/'), true)
  assert.equal(hrefs('For members').includes('/for-members/'), true)
  assert.equal(hrefs('For capital').includes('/for-capital/'), true)
  assert.equal(hrefs('About').includes('/about/'), true)
  assert.equal(hrefs('Partners').includes('/partners/'), true)
  assert.equal(hrefs('Privacy').includes('/privacy/'), true)
  assert.equal(hrefs('Trust and privacy').includes('/security/'), true)
  assert.equal(hrefs('Terms').includes('/terms/'), true)

  const order = ['id="top"', 'id="why"', 'id="founding"', 'id="membership"', 'id="process"', 'id="faq"', 'id="closing"']
  let cursor = -1
  for (const id of order) {
    const at = html.indexOf(id)
    assert.equal(at > cursor, true, id)
    cursor = at
  }
  assert.equal(html.includes('id="partners"'), false)
})

test('home copy matches the mobile review and drops the overclaim', async () => {
  const html = await renderLanding()
  const landing = read('src/pages/LandingPage.tsx')
  const graphics = read('src/components/landing/graphics.tsx')
  const steps = read('src/components/landing/StepDiagram.tsx')
  for (const line of [HERO_LEAD, WHY_LEAD, FOUNDING_LEAD, MEMBERSHIP_LEAD, PROCESS_LEAD, LEGACY_CLOSING_BODY]) {
    assert.equal(html.includes(line), true, line)
  }
  assert.equal(LANDING_TILES.length, 5)
  for (const tile of LANDING_TILES) {
    assert.equal(html.includes(tile.title), true, tile.title)
    assert.equal(html.includes(tile.body), true, tile.body)
  }
  assert.match(html, /Admin-reviewed capital briefs\. No cold outreach\./)
  assert.match(html, /Peers admitted on one standard: credentials first\./)
  assert.match(html, /Warm introductions, deal rooms and Majlis gatherings\./)
  assert.match(html, /Saudi Arabia and the GCC/)
  assert.equal(html.includes('Held for:'), false)
  const hero = html.slice(html.indexOf('id="top"'), html.indexOf('id="why"'))
  assert.equal(hero.includes('No public booking calendar'), false)
  assert.equal((html.match(/No public booking calendar/g) || []).length, 0)
  assert.equal(html.includes('No public booking calendar is offered.'), false)
  assert.equal(html.includes('not priced'), false)
  assert.equal(html.includes('How FDI and family offices engage'), false)
  assert.equal(html.includes('All your data is secure and fully encrypted'), false)
  assert.equal(html.includes(HOSTING_ENCRYPTION_LINE), false)
  assert.equal(landing.includes('\u2014') || graphics.includes('\u2014') || steps.includes('\u2014'), false)
  assert.equal(landing.includes('\u2013') || graphics.includes('\u2013') || steps.includes('\u2013'), false)
  assert.equal(/\bsponsor/i.test(html), false)
  assert.equal((html.match(/nammco/gi) || []).length, 1)
  assert.match(html, /powered by nammco/)
  assert.match(landing, /id="why" className="bg-pearl py-8 md:py-10"/)
  assert.match(landing, /id="membership" className="bg-pearl py-8 md:py-10"/)
  assert.match(landing, /text-\[0\.9375rem\] leading-\[1\.45\]/)
  assert.match(read('src/components/CtaBand.tsx'), /min-h-11 min-w-11/)
  assert.match(graphics, /fontSize="20"/)
  assert.equal(steps.includes('firstSentence'), false)
  assert.match(read('src/index.css'), /\.ba-frame-deals p \{[\s\S]*font-size: 0\.9375rem;[\s\S]*line-height: 1\.45;/)
  assert.match(read('src/index.css'), /\.ba-g1 \{[\s\S]*aspect-ratio: 440 \/ 180;/)
})

test('home route / keeps Founding 100 and drops the booking sentence', async () => {
  const app = read('src/App.tsx')
  const homeLine = app.split('\n').find((line) => line.includes('path="/"'))
  assert.equal(homeLine?.trim(), '<Route path="/" element={<LandingPage />} />')
  const html = await renderLanding()
  const process = html.slice(html.indexOf('id="process"'), html.indexOf('id="faq"'))
  assert.match(process, /How it works/)
  assert.match(process, /Consideration before any conversation\./)
  assert.match(process, /Every application, mandate intro and real estate intro passes admin review\./)
  assert.equal(process.includes('No public booking calendar'), false)
  assert.equal(html.includes('No public booking calendar is offered.'), false)
  const founding = html.slice(html.indexOf('id="founding"'), html.indexOf('id="membership"'))
  assert.match(founding, /Founding 100/)
  assert.match(founding, /Fifty and fifty\./)
  assert.match(
    founding,
    /One hundred complimentary founding places: fifty in Saudi Arabia and the GCC, fifty international\./,
  )
  const order = ['id="top"', 'id="why"', 'id="founding"', 'id="membership"', 'id="process"', 'id="faq"', 'id="closing"']
  let cursor = -1
  for (const id of order) {
    const at = html.indexOf(id)
    assert.equal(at > cursor, true, id)
    cursor = at
  }
  const prerender = read('scripts/prerender.mjs')
  assert.equal(prerender.includes('No public booking calendar'), false)
  assert.equal(prerender.includes('home missing answer-first blurb'), false)
  const hits = walkFiles(path.join(root, 'src')).filter((file) =>
    read(path.relative(root, file)).includes('No public booking calendar'),
  )
  assert.deepEqual(hits, [])
})

function walkFiles(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) found.push(...walkFiles(full))
    else found.push(full)
  }
  return found
}

test.after(async () => {
  if (landingServer) await landingServer.close()
})
