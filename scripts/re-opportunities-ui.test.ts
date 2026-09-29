import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { parseReIntros } from '../src/lib/reIntroQueue.ts'
import {
  RE_ASSET_CLASSES,
  RE_CAPITAL_ROLES,
  RE_CITIES,
  RE_ESCROW,
  RE_FOREIGN_OWNERSHIP,
  RE_TITLE,
  RE_WHITE_LAND,
  presentReOpportunity,
} from '../src/lib/reRedaction.ts'
import { filterReOpportunities, readinessLines, reFeedIsForming } from '../src/lib/reOpportunityView.ts'
import { MEMBER_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

const SECRET = 'Nahla House Works'
const TERMS = 'Observer seat beside the developer. Structure stays in the Nahla House Works brief.'
const MAIL = 'amal.re@example.com'
const PHONE = 'Desk extension 5101'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function raw(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1000001-0000-4000-8000-000000000001',
    is_demo: false,
    sector: 'Housing',
    city: 'Riyadh',
    asset_class: 'residential',
    capital_role: 'equity',
    ticket_band: '$10-25m',
    one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
    foreign_ownership_path: 'designated_zone',
    escrow_off_plan: 'in_place',
    title_clarity: 'clear',
    white_land_exposure: 'none',
    unlocked: false,
    access: 'locked',
    intro_status: null,
    counterparty_name: SECRET,
    terms: TERMS,
    contact_name: 'Amal N.',
    contact_email: MAIL,
    contact_phone: PHONE,
    narrative: `${SECRET} stays locked until an admin approves an intro for this member only.`,
    ...overrides,
  }
}

test('opportunity filters use the three RE-A tag families', () => {
  const riyadh = presentReOpportunity(raw())
  const jeddah = presentReOpportunity(
    raw({
      id: 'b1000001-0000-4000-8000-000000000003',
      city: 'Jeddah',
      asset_class: 'industrial/logistics',
      capital_role: 'JV partner',
      one_liner: 'A joint venture for logistics yards serving Jeddah freight.',
    }),
  )
  assert.ok(riyadh && jeddah)
  const rows = [riyadh, jeddah]
  assert.equal(filterReOpportunities(rows, { assetClass: null, city: 'Riyadh', capitalRole: null }).length, 1)
  assert.equal(
    filterReOpportunities(rows, { assetClass: 'industrial/logistics', city: null, capitalRole: null })[0]?.city,
    'Jeddah',
  )
  assert.equal(filterReOpportunities(rows, { assetClass: null, city: null, capitalRole: 'equity' }).length, 1)
  assert.equal(filterReOpportunities(rows, { assetClass: 'office', city: null, capitalRole: null }).length, 0)
  assert.deepEqual(RE_ASSET_CLASSES.includes('healthcare RE'), true)
  assert.deepEqual(RE_CITIES.includes('ROSHN'), true)
  assert.deepEqual(RE_CAPITAL_ROLES.includes('sukuk/REIT'), true)
})

test('readiness labels cover every RE-A value and skip secrets', () => {
  for (const foreign_ownership_path of RE_FOREIGN_OWNERSHIP) {
    const lines = readinessLines({
      foreign_ownership_path,
      escrow_off_plan: null,
      title_clarity: null,
      white_land_exposure: null,
    })
    assert.equal(lines.length, 1)
    assert.equal(lines[0]?.includes('\u2014'), false)
  }
  for (const escrow_off_plan of RE_ESCROW) {
    assert.equal(
      readinessLines({
        foreign_ownership_path: null,
        escrow_off_plan,
        title_clarity: null,
        white_land_exposure: null,
      }).length,
      1,
    )
  }
  for (const title_clarity of RE_TITLE) {
    assert.equal(
      readinessLines({
        foreign_ownership_path: null,
        escrow_off_plan: null,
        title_clarity,
        white_land_exposure: null,
      }).length,
      1,
    )
  }
  for (const white_land_exposure of RE_WHITE_LAND) {
    assert.equal(
      readinessLines({
        foreign_ownership_path: null,
        escrow_off_plan: null,
        title_clarity: null,
        white_land_exposure,
      }).length,
      1,
    )
  }
  const card = presentReOpportunity(raw())
  assert.ok(card)
  const lines = readinessLines(card).join(' ')
  assert.equal(lines.includes(SECRET), false)
  assert.equal(lines.includes(MAIL), false)
})

