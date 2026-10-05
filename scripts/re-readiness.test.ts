import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { RE_READINESS_STATUS, RE_SENSITIVE_KEYS, presentReOpportunity } from '../src/lib/reRedaction.ts'
import { readinessSaveArgs, RE_READINESS_NOTE } from '../src/lib/reOpportunityView.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261003120000_re_regulatory_readiness.sql'
const migration = readFileSync(path.join(migrationsDir, migrationName), 'utf8')

const SECRET = 'Nahla House Works'
const TERMS = 'Observer seat beside the developer. Structure stays in the Nahla House Works brief.'
const MAIL = 'amal.re@example.com'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function latestPrivate(name: string) {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  let body = ''
  const header = `create or replace function private.${name}`
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8')
    const at = sql.lastIndexOf(header)
    if (at < 0) continue
    const end = sql.indexOf('$$;', at)
    assert.ok(end > at, file)
    body = sql.slice(at, end)
  }
  assert.ok(body, name)
  return body
}

test('the readiness migration stays after deal rooms and keeps redaction on the existing columns', () => {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  assert.ok(files.includes(migrationName))
  assert.ok((files.at(-1) ?? '') > migrationName)
  assert.ok(migrationName > '20261002120000_member_deal_rooms.sql')
  assert.ok(files.includes('20261002120000_member_deal_rooms.sql'))
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/https?:\/\//i.test(migration), false)
  assert.equal(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(migration), false)
  assert.equal(/eyJ|sk_live|service_role|BEGIN PRIVATE KEY/i.test(migration), false)
  assert.equal(/add column/i.test(migration), false)
  assert.equal(/create table/i.test(migration), false)
  assert.equal(/create policy/i.test(migration), false)
  assert.equal(/grant\s+select/i.test(migration), false)
  assert.equal(/disable row level security/i.test(migration), false)
  assert.equal(/create\s+(or\s+replace\s+)?(materialized\s+)?view\b/i.test(migration), false)
  for (const status of RE_READINESS_STATUS) {
    assert.equal(migration.includes(`'${status}'`), true, status)
  }
  assert.match(migration, /when 'designated_zone' then 'ready'/)
  assert.match(migration, /when 'saudi_vehicle' then 'ready'/)
  assert.match(migration, /when 'not_available' then 'not_yet'/)
  assert.match(migration, /when 'in_place' then 'ready'/)
  assert.match(migration, /when 'not_off_plan' then 'not_applicable'/)
  assert.match(migration, /when 'in_review' then 'in_progress'/)
  assert.match(migration, /when 'none' then 'ready'/)
  assert.match(migration, /when 'exposed' then 'not_yet'/)
  assert.match(migration, /foreign_ownership_path = v_foreign/)
  assert.match(migration, /and is_demo = false/)
  assert.match(migration, /demo_locked/)
  const fn = migration.slice(migration.indexOf('function public.staff_set_re_opportunity_readiness'))
  const body = fn.slice(fn.indexOf('as $$'))
  const staffAt = body.indexOf('if not private.is_staff()')
  const updateAt = body.search(/\bupdate\b/i)
  assert.ok(staffAt >= 0 && updateAt > staffAt)
  for (const key of ['counterparty_name', 'terms', 'contact_email', 'contact_phone', 'contact_name', 'narrative']) {
    assert.equal(fn.includes(key), false, key)
  }
  assert.match(fn, /jsonb_build_object\('ok', true, 'id', p_id\)/)
  assert.match(migration, /revoke all on function public\.staff_set_re_opportunity_readiness\(uuid, text, text, text, text\) from public, anon/)
  assert.match(migration, /grant execute on function public\.staff_set_re_opportunity_readiness\(uuid, text, text, text, text\) to authenticated/)
  assert.equal(/grant execute on function public\.staff_set_re_opportunity_readiness\([^;]*\) to anon/.test(migration), false)
})

