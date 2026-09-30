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
  RE_ASSET_CLASS_LABEL,
  RE_CAPITAL_ROLES,
  RE_CAPITAL_ROLE_LABEL,
  RE_CITIES,
  RE_READINESS_STATUS,
  presentReOpportunity,
  reAssetClassLabel,
  reCapitalRoleLabel,
} from '../src/lib/reRedaction.ts'
import { filterReOpportunities, readinessLines, reFeedIsForming, RE_READINESS_NOTE, RE_READINESS_STATUS_LABEL } from '../src/lib/reOpportunityView.ts'
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
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'ready',
    title_clarity: 'ready',
    white_land_exposure: 'ready',
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

test('readiness labels cover every status and skip secrets', () => {
  for (const status of RE_READINESS_STATUS) {
    const lines = readinessLines({
      foreign_ownership_path: status,
      escrow_off_plan: status,
      title_clarity: status,
      white_land_exposure: status,
    })
    assert.equal(lines.length, 4)
    assert.equal(lines.join(' ').includes('\u2014'), false)
    assert.equal(lines.every((line) => line.includes(RE_READINESS_STATUS_LABEL[status])), true)
  }
  const dropped = presentReOpportunity(raw({ foreign_ownership_path: SECRET }))
  assert.ok(dropped)
  const lines = readinessLines(dropped).join(' ')
  assert.equal(lines.includes(SECRET), false)
  assert.equal(lines.includes(MAIL), false)
  assert.match(lines, /Foreign ownership path: Not yet/)
  assert.equal(RE_READINESS_NOTE.includes('\u2014'), false)
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
  assert.match(board, /Partners/)
  assert.match(board, /Opportunities/)
  assert.equal(app.includes('path="real-estate/partners"'), false)
  assert.match(admin, /ReIntroQueue/)
  assert.match(queue, /staff_list_re_opportunity_intros/)
  assert.match(queue, /staff_decide_re_opportunity_intro/)
  assert.match(app, /path="real-estate"/)
  assert.match(prerender, /dashboard\/real-estate/)
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
    assert.match(html, />Residential</)
    assert.match(html, />Equity</)
    assert.match(html, /\$10-25m/)
    assert.match(html, /Foreign ownership path/)
    assert.match(html, /Escrow \/ off-plan registration/)
    assert.match(html, /Title clarity/)
    assert.match(html, /White Land exposure/)
    assert.match(html, /data-re-readiness="clear"/)
    assert.match(html, /Readiness is an indicative checklist, not legal advice/)
    assert.match(html, /data-re-forming="true"/)
    assert.match(html, /role="tab"/)
    assert.equal((html.match(/role="tab"/g) || []).length, 2)
    assert.match(html, />Opportunities</)
    assert.match(html, /Asset class/)
    assert.match(html, /Industrial and logistics/)
    assert.equal(html.includes('industrial/logistics'), false)
    assert.match(html, /Eastern Province/)
    assert.match(html, /Ha&#x27;il|Ha'il/)
    assert.equal(html.includes('>ROSHN<'), false)
    assert.equal(html.includes('>NEOM<'), false)
    assert.match(html, /Sukuk or REIT/)
    assert.equal(html.includes('sukuk/REIT'), false)
    assert.match(html, /aria-label="Region"/)
    assert.match(html, /aria-label="Capital role"/)
    const blurAt = html.indexOf('re-locked-copy')
    const readinessAt = html.indexOf('data-re-readiness')
    assert.ok(readinessAt >= 0 && readinessAt < blurAt)
    const blurred = html.slice(blurAt, blurAt + 400)
    assert.match(blurred, /Counterparty name/)
    assert.equal(blurred.includes(SECRET), false)
    assert.equal(blurred.includes('Foreign ownership path'), false)
    assert.equal(blurred.includes('data-re-readiness'), false)

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
    assert.match(clear, /data-re-readiness="clear"/)
    assert.match(clear, /Readiness is an indicative checklist, not legal advice/)
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

test('asset class and capital role labels are display only', () => {
  assert.deepEqual(RE_ASSET_CLASSES, [
    'residential',
    'hospitality',
    'office',
    'retail',
    'industrial/logistics',
    'mixed-use',
    'land bank',
    'student housing',
    'healthcare RE',
  ])
  assert.deepEqual(RE_CAPITAL_ROLES, [
    'equity',
    'mezzanine',
    'sukuk/REIT',
    'JV partner',
    'land contribution',
    'offtake',
    'operator',
  ])
  assert.equal(reAssetClassLabel('industrial/logistics'), 'Industrial and logistics')
  assert.equal(reAssetClassLabel('mixed-use'), 'Mixed use')
  assert.equal(reAssetClassLabel('healthcare RE'), 'Healthcare real estate')
  assert.equal(reCapitalRoleLabel('sukuk/REIT'), 'Sukuk or REIT')
  assert.equal(reCapitalRoleLabel('land contribution'), 'Land contribution')
  for (const value of RE_ASSET_CLASSES) {
    const label = RE_ASSET_CLASS_LABEL[value]
    assert.equal(label.includes('/'), false, value)
    assert.equal(label.includes('-'), false, value)
    assert.equal(label[0], label[0]?.toUpperCase(), value)
  }
  for (const value of RE_CAPITAL_ROLES) {
    const label = RE_CAPITAL_ROLE_LABEL[value]
    assert.equal(label.includes('/'), false, value)
    assert.equal(label[0], label[0]?.toUpperCase(), value)
  }
  const logistics = presentReOpportunity(
    raw({
      id: 'b1000001-0000-4000-8000-000000000008',
      asset_class: 'industrial/logistics',
      capital_role: 'sukuk/REIT',
    }),
  )
  assert.equal(logistics?.asset_class, 'industrial/logistics')
  assert.equal(logistics?.capital_role, 'sukuk/REIT')
  assert.equal(
    filterReOpportunities(logistics ? [logistics] : [], {
      assetClass: 'industrial/logistics',
      city: null,
      capitalRole: 'sukuk/REIT',
    }).length,
    1,
  )
})