test('forming copy follows demo dwell, and the intro queue parser keeps counterparty only', () => {
  const demo = presentReOpportunity(raw({ is_demo: true }))
  const live = presentReOpportunity(raw())
  assert.ok(demo && live)
  assert.equal(reFeedIsForming([demo]), true)
  assert.equal(reFeedIsForming([live]), false)
  assert.equal(reFeedIsForming([live, demo]), true)
  assert.match(MEMBER_VIEWS.realEstate.forming, /still forming/)
  assert.match(MEMBER_VIEWS.realEstate.empty, /No opportunities yet/)
  assert.equal(JSON.stringify(MEMBER_VIEWS.realEstate).includes('\u2014'), false)
  const rows = parseReIntros([
    {
      id: 'i1',
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: 'residential',
      counterparty_name: SECRET,
      member_name: 'Layla N.',
      contact_email: MAIL,
    },
    { id: '', counterparty_name: SECRET },
    { id: 'i2', counterparty_name: '   ' },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.counterparty_name, SECRET)
  assert.equal(rows[0]?.member_name, 'Layla N.')
  assert.equal(JSON.stringify(rows).includes(MAIL), false)
})

test('the opportunities page lists through the RPC and requests through the Edge wrapper', () => {
  const page = source('src/pages/dashboard/RealEstatePage.tsx')
  const fetch = source('src/lib/demoFetch.ts')
  const client = source('src/lib/supabase.ts')
  const board = source('src/pages/dashboard/RealEstateBoard.tsx')
  const admin = source('src/pages/admin/AdminHome.tsx')
  const queue = source('src/pages/admin/ReIntroQueue.tsx')
  const app = source('src/App.tsx')
  const prerender = source('scripts/prerender.mjs')
  assert.match(page, /fetchReOpportunities/)
  assert.match(page, /requestReOpportunityIntro/)
  assert.equal(page.includes('TODO(alert)'), false)
  assert.equal(fetch.includes('TODO(alert)'), false)
  assert.match(fetch, /requestReOpportunityIntro as postReIntro/)
  assert.match(fetch, /return postReIntro\(opportunityId\)/)
  assert.equal(fetch.includes('request_re_opportunity_intro'), false)
  assert.match(fetch, /list_re_opportunities/)
  assert.match(client, /request-re-intro/)
  assert.equal(page.includes('.from('), false)
  assert.equal(board.includes('.from('), false)
  assert.equal(page.includes('request-re-intro'), false)
  assert.equal(/Partners/.test(board), false)
  assert.match(board, /Opportunities/)
  assert.match(admin, /ReIntroQueue/)
  assert.match(queue, /staff_list_re_opportunity_intros/)
  assert.match(queue, /staff_decide_re_opportunity_intro/)
  assert.match(app, /path="real-estate"/)
  assert.match(prerender, /dashboard\/real-estate/)
  assert.equal(app.includes('path="real-estate/partners"'), false)
  for (const file of [page, fetch, board, admin, queue]) {
    assert.equal(file.includes('\u2014'), false, file)
  }
})

test('locked opportunity markup blurs placeholders and keeps secrets out of the DOM', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/RealEstateBoard.tsx')
    const cardView = await vite.ssrLoadModule('/src/pages/dashboard/OpportunityCard.tsx')
    const locked = presentReOpportunity(raw({ is_demo: true }))
    const open = presentReOpportunity(
      raw({
        id: 'b1000001-0000-4000-8000-000000000002',
        unlocked: true,
        access: 'intro',
        intro_status: 'approved',
        one_liner: 'An operator role beside a hospitality asset on the Red Sea.',
        city: 'Red Sea',
        asset_class: 'hospitality',
        capital_role: 'operator',
      }),
    )
    assert.ok(locked && open && locked.unlocked === false && open.unlocked === true)
    const html = renderToStaticMarkup(
      createElement(view.RealEstateBoard, {
        status: 'ready',
        cards: [locked],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
      }),
    )
    assert.equal(html.includes(SECRET), false)
    assert.equal(html.includes(TERMS), false)
    assert.equal(html.includes(MAIL), false)
    assert.equal(html.includes(PHONE), false)
    assert.equal(html.includes('Amal N.'), false)
    assert.match(html, /re-locked-copy/)
    assert.match(html, /Counterparty name/)
    assert.match(html, /Request intro/)
    assert.match(html, /Housing/)
    assert.match(html, /Riyadh/)
    assert.match(html, /residential/)
    assert.match(html, /equity/)
    assert.match(html, /\$10-25m/)
    assert.match(html, /Foreign ownership: designated zone/)
    assert.match(html, /Not legal advice/)
    assert.match(html, /data-re-forming="true"/)
    assert.match(html, /role="tab"/)
    assert.equal((html.match(/role="tab"/g) || []).length, 1)
    assert.match(html, />Opportunities</)
    assert.match(html, /Asset class/)
    assert.match(html, /industrial\/logistics/)
    assert.match(html, /ROSHN/)
    assert.match(html, /sukuk\/REIT/)
    assert.match(html, /aria-label="City"/)
    assert.match(html, /aria-label="Capital role"/)
    const blurAt = html.indexOf('re-locked-copy')
    const blurred = html.slice(blurAt, blurAt + 400)
    assert.match(blurred, /Counterparty name/)
    assert.equal(blurred.includes(SECRET), false)

    const clear = renderToStaticMarkup(
      createElement(view.RealEstateBoard, {
        status: 'ready',
        cards: [open, locked],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
      }),
    )
    assert.match(clear, /Intro approved for you/)
    assert.match(clear, new RegExp(SECRET))
    assert.match(clear, /Observer seat beside the developer/)
    assert.match(clear, new RegExp(MAIL.replace('.', '\\.')))
    assert.equal((clear.match(/>Request intro</g) || []).length, 1)
    assert.match(clear, /data-re-forming="true"/)

    const liveCard = presentReOpportunity(raw())
    assert.ok(liveCard)
    const live = renderToStaticMarkup(
      createElement(view.RealEstateBoard, {
        status: 'ready',
        cards: [liveCard],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
      }),
    )
    assert.equal(live.includes('data-re-forming'), false)
    assert.equal(live.includes(SECRET), false)

    const pending = presentReOpportunity(raw({ intro_status: 'pending' }))
    assert.ok(pending && pending.unlocked === false)
    const waiting = renderToStaticMarkup(
      createElement(cardView.OpportunityCard, { card: pending, onRequest: () => {} }),
    )
    assert.match(waiting, /Intro requested/)
    assert.equal(waiting.includes('Request intro'), false)
  } finally {
    await vite.close()
  }
})