test('list_re_opportunities still hides counterparty and terms and still exposes readiness', () => {
  const locked = latestPrivate('re_opportunity_locked_json')
  for (const key of RE_SENSITIVE_KEYS) {
    assert.equal(locked.includes(key), false, key)
  }
  for (const key of ['foreign_ownership_path', 'escrow_off_plan', 'title_clarity', 'white_land_exposure']) {
    assert.equal(locked.includes(key), true, key)
  }
  assert.match(locked, /'unlocked', false/)
  assert.match(locked, /'access', 'locked'/)
  assert.equal(locked.includes(SECRET), false)
  assert.equal(locked.includes(MAIL), false)

  const feed = latestPrivate('re_member_opportunity_feed')
  assert.match(feed, /re_opportunity_locked_json/)
  assert.match(feed, /when i\.status = 'approved' then private\.re_opportunity_open_json/)
  const lockedCall = feed.slice(feed.indexOf('else private.re_opportunity_locked_json'), feed.indexOf('end as payload'))
  for (const key of RE_SENSITIVE_KEYS) {
    assert.equal(lockedCall.includes(key), false, key)
  }
  assert.match(lockedCall, /o\.foreign_ownership_path/)
  assert.match(lockedCall, /o\.white_land_exposure/)
})

test('readiness save args stay on the four statuses', () => {
  const args = readinessSaveArgs('c1000001-0000-4000-8000-000000000009', {
    foreign_ownership_path: 'in_progress',
    escrow_off_plan: 'ready',
    title_clarity: 'not_yet',
    white_land_exposure: 'not_applicable',
  })
  assert.deepEqual(Object.keys(args ?? {}).sort(), [
    'p_escrow_off_plan',
    'p_foreign_ownership_path',
    'p_id',
    'p_title_clarity',
    'p_white_land_exposure',
  ])
  assert.equal(JSON.stringify(args).includes(MAIL), false)
  assert.equal(JSON.stringify(args).includes(SECRET), false)
  assert.equal(readinessSaveArgs('x', {
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'ready',
    title_clarity: 'ready',
    white_land_exposure: 'designated_zone' as 'ready',
  }), null)
})

