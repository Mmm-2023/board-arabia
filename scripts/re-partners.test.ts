import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { handleReIntro } from '../supabase/functions/request-re-intro/handle.ts'
import {
  partnerMoveOrders,
  partnerSaveArgs,
  parseRePartnerIntros,
  rePartnerFeedIsForming,
  rePartnerGroups,
  type RePartnerDraft,
} from '../src/lib/rePartnerView.ts'
import {
  RE_PARTNER_SENSITIVE_KEYS,
  presentRePartner,
  rePartnerSecretsVisible,
  sensitiveKeysIn,
} from '../src/lib/reRedaction.ts'
import { MEMBER_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261003120000_re_trusted_partners.sql'
const migration = readFileSync(path.join(migrationsDir, migrationName), 'utf8')
const MAIL = 'desk@example.com'
const PHONE = 'Desk extension 5201'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function slice(sourceText: string, start: string, end: string) {
  const from = sourceText.indexOf(start)
  const to = sourceText.indexOf(end)
  assert.ok(from >= 0, start)
  assert.ok(to > from, end)
  return sourceText.slice(from, to)
}

function partner(extra: Record<string, unknown> = {}) {
  return {
    id: 'b2000001-0000-4000-8000-000000000001',
    is_demo: true,
    category_slug: 'real_estate',
    name: 'Wahat Title Counsel',
    kind: 'law',
    city: 'Riyadh',
    blurb: 'Counsel on title questions for a private property brief.',
    unlocked: false,
    access: 'locked',
    intro_status: null,
    sponsor_tied: false,
    contact_name: 'Layla W.',
    contact_email: MAIL,
    contact_phone: PHONE,
    website: 'https://example.com/desk',
    ...extra,
  }
}

test('the partners migration sorts last and does not open the table', () => {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  assert.equal(files.at(-1), migrationName)
  assert.ok(migrationName > '20261002120000')
  assert.ok(migrationName > '20261001120000_re_regulatory_readiness.sql')
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/https?:\/\//i.test(migration), false)
  assert.equal(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(migration), false)
  assert.equal(/eyJ|sk_live|service_role|BEGIN PRIVATE KEY/i.test(migration), false)
  assert.equal(/\+\d{8,}|05\d{8}/.test(migration), false)
  assert.equal(/create policy/i.test(migration), false)
  assert.equal(/grant\s+select/i.test(migration), false)
  assert.equal(/disable row level security/i.test(migration), false)
  assert.equal(/to anon/.test(migration), false)
  for (const table of ['re_partners', 're_partner_intros']) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
  }
  assert.match(migration, /alter table public\.re_partner_intros force row level security/)
  assert.match(migration, /constraint re_partners_city check/)
  assert.match(migration, /'real_estate'/)
  assert.match(migration, /sponsor_category_seats/)
  assert.equal(/create table if not exists public\.re_partners\b/.test(migration), false)
})

test('anon and members cannot read partner rows, and the member RPC has no contact fields', () => {
  const locked = slice(migration, '-- locked_re_partner_json_v2', '-- end_locked_re_partner_json_v2')
  const feed = slice(migration, '-- member_partner_feed_v2_begin', '-- member_partner_feed_v2_end')
  const request = migration.slice(
    migration.indexOf('function public.request_re_partner_intro'),
    migration.indexOf('revoke all on function public.request_re_partner_intro'),
  )
  for (const key of [...RE_PARTNER_SENSITIVE_KEYS, 'website']) {
    assert.equal(locked.includes(key), false, key)
    assert.equal(feed.includes(key), false, key)
    assert.equal(request.includes(key), false, key)
  }
  assert.match(locked, /'unlocked', false/)
  assert.match(locked, /'access', 'locked'/)
  assert.match(locked, /'city', p_city/)
  assert.match(locked, /'sponsor_tied', p_sponsor_tied/)
  assert.match(feed, /security definer/)
  assert.match(feed, /set search_path = public/)
  assert.match(feed, /re_partner_locked_json/)
  assert.equal(feed.includes('re_partner_inventory_json'), false)
  assert.match(feed, /m\.seat in \('ksa', 'intl'\)/)
  assert.match(feed, /private\.demo_rows_visible\('re_partners', real_n\)/)
  assert.match(feed, /t\.is_demo = false/)
  assert.match(feed, /left join public\.re_partner_intros i/)
  assert.match(request, /security definer/)
  assert.match(request, /set search_path = public/)
  assert.match(request, /m\.seat in \('ksa', 'intl'\)/)
  assert.match(request, /return jsonb_build_object\('status', current_status\)/)
  assert.equal(request.includes("seat = 'sponsor'"), false)
  assert.match(migration, /grant execute on function public\.request_re_partner_intro\(uuid\) to authenticated/)
  assert.equal(/grant execute on function public\.request_re_partner_intro\([^;]*\) to anon/.test(migration), false)
})

