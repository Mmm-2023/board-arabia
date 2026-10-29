import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  LANDING_AI_SCOPE,
  LANDING_FEATURES,
  LANDING_GROUPS,
  LANDING_LIVE_AI_FLAGS,
  LANDING_NOT_YET,
  LANDING_TILES,
} from '../src/content/landingFeatures.ts'
import { HOSTING_ENCRYPTION_LINE, SIGNING_IN } from '../src/content/trust.ts'
import { isAiToolKey, toolFromSlug, toolPath } from '../supabase/functions/_shared/ai_tools.ts'
import { toolTitle } from '../src/lib/aiToolCopy.ts'
import {
  ACCOUNT_SHEET_LINKS,
  MEMBER_ACCOUNT,
  MEMBER_DESTINATIONS,
  MEMBER_SECTIONS,
} from '../src/shell/destinations.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean)
}

const NOT_YET_FRAGMENTS = [
  'newsletter',
  'trusted partners',
  'three seats a year',
  'vault',
  'documents',
  'market brief',
  'daily brief',
  'seat matching',
  'private messag',
  'message thread',
  'direct message',
  'chat',
  'office hours',
  'spotlight',
  'deal tracker',
  'rules tracker',
  'warm path',
  'path finder',
  'follow-ups',
  'linkedin sign',
  'sign in with linkedin',
  'app store',
  'google play',
  'iphone',
  'android',
  'email notification',
  'term sheet',
  'pricing sense',
  'governance tool',
  'negotiation',
  'quarterly',
  'four salons',
  'founding badge',
  'mandate inbox',
  'peer voucher',
  'each tile opens',
  'opened by our admin team',
]

const ADVICE_ROLE = /\b(adviser|advisor|expert|analyst|consultant|our team will|a person)\b/i

function allowedRoutes() {
  const routes = new Set<string>([
    ...MEMBER_DESTINATIONS.map((item) => item.to),
    ...Object.values(MEMBER_SECTIONS).flatMap((section) => section.map((item) => item.to)),
    ...ACCOUNT_SHEET_LINKS.map((item) => item.to),
    ...MEMBER_ACCOUNT.map((item) => item.to),
    '/dashboard/ai/due-diligence',
    '/security',
    ...LANDING_LIVE_AI_FLAGS.map((flag) => toolPath(flag)),
  ])
  return routes
}

function pathDeclared(app: string, segment: string) {
  return app.includes(`path="${segment}"`) || app.includes(`path="/${segment}"`)
}

test('every advertised feature maps to an existing route or flag', () => {
  const app = read('src/App.tsx')
  const allowed = allowedRoutes()
  assert.equal(new Set(LANDING_FEATURES.map((feature) => feature.id)).size, LANDING_FEATURES.length)

  for (const feature of LANDING_FEATURES) {
    assert.equal(allowed.has(feature.route), true, feature.id)
    const segment = feature.route.split('/').filter(Boolean).pop() || ''
    if (feature.flag) {
      assert.equal(isAiToolKey(feature.flag), true, feature.id)
      assert.equal(LANDING_LIVE_AI_FLAGS.includes(feature.flag), true, feature.id)
      assert.equal(feature.route, toolPath(feature.flag), feature.id)
      assert.equal(toolFromSlug(segment), feature.flag, feature.id)
      assert.equal(feature.title, toolTitle(feature.flag), feature.id)
    } else {
      assert.equal(pathDeclared(app, segment), true, `${feature.id} ${segment}`)
    }
  }

  for (const flag of LANDING_LIVE_AI_FLAGS) {
    const cards = LANDING_FEATURES.filter((feature) => feature.flag === flag)
    assert.equal(cards.length, 1, flag)
  }
})

test('landing does not advertise features that are not live', async () => {
  for (const fragment of NOT_YET_FRAGMENTS) {
    assert.equal(
      LANDING_NOT_YET.some((pattern) => pattern.source.toLowerCase().includes(fragment)),
      true,
      fragment,
    )
  }
  const html = await renderLanding()
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
  for (const pattern of LANDING_NOT_YET) {
    assert.equal(pattern.test(text), false, pattern.source)
  }
  const intros = LANDING_FEATURES.find((feature) => feature.id === 'intros')
  assert.match(intros?.body || '', /No open messaging/)
})

