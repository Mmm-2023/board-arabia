import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { MANDATE_SENSITIVE_KEYS } from '../src/lib/mandateRedaction.ts'
import {
  LANDING_PREVIEW_EXAMPLES,
  presentLandingDeal,
  presentLandingDealList,
  previewIntro,
} from '../src/lib/landingPreview.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20260929143000_landing_preview_and_floors.sql'),
  'utf8',
)

const SECRETS = [
  'Nahla Industrial Holding',
  'Waha Care Clinics',
  'Qitaf Hospitality Group',
  'Darin Freight Works',
  'Jabal Minerals',
  'Samn Food Mills',
  'SAR 68.5 million',
  'Layla Al-Nadira',
]

function previewSql() {
  const start = migration.indexOf('-- landing_preview_deals')
  const end = migration.indexOf('-- end_landing_preview_deals')
  assert.ok(start >= 0 && end > start)
  return migration.slice(start, end)
}

test('landing examples are three clear W1 cards', () => {
  assert.equal(LANDING_PREVIEW_EXAMPLES.length, 3)
  assert.deepEqual(
    LANDING_PREVIEW_EXAMPLES.map((deal) => deal.sector),
    ['Energy transition', 'Health', 'Tourism'],
  )
  assert.deepEqual(
    LANDING_PREVIEW_EXAMPLES.map((deal) => deal.status),
    ['Diligence', 'Sourcing', 'Closing'],
  )
  for (const deal of LANDING_PREVIEW_EXAMPLES) {
    assert.equal(deal.is_demo, true)
    assert.equal(deal.ask.includes('@'), false)
    assert.equal(/https?:/i.test(deal.ask), false)
    const encoded = JSON.stringify(deal)
    for (const secret of SECRETS) assert.equal(encoded.includes(secret), false, secret)
    for (const key of MANDATE_SENSITIVE_KEYS) assert.equal(encoded.includes(key), false, key)
  }
  const intro = previewIntro(LANDING_PREVIEW_EXAMPLES)
  assert.match(intro, /marked Example/)
  assert.equal(intro.toLowerCase().includes('no mandates'), false)
  assert.equal(intro.includes('\u2014'), false)
  assert.match(previewIntro([]), /no member names/)
  assert.equal(previewIntro([]).toLowerCase().includes('no mandates'), false)
  const real = previewIntro([{ ...LANDING_PREVIEW_EXAMPLES[0], is_demo: false }])
  assert.equal(real.includes('Example'), false)
  assert.match(real, /sector, an ask, and a status/)
})

test('client drops sensitive mandate fields and keeps at most three cards', () => {
  const poisoned = {
    id: 'a2000001-0000-4000-8000-000000000001',
    is_demo: true,
    sector: 'Energy transition',
    ask: 'Growth capital for a Saudi industrial services platform.',
    status: 'Diligence',
    company_name: 'Nahla Industrial Holding',
    exact_amount: 'SAR 68.5 million',
    terms: 'One board seat and pro-rata on the next round.',
    contact_name: 'Hidden contact',
    contact_email: 'hidden-contact',
    contact_phone: 'hidden-phone',
    deck_url: 'hidden-deck',
    narrative: 'Nahla Industrial Holding stays locked.',
    ticket_band: '$10-25m',
    deal_type: 'Growth equity',
  }
  const card = presentLandingDeal(poisoned)
  assert.ok(card)
  const encoded = JSON.stringify(card)
  assert.deepEqual(Object.keys(card).sort(), ['ask', 'id', 'is_demo', 'sector', 'status'])
  for (const secret of SECRETS) assert.equal(encoded.includes(secret), false, secret)
  assert.equal(encoded.includes('$10-25m'), false)
  assert.equal(encoded.includes('pro-rata'), false)
  assert.equal(presentLandingDeal({ ...poisoned, ask: 'Write via an at sign @' }), null)
  assert.equal(presentLandingDeal({ ...poisoned, ask: 'See the http: brief' }), null)
  const many = presentLandingDealList([
    poisoned,
    { ...poisoned, id: 'b', sector: 'Health', ask: 'A second clear ask.', status: 'Sourcing' },
    { ...poisoned, id: 'c', sector: 'Tourism', ask: 'A third clear ask.', status: 'Closing' },
    { ...poisoned, id: 'd', sector: 'Logistics', ask: 'A fourth clear ask.', status: 'Open' },
  ])
  assert.equal(many.length, 3)
  assert.equal(JSON.stringify(many).includes('Nahla'), false)
  assert.equal(JSON.stringify(many).includes('fourth'), false)
})