test('the strip is clear on locked and approved cards, and staff edit statuses without secrets', async () => {
  const panel = source('src/pages/admin/ReReadinessPanel.tsx')
  const admin = source('src/pages/admin/AdminHome.tsx')
  const edge = source('supabase/functions/request-re-intro/index.ts')
  assert.match(panel, /fetchReOpportunities/)
  assert.match(panel, /staff_set_re_opportunity_readiness/)
  assert.equal(panel.includes('.from('), false)
  assert.equal(panel.includes('counterparty_name'), false)
  assert.equal(panel.includes(MAIL), false)
  assert.match(admin, /ReReadinessPanel/)
  assert.equal(edge.includes('staff_set_re_opportunity_readiness'), false)
  for (const file of [panel, admin, source('src/pages/dashboard/ReadinessStrip.tsx'), source('src/pages/admin/ReReadinessEditor.tsx')]) {
    assert.equal(file.includes('\u2014'), false, file)
  }
  assert.equal(RE_READINESS_NOTE, 'Readiness is an indicative checklist, not legal advice.')

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const cardView = await vite.ssrLoadModule('/src/pages/dashboard/OpportunityCard.tsx')
    const editorView = await vite.ssrLoadModule('/src/pages/admin/ReReadinessEditor.tsx')
    const locked = presentReOpportunity({
      id: 'b1000001-0000-4000-8000-000000000003',
      is_demo: true,
      sector: 'Logistics property',
      city: 'Jeddah',
      asset_class: 'industrial/logistics',
      capital_role: 'JV partner',
      ticket_band: '$25-50m',
      one_liner: 'A joint venture for logistics yards serving Jeddah freight.',
      foreign_ownership_path: 'not_yet',
      escrow_off_plan: 'not_yet',
      title_clarity: 'in_progress',
      white_land_exposure: 'ready',
      unlocked: false,
      access: 'locked',
      intro_status: null,
      counterparty_name: SECRET,
      terms: TERMS,
      contact_name: 'Amal N.',
      contact_email: MAIL,
      contact_phone: 'Desk extension 5101',
      narrative: `${SECRET} stays locked.`,
    })
    const open = presentReOpportunity({
      id: 'b1000001-0000-4000-8000-000000000001',
      is_demo: false,
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: 'residential',
      capital_role: 'equity',
      ticket_band: '$10-25m',
      one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
      foreign_ownership_path: 'ready',
      escrow_off_plan: 'not_applicable',
      title_clarity: 'in_progress',
      white_land_exposure: 'not_yet',
      unlocked: true,
      access: 'intro',
      intro_status: 'approved',
      counterparty_name: SECRET,
      terms: TERMS,
      contact_name: 'Amal N.',
      contact_email: MAIL,
      contact_phone: 'Desk extension 5101',
      narrative: 'Intro approved for this member only.',
    })
    assert.ok(locked && open && locked.unlocked === false && open.unlocked === true)
    const lockedHtml = renderToStaticMarkup(createElement(cardView.OpportunityCard, { card: locked, onRequest: () => {} }))
    assert.match(lockedHtml, /data-re-readiness="clear"/)
    assert.match(lockedHtml, /In progress/)
    assert.match(lockedHtml, /Not yet/)
    assert.match(lockedHtml, /White Land exposure/)
    assert.match(lockedHtml, />Clear</)
    assert.match(lockedHtml, /Readiness is an indicative checklist, not legal advice/)
    assert.equal(lockedHtml.includes(SECRET), false)
    assert.equal(lockedHtml.includes(MAIL), false)
    const blurAt = lockedHtml.indexOf('re-locked-copy')
    const stripAt = lockedHtml.indexOf('data-re-readiness')
    assert.ok(stripAt >= 0 && stripAt < blurAt)
    assert.equal(lockedHtml.slice(blurAt).includes('Foreign ownership path'), false)

    const openHtml = renderToStaticMarkup(createElement(cardView.OpportunityCard, { card: open }))
    assert.match(openHtml, /Intro approved for you/)
    assert.match(openHtml, /data-re-status="not_applicable"/)
    assert.match(openHtml, /data-re-status="in_progress"/)
    assert.match(openHtml, new RegExp(SECRET))
    assert.equal(openHtml.includes('re-locked-copy'), false)

    const live = presentReOpportunity({
      id: 'c1000001-0000-4000-8000-000000000009',
      is_demo: false,
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: 'residential',
      capital_role: 'equity',
      ticket_band: '$25-50m',
      one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
      foreign_ownership_path: 'in_progress',
      escrow_off_plan: 'ready',
      title_clarity: 'not_yet',
      white_land_exposure: 'not_applicable',
      unlocked: true,
      access: 'inventory',
      published: true,
      sponsor_member_id: null,
      counterparty_name: SECRET,
      terms: TERMS,
      contact_name: 'Amal N.',
      contact_email: MAIL,
      contact_phone: 'Desk extension 5101',
      narrative: `${SECRET} stays in the staff payload only.`,
    })
    const demo = presentReOpportunity({
      id: 'b1000001-0000-4000-8000-000000000004',
      is_demo: true,
      sector: 'Land',
      city: 'NEOM',
      asset_class: 'land bank',
      capital_role: 'land contribution',
      ticket_band: '$50-100m',
      one_liner: 'Land contributed into a northern land bank beside a giga corridor.',
      foreign_ownership_path: 'not_yet',
      escrow_off_plan: 'not_applicable',
      title_clarity: 'in_progress',
      white_land_exposure: 'not_yet',
      unlocked: true,
      access: 'inventory',
      published: true,
      sponsor_member_id: null,
      counterparty_name: 'Safi North Land Desk',
      terms: 'Land is the contribution.',
      contact_name: 'Nada B.',
      contact_email: 'nada.re@example.com',
      contact_phone: 'Desk extension 5104',
      narrative: 'Seeded example.',
    })
    assert.ok(live && demo && live.access === 'inventory' && demo.access === 'inventory')
    const staffHtml = renderToStaticMarkup(
      createElement(editorView.ReReadinessEditor, {
        status: 'ready',
        cards: [live, demo],
        busyId: null,
        notice: null,
        alert: null,
        onRetry: () => {},
        onSave: () => {},
      }),
    )
    assert.match(staffHtml, /data-re-staff-edit="true"/)
    assert.match(staffHtml, /Save readiness/)
    assert.match(staffHtml, /Foreign ownership path/)
    assert.match(staffHtml, /White Land exposure/)
    assert.match(staffHtml, /Not applicable/)
    assert.match(staffHtml, /Example briefs keep the seeded checklist/)
    assert.equal(staffHtml.includes(MAIL), false)
    assert.equal(staffHtml.includes('nada.re@example.com'), false)
    assert.equal(staffHtml.includes(SECRET), false)
    assert.equal(staffHtml.includes('Safi North Land Desk'), false)
    assert.equal(staffHtml.includes('Desk extension'), false)
    const editAt = staffHtml.indexOf('data-re-staff-edit')
    const demoAt = staffHtml.indexOf('Example briefs keep the seeded checklist')
    assert.ok(editAt >= 0 && demoAt > editAt)
    assert.equal(staffHtml.slice(demoAt).includes('<select'), false)
  } finally {
    await vite.close()
  }
})