test('landing feature copy locks', async () => {
  const landing = read('src/pages/LandingPage.tsx')
  const features = read('src/content/landingFeatures.ts')
  const html = await renderLanding()
  for (const file of [landing, features]) {
    assert.equal(file.includes('\u2014'), false)
    assert.equal(file.includes('\u2013'), false)
    assert.equal(/the desk/i.test(file), false)
    assert.equal(/backup/i.test(file), false)
    assert.equal(/leaked password/i.test(file), false)
    assert.equal(/calendly|book a call|booking link|wa\.me|mailto:/i.test(file), false)
  }
  assert.equal(html.includes('\u2014'), false)
  assert.equal(html.includes('\u2013'), false)
  assert.equal(/the desk/i.test(html), false)
  assert.equal(/backup/i.test(html), false)
  assert.equal(/leaked password/i.test(html), false)
  assert.equal(/calendly|wa\.me|mailto:/i.test(html), false)
  const membership = html.slice(html.indexOf('id="membership"'), html.indexOf('id="process"'))
  assert.equal(/calendly|book a call|booking link|wa\.me|mailto:/i.test(membership), false)
  assert.equal(/nammco/i.test(landing), false)
  assert.equal(/nammco/i.test(features), false)
  assert.equal((html.match(/nammco/gi) || []).length, 1)
  assert.match(html, /powered by nammco/)
  for (const feature of LANDING_FEATURES) {
    assert.equal(words(feature.body).length <= 20, true, feature.id)
    assert.equal(words(feature.title).length <= 4, true, feature.title)
    assert.equal(/\d/.test(feature.body), false, feature.id)
    assert.equal(ADVICE_ROLE.test(`${feature.title} ${feature.body}`), false, feature.id)
    assert.equal(html.includes(`data-feature="${feature.id}"`), false, feature.id)
  }
  assert.equal(LANDING_TILES.length, 5)
  for (const tile of LANDING_TILES) {
    assert.equal(words(tile.body).length <= 16, true, tile.id)
    assert.match(html, new RegExp(`data-tile="${tile.id}"`))
    assert.match(html, new RegExp(tile.body.replace(/[.]/g, '\\.')))
  }
  for (const group of LANDING_GROUPS) {
    assert.equal(words(group.title).length <= 4, true, group.title)
  }
  const bodies = new Map(LANDING_FEATURES.map((feature) => [feature.id, feature.body]))
  assert.equal(
    bodies.get('board-roles'),
    'Board and non-executive seats on developer and property company boards, for founding members.',
  )
  assert.equal(
    bodies.get('partners'),
    'Request an intro to a real estate partner firm. Admin handles the intro before any outreach.',
  )
  assert.equal(
    bodies.get('suggestions'),
    'Up to two suggested introductions a week, from shared sectors, themes or region.',
  )
})

test('security card bodies match the trust page strings', async () => {
  const byId = new Map(LANDING_FEATURES.map((feature) => [feature.id, feature.body]))
  assert.equal(byId.get('two-step'), SIGNING_IN[2])
  assert.equal(byId.has('secure'), false)
  assert.equal(byId.get('encrypted'), HOSTING_ENCRYPTION_LINE)
  assert.equal(
    HOSTING_ENCRYPTION_LINE,
    'Data is encrypted in transit and at rest by our hosting provider.',
  )
  assert.equal(byId.has('frankfurt'), false)
  const html = await renderLanding()
  assert.equal(html.includes('All your data is secure and fully encrypted'), false)
  assert.equal(html.includes('Secure and encrypted'), false)
  assert.equal(/\bFrankfurt\b|\bGermany\b/.test(html), false)
})

test('AI scope line is exact and each AI card names AI', async () => {
  const ai = LANDING_GROUPS.find((group) => group.id === 'ai')
  assert.equal(ai?.scope, LANDING_AI_SCOPE)
  const html = await renderLanding()
  assert.match(html, /Labelled AI first reads\. Not legal, financial or investment advice\./)
  assert.equal(html.includes(LANDING_AI_SCOPE), false)
  for (const feature of LANDING_FEATURES.filter((item) => item.group === 'ai')) {
    assert.match(feature.body, /AI/)
  }
})

test('landing CTAs and section links stay on their routes', async () => {
  const source = read('src/pages/LandingPage.tsx')
  assert.equal(source.includes('motion/react'), false)
  assert.match(source, /TrustedPartnersSection/)
  assert.equal(source.includes('EXAMPLE_PARTNERS'), false)
  assert.equal(source.includes('Qaf Ledger'), false)
  const app = read('src/App.tsx')
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  const html = await renderLanding()
  const hero = (html.match(/<a\b[^>]*>/g) || []).find((tag) => tag.includes('id="hero-apply"'))
  assert.ok(hero)
  assert.match(hero, /href="\/apply\/"/)
  assert.match(hero, /ba-primary/)
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || []
  const login = anchors.filter((anchor) => anchor.replace(/<[^>]+>/g, '').trim() === 'Log in')
  assert.equal(login.length > 0, true)
  for (const anchor of login) {
    assert.equal(anchor.includes('ba-primary'), false, anchor)
    assert.match(anchor, /ba-login|ba-secondary|ba-textlink|ba-footer-link/)
  }
  assert.match(html, /href="\/for-members\/"[^>]*>See all member tools/)
  const membership = html.slice(html.indexOf('id="membership"'), html.indexOf('id="process"'))
  assert.equal(membership.includes('How FDI and family offices engage'), false)
  assert.match(html, /href="\/how-it-works\/"[^>]*>Full sequence/)
  assert.match(html, /href="\/security\/"[^>]*>How we protect your data/)
  assert.equal(html.includes('id="partners"'), false)
  assert.equal(html.includes('Three seats a year'), false)
  assert.match(html, /Features and tools/)
  assert.match(html, /What admitted members use, after sign-in/)
  assert.equal(html.includes('What admitted members use today'), false)
})

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

test.after(async () => {
  if (landingServer) await landingServer.close()
})