test('landing preview SQL reuses the mandates threshold and omits sensitive columns', () => {
  const body = previewSql()
  for (const key of MANDATE_SENSITIVE_KEYS) {
    assert.equal(body.includes(key), false, key)
  }
  for (const secret of SECRETS) assert.equal(body.includes(secret), false, secret)
  assert.match(body, /private\.demo_rows_visible\('mandates', real_n\)/)
  assert.match(body, /is_demo = false/)
  assert.match(body, /limit 3/)
  assert.match(body, /'ask', picked\.one_liner/)
  assert.match(body, /'status', picked\.stage/)
  assert.match(body, /'is_demo', picked\.is_demo/)
  assert.doesNotMatch(body, /ticket_band|deal_type|geography/)
  assert.match(migration, /grant execute on function public\.list_landing_preview_deals\(\) to anon, authenticated/)
  assert.doesNotMatch(migration, /grant\s+select[\s\S]{0,80}public\.mandates/i)
  assert.equal(body.includes('\u2014'), false)
})

test('preview copy and frame do not carry sensitive fields', async () => {
  const files = [
    'src/lib/landingPreview.ts',
    'src/components/DashboardPreview.tsx',
    'src/components/DashboardPreviewFrame.tsx',
    'src/pages/ForMembersPage.tsx',
  ]
  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8')
    assert.equal(source.toLowerCase().includes('no mandates'), false, file)
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(source.includes('\u2013'), false, file)
    for (const secret of SECRETS) assert.equal(source.includes(secret), false, `${file} ${secret}`)
    for (const key of MANDATE_SENSITIVE_KEYS) {
      assert.equal(source.includes(key), false, `${file} ${key}`)
    }
  }

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = await vite.ssrLoadModule('/src/components/DashboardPreviewFrame.tsx')
    const html = renderToStaticMarkup(
      createElement(view.DashboardPreviewFrame, { deals: LANDING_PREVIEW_EXAMPLES }),
    )
    assert.match(html, /Dashboard, as a preview/)
    assert.match(html, /Preview · no live data/)
    assert.match(html, /marked Example/)
    assert.match(html, /Energy transition/)
    assert.match(html, /Growth capital for a Saudi industrial services platform/)
    assert.match(html, /Diligence/)
    assert.match(html, /Health/)
    assert.match(html, /Tourism/)
    assert.match(html, /aria-current="true"/)
    assert.match(html, />Deals</)
    assert.match(html, /Home, People, Majlis, and AI tools open after admission/)
    assert.equal(html.includes('Mandate inbox'), false)
    assert.equal(html.includes('Availability'), false)
    assert.equal(html.includes('Introductions'), false)
    assert.equal(html.includes('>Directory<'), false)
    assert.equal((html.match(/Example/g) || []).length >= 3, true)
    assert.equal(html.toLowerCase().includes('no mandates'), false)
    assert.equal(html.includes('labels only'), false)
    assert.equal(html.includes('\u2014'), false)
    for (const secret of SECRETS) assert.equal(html.includes(secret), false, secret)

    const realHtml = renderToStaticMarkup(
      createElement(view.DashboardPreviewFrame, {
        deals: LANDING_PREVIEW_EXAMPLES.map((deal) => ({ ...deal, is_demo: false })),
      }),
    )
    assert.equal(realHtml.includes('Example'), false)
    assert.match(realHtml, /Preview · no live data/)
    assert.match(realHtml, /sector, an ask, and a status/)
  } finally {
    await vite.close()
  }
})