test('staff partner writes refuse non-staff and lock demo rows', () => {
  const save = slice(migration, '-- staff_save_partner_v2_begin', '-- staff_save_partner_v2_end')
  const decide = migration.slice(migration.indexOf('function public.staff_decide_re_partner_intro'))
  const list = migration.slice(
    migration.indexOf('function public.staff_list_re_partner_intros'),
    migration.indexOf('function public.staff_decide_re_partner_intro'),
  )
  const staffAt = save.indexOf('if not private.is_staff()')
  const insertAt = save.indexOf('insert into public.re_partners')
  assert.ok(staffAt >= 0 && insertAt > staffAt)
  assert.match(save, /security definer/)
  assert.match(save, /set search_path = public/)
  assert.match(save, /raise exception 'demo_locked'/)
  assert.match(save, /where public\.re_partners\.is_demo = false/)
  assert.match(save, /'real_estate'/)
  assert.match(decide, /if not private\.is_staff\(\)/)
  assert.ok(decide.indexOf('if not private.is_staff()') < decide.indexOf('update public.re_partner_intros'))
  assert.match(decide, /and status = 'pending'/)
  assert.match(list, /if not private\.is_staff\(\)/)
  for (const key of RE_PARTNER_SENSITIVE_KEYS) {
    assert.equal(list.includes(key), false, key)
  }
  assert.match(migration, /revoke all on function public\.staff_save_re_partner\(/)
  assert.match(migration, /grant execute on function public\.staff_list_re_partner_intros\(\) to authenticated/)
  assert.match(migration, /Lina Court Works/)
  assert.match(migration, /Hadi Family Desk/)
  for (const banned of ['Knight Frank', 'CBRE', 'JLL', 'Savills', 'Colliers', 'Emaar', 'Dar Al Arkan']) {
    assert.equal(migration.toLowerCase().includes(banned.toLowerCase()), false, banned)
  }
})

test('the member presenter drops contacts even after an approved intro', () => {
  const card = presentRePartner(partner())
  assert.ok(card)
  assert.equal(card?.unlocked, false)
  assert.equal(card?.access, 'locked')
  assert.equal(rePartnerSecretsVisible(partner()), false)
  assert.equal(sensitiveKeysIn(card, RE_PARTNER_SENSITIVE_KEYS).length, 0)
  const encoded = JSON.stringify(card)
  assert.equal(encoded.includes(MAIL), false)
  assert.equal(encoded.includes('5201'), false)
  assert.equal(encoded.includes('example.com'), false)
  assert.equal(encoded.includes('website'), false)
  assert.match(encoded, /Wahat Title Counsel/)
  assert.match(encoded, /Riyadh/)

  const approved = presentRePartner(partner({ unlocked: true, access: 'intro', intro_status: 'approved', sponsor_tied: true }))
  assert.equal(approved?.unlocked, false)
  assert.equal(approved?.access, 'locked')
  if (approved && approved.access === 'locked') {
    assert.equal(approved.intro_status, 'approved')
    assert.equal(approved.sponsor_tied, false)
  }
  assert.equal(JSON.stringify(approved).includes(MAIL), false)

  const tied = presentRePartner(partner({ is_demo: false, sponsor_tied: true }))
  assert.equal(tied?.sponsor_tied, true)

  const inventory = presentRePartner(partner({ is_demo: false, unlocked: true, access: 'inventory', published: false, sort_order: 4 }))
  assert.equal(inventory?.access, 'inventory')
  if (inventory?.access === 'inventory') {
    assert.equal(inventory.contact_email, MAIL)
    assert.equal(inventory.published, false)
    assert.equal(inventory.sort_order, 4)
  }
  assert.equal(presentRePartner(partner({ blurb: `Notes for ${MAIL}` })), null)
  assert.equal(rePartnerFeedIsForming([card!]), true)
  assert.equal(rePartnerGroups([card!])[0]?.label, 'Law')
  assert.equal(JSON.stringify(MEMBER_VIEWS.realEstate).includes('\u2014'), false)
  assert.match(MEMBER_VIEWS.realEstate.partnersForming, /still forming/)
  assert.match(MEMBER_VIEWS.realEstate.partnersEmpty, /No partners yet/)
})

test('partner save args and reorder stay on the real estate category fields', () => {
  const draft: RePartnerDraft = {
    id: null,
    published: false,
    name: 'Safa Court Works',
    kind: 'developer',
    city: 'Qiddiya',
    blurb: 'A developer desk for a private property brief.',
    contact_name: 'Safa C.',
    contact_email: MAIL,
    contact_phone: PHONE,
    sort_order: 6,
  }
  const args = partnerSaveArgs(draft)
  assert.equal(args?.p_city, 'Qiddiya')
  assert.equal(args?.p_kind, 'developer')
  assert.equal(args?.p_published, false)
  assert.equal(partnerSaveArgs({ ...draft, blurb: `Reach ${MAIL}` }), null)
  assert.equal(partnerSaveArgs({ ...draft, kind: '' }), null)
  const plans = partnerMoveOrders(
    [
      { id: 'a', is_demo: true, sort_order: 1 },
      { id: 'b', is_demo: false, sort_order: 2 },
      { id: 'c', is_demo: false, sort_order: 3 },
    ],
    'c',
    -1,
  )
  assert.deepEqual(plans, [
    { id: 'c', sort_order: 1 },
    { id: 'b', sort_order: 2 },
  ])
  const rows = parseRePartnerIntros([
    { id: 'i1', name: 'Safa Court Works', kind: 'developer', city: 'Qiddiya', member_name: 'Member', contact_email: MAIL },
    { id: '', name: 'Dropped' },
  ])
  assert.equal(rows.length, 1)
  assert.equal(JSON.stringify(rows).includes(MAIL), false)
})

test('member partner markup has no contacts, and a tied firm shows the sponsor mark', async () => {
  const page = source('src/pages/dashboard/RealEstatePage.tsx')
  const fetch = source('src/lib/demoFetch.ts')
  const client = source('src/lib/supabase.ts')
  const edge = source('supabase/functions/request-re-intro/index.ts')
  const panel = source('src/pages/admin/RePartnersPanel.tsx')
  const admin = source('src/pages/admin/AdminHome.tsx')
  assert.match(page, /fetchRePartners/)
  assert.match(page, /requestRePartnerIntro/)
  assert.equal(page.includes('.from('), false)
  assert.equal(page.includes('request-re-intro'), false)
  assert.equal(fetch.includes('request_re_partner_intro'), false)
  assert.match(client, /partner_id: partnerId/)
  assert.match(edge, /request_re_partner_intro/)
  assert.match(edge, /select\('name, kind, city'\)/)
  assert.equal(edge.includes('contact_email'), false)
  assert.equal(edge.includes('contact_phone'), false)
  assert.match(panel, /staff_save_re_partner/)
  assert.equal(panel.includes('.from('), false)
  assert.match(admin, /RePartnersPanel/)
  assert.match(admin, /RePartnerIntroQueue/)
  for (const rel of [
    'src/pages/dashboard/RealEstatePartners.tsx',
    'src/pages/admin/RePartnersEditor.tsx',
    'src/lib/rePartnerView.ts',
  ]) {
    assert.equal(source(rel).includes('\u2014'), false, rel)
  }

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/RealEstateBoard.tsx')
    const editor = await vite.ssrLoadModule('/src/pages/admin/RePartnersEditor.tsx')
    const demo = presentRePartner(partner())
    const tied = presentRePartner(partner({
      id: 'b2000001-0000-4000-8000-000000000009',
      is_demo: false,
      name: 'Safa Court Works',
      kind: 'developer',
      city: 'Qiddiya',
      blurb: 'A developer desk for a private property brief.',
      sponsor_tied: true,
      intro_status: 'pending',
    }))
    assert.ok(demo && tied && demo.access === 'locked' && tied.access === 'locked')
    const html = renderToStaticMarkup(
      createElement(view.RealEstateBoard, {
        status: 'ready',
        cards: [],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
        tab: 'partners',
        partnersStatus: 'ready',
        partners: [demo, tied],
        onRequestPartner: () => {},
      }),
    )
    assert.match(html, /data-re-panel="partners"/)
    assert.match(html, /Wahat Title Counsel/)
    assert.match(html, /Safa Court Works/)
    assert.match(html, /FO-grade brokers|Law/)
    assert.match(html, /data-re-partner-forming="true"/)
    assert.match(html, /data-seat-badge="sponsor"/)
    assert.match(html, /Intro requested/)
    assert.equal(html.includes(MAIL), false)
    assert.equal(html.includes('5201'), false)
    assert.equal(html.includes('example.com'), false)
    assert.equal((html.match(/>Request intro</g) || []).length, 1)

    const live = presentRePartner(partner({
      is_demo: false,
      unlocked: true,
      access: 'inventory',
      published: true,
      sort_order: 2,
      sponsor_tied: true,
    }))
    const lockedDemo = presentRePartner(partner())
    assert.ok(live && lockedDemo && live.access === 'inventory')
    const staff = renderToStaticMarkup(
      createElement(editor.RePartnersEditor, {
        status: 'ready',
        cards: [live, lockedDemo],
        busyId: null,
        notice: null,
        alert: null,
        onRetry: () => {},
        onSave: () => {},
        onMove: () => {},
      }),
    )
    assert.match(staff, /data-re-partner-edit="true"/)
    assert.match(staff, /Save partner/)
    assert.match(staff, /Move up/)
    assert.match(staff, /Example firms stay as seeded/)
    assert.match(staff, new RegExp(MAIL.replace('.', '\\.')))
    assert.equal((staff.match(new RegExp(MAIL.replace('.', '\\.'), 'g')) || []).length, 1)
  } finally {
    await vite.close()
  }
})

test('a partner intro response does not echo the firm contact', async () => {
  const secret = 'Hidden Firm Desk'
  const response = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
    }),
    {
      open: async () => ({
        userId: '11111111-1111-4111-8111-111111111111',
        rpc: async () => ({ data: { status: 'pending' }, error: null }),
        context: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing',
        }),
        partnerRpc: async () => ({ data: { status: 'pending' }, error: null }),
        partnerContext: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: secret,
        }),
      }),
    },
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.status, 'pending')
  assert.equal(JSON.stringify(body).includes(secret), false)
  assert.equal(JSON.stringify(body).includes(MAIL), false)

  const denied = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
    }),
    {
      open: async () => ({
        userId: '11111111-1111-4111-8111-111111111111',
        rpc: async () => ({ data: null, error: null }),
        context: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing',
        }),
        partnerRpc: async () => ({ data: null, error: { message: 'not_allowed' } }),
        partnerContext: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: secret,
        }),
      }),
    },
  )
  assert.equal(denied.status, 403)
})
