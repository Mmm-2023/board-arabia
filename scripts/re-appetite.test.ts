import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  parseReAppetite,
  parseReAppetiteStaffList,
  reAppetiteFieldErrors,
  reAppetiteFits,
  reAppetiteFromDraft,
  reAppetiteLine,
  type ReAppetite,
} from '../src/lib/reAppetite.ts'
import { parseReIntros } from '../src/lib/reIntroQueue.ts'
import { filterReOpportunities } from '../src/lib/reOpportunityView.ts'
import { presentReOpportunity } from '../src/lib/reRedaction.ts'
import { MEMBER_VIEWS, STAFF_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const appetite: ReAppetite = {
  ticket_band: '$10-25m',
  cities: ['Riyadh', 'NEOM'],
  asset_classes: ['residential', 'hospitality'],
  capital_roles: ['equity', 'JV partner'],
}

function card(overrides: Record<string, unknown> = {}) {
  return presentReOpportunity({
    id: 'b1000001-0000-4000-8000-000000000001',
    is_demo: true,
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
    ...overrides,
  })
}

test('appetite fit needs ticket, place, asset class, and capital role together', () => {
  const riyadh = card()
  assert.ok(riyadh)
  assert.equal(reAppetiteFits(riyadh, appetite), true)
  assert.equal(reAppetiteFits(riyadh, { ...appetite, ticket_band: '$25-50m' }), false)
  assert.equal(reAppetiteFits(riyadh, { ...appetite, asset_classes: ['office'] }), false)
  assert.equal(reAppetiteFits(riyadh, { ...appetite, capital_roles: ['operator'] }), false)
  assert.equal(reAppetiteFits(riyadh, { ...appetite, cities: ['Makkah'] }), false)

  const neom = card({
    id: 'b1000001-0000-4000-8000-000000000004',
    city: 'NEOM',
    asset_class: 'residential',
    capital_role: 'equity',
    one_liner: 'Equity beside a northern corridor.',
  })
  const tabuk = card({ city: 'Tabuk', one_liner: 'Equity in Tabuk.' })
  const diriyah = card({ city: 'Diriyah', one_liner: 'Equity at Diriyah.' })
  assert.ok(neom && tabuk && diriyah)
  assert.equal(reAppetiteFits(neom, appetite), true)
  assert.equal(reAppetiteFits(neom, { ...appetite, cities: ['NEOM'] }), true)
  assert.equal(reAppetiteFits(tabuk, { ...appetite, cities: ['NEOM'] }), false)
  assert.equal(reAppetiteFits(neom, { ...appetite, cities: ['Tabuk'] }), true)
  assert.equal(reAppetiteFits(diriyah, { ...appetite, cities: ['Riyadh'] }), true)
  assert.equal(reAppetiteFits(riyadh, { ...appetite, cities: ['Diriyah'] }), false)

  const rows = [riyadh, neom].filter((item) => item != null)
  assert.equal(filterReOpportunities(rows, { assetClass: null, city: null, capitalRole: null, fitsAppetite: true }, appetite).length, 2)
  assert.equal(
    filterReOpportunities(rows, { assetClass: 'hospitality', city: null, capitalRole: null, fitsAppetite: true }, appetite).length,
    0,
  )
  assert.equal(filterReOpportunities(rows, { assetClass: null, city: null, capitalRole: null }, appetite).length, 2)
})

test('parsers keep the existing tags and drop contact fields', () => {
  const parsed = parseReAppetite({
    ticket_band: '$10-25m',
    cities: ['NEOM', 'Riyadh'],
    asset_classes: ['residential'],
    capital_roles: ['equity', 'mezzanine'],
    email: 'person@example.com',
    phone: '500',
  })
  assert.deepEqual(parsed, {
    ticket_band: '$10-25m',
    cities: ['NEOM', 'Riyadh'],
    asset_classes: ['residential'],
    capital_roles: ['equity', 'mezzanine'],
  })
  assert.equal(parseReAppetite({ ...appetite, cities: ['Not a city'] }), null)
  assert.equal(parseReAppetite({ ...appetite, asset_classes: [] }), null)
  const staff = parseReAppetiteStaffList([
    {
      member_id: 'm1',
      member_name: 'Layla N.',
      email: 'layla@example.com',
      phone: '500',
      ...appetite,
    },
    { member_id: 'm2', member_name: 'No Tags' },
  ])
  assert.equal(staff.length, 1)
  assert.equal(staff[0]?.member_name, 'Layla N.')
  assert.equal(JSON.stringify(staff).includes('example.com'), false)
  assert.equal(JSON.stringify(staff).includes('email'), false)
  assert.equal(reAppetiteLine(appetite).includes('\u2014'), false)
  assert.match(reAppetiteLine(appetite), /\$10-25m\. Riyadh, NEOM\. Residential, Hospitality\. Equity, JV partner/)

  const saved = reAppetiteFromDraft({
    ticket_band: '$10-25m',
    cities: ['NEOM', 'Riyadh'],
    asset_classes: ['hospitality', 'residential'],
    capital_roles: ['JV partner', 'equity'],
  })
  assert.deepEqual(saved?.cities, ['Riyadh', 'NEOM'])
  assert.deepEqual(saved?.asset_classes, ['residential', 'hospitality'])
  const errors = reAppetiteFieldErrors(
    { ticket_band: null, cities: [], asset_classes: [], capital_roles: [] },
    MEMBER_VIEWS.realEstate.appetite,
  )
  assert.equal(errors?.ticket, 'Choose a ticket band.')
  assert.equal(errors?.places, 'Choose at least one region or corridor.')
  assert.equal(reAppetiteFieldErrors(appetite, MEMBER_VIEWS.realEstate.appetite), null)

  const intros = parseReIntros([
    {
      id: 'i1',
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: 'residential',
      counterparty_name: 'Nahla House Works',
      member_name: 'Layla N.',
      contact_email: 'layla@example.com',
      appetite,
    },
    {
      id: 'i2',
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: 'residential',
      counterparty_name: 'Qitaf Shore Operator',
      member_name: 'Huda S.',
      appetite: null,
    },
  ])
  assert.equal(intros[0]?.appetite?.ticket_band, '$10-25m')
  assert.equal(intros[1]?.appetite, null)
  assert.equal(JSON.stringify(intros).includes('example.com'), false)
  assert.equal('appetite' in (parseReIntros([{ id: 'i3', counterparty_name: 'Desk' }])[0] ?? {}), false)
})

test('migration locks appetite to the member and lets staff read names only', () => {
  const sql = source('supabase/migrations/20261122120000_re_appetite.sql')
  assert.match(sql, /create table if not exists public\.re_appetite/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /member_id = auth\.uid\(\) or private\.is_staff\(\)/)
  assert.match(sql, /m\.seat in \('ksa', 'intl'\)/)
  assert.match(sql, /grant select, insert, update on table public\.re_appetite to authenticated/)
  assert.equal(/grant select, insert, update on table public\.re_appetite to anon/.test(sql), false)
  assert.equal(/grant execute on function public\.get_my_re_appetite\(\) to anon/.test(sql), false)
  assert.equal(/grant execute on function public\.staff_list_re_appetites\(\) to anon/.test(sql), false)
  assert.match(sql, /if not private\.is_staff\(\)/)
  assert.match(sql, /raise exception 'invalid_appetite'/)
  assert.match(sql, /raise exception 'not_allowed'/)
  assert.match(sql, /'industrial\/logistics'/)
  assert.match(sql, /'NEOM'/)
  assert.match(sql, /'Eastern Province'/)
  assert.match(sql, /Ha''il/)
  assert.match(sql, /'mezzanine'/)
  assert.match(sql, /'JV partner'/)
  const staff = sql.slice(sql.indexOf('function public.staff_list_re_appetites'))
  assert.equal(/email|phone|linkedin/i.test(staff), false)
  assert.match(staff, /full_name/)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(/[\u0600-\u06FF]/.test(sql), false)
  assert.equal(/@/.test(sql), false)
})

test('member and staff surfaces reuse the RPCs and stay in English', async () => {
  const page = source('src/pages/dashboard/RealEstatePage.tsx')
  const fetch = source('src/lib/demoFetch.ts')
  const board = source('src/pages/dashboard/RealEstateBoard.tsx')
  const opportunityCard = source('src/pages/dashboard/OpportunityCard.tsx')
  const admin = source('src/pages/admin/AdminHome.tsx')
  const panel = source('src/pages/admin/ReAppetitePanel.tsx')
  const queue = source('src/pages/admin/ReIntroQueue.tsx')
  assert.match(page, /fetchMyReAppetite/)
  assert.match(page, /saveMyReAppetite/)
  assert.equal(page.includes('.from('), false)
  assert.equal(board.includes('.from('), false)
  assert.match(fetch, /get_my_re_appetite/)
  assert.match(fetch, /save_my_re_appetite/)
  assert.match(panel, /staff_list_re_appetites/)
  assert.match(admin, /ReAppetitePanel/)
  assert.match(board, /ReAppetiteCard/)
  assert.match(opportunityCard, /data-re-fit/)
  assert.equal(JSON.stringify(MEMBER_VIEWS.realEstate).includes('\u2014'), false)
  assert.equal(JSON.stringify(STAFF_VIEWS.reAppetite).includes('\u2014'), false)
  assert.equal(/[\u0600-\u06FF]/.test([page, fetch, board, opportunityCard, admin, panel, queue].join('\n')), false)
  for (const file of [page, fetch, board, opportunityCard, admin, panel, queue]) {
    assert.equal(file.includes('\u2014'), false, file)
    assert.equal(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(file), false, file)
  }

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/RealEstateBoard.tsx')
    const staff = await vite.ssrLoadModule('/src/pages/admin/ReAppetiteStaffView.tsx')
    const locked = card()
    assert.ok(locked)
    const empty = renderToStaticMarkup(
      createElement(view.RealEstateBoard, {
        status: 'ready',
        cards: [locked],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
        appetiteStatus: 'ready',
        appetite: null,
        onRetryAppetite: () => {},
        onSaveAppetite: async () => 'ok',
      }),
    )
    assert.match(empty, /data-re-appetite="empty"/)
    assert.match(empty, /Set appetite/)
    assert.match(empty, /No appetite yet/)
    assert.equal(empty.includes('data-re-fit'), false)
    assert.equal(empty.includes('Fits your appetite'), false)

    const filled = renderToStaticMarkup(
      createElement(view.RealEstateBoard, {
        status: 'ready',
        cards: [locked],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
        appetiteStatus: 'ready',
        appetite,
        onRetryAppetite: () => {},
        onSaveAppetite: async () => 'ok',
      }),
    )
    assert.match(filled, /data-re-appetite="filled"/)
    assert.match(filled, /Edit appetite/)
    assert.match(filled, /data-re-fit="true"/)
    assert.match(filled, /Fits your appetite/)
    assert.match(filled, /Riyadh, NEOM/)
    assert.equal(filled.includes('Nahla'), false)

    const desk = renderToStaticMarkup(
      createElement(staff.ReAppetiteStaffView, {
        status: 'ready',
        rows: [{ member_id: 'm1', member_name: 'Layla N.', appetite }],
        onRetry: () => {},
      }),
    )
    assert.match(desk, /Member RE appetite/)
    assert.match(desk, /Layla N\./)
    assert.match(desk, /\$10-25m/)
    assert.equal(desk.includes('@'), false)
  } finally {
    await vite.close()
  }
})
