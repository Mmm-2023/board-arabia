import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { handleReIntro } from '../supabase/functions/request-re-intro/handle.ts'
import {
  RE_BOARD_ROLE_SENSITIVE_KEYS,
  parseReBoardRoleIntros,
  presentReBoardRole,
  reBoardRoleFeedIsForming,
  reBoardRoleSecretsVisible,
} from '../src/lib/reBoardRoles.ts'
import { sensitiveKeysIn } from '../src/lib/reRedaction.ts'
import { MEMBER_VIEWS, STAFF_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261123120000_re_board_roles.sql'
const migration = readFileSync(path.join(migrationsDir, migrationName), 'utf8')
const ORG = 'Safa Court Developer'
const MAIL = 'lina.role@example.com'
const PHONE = 'Desk extension 6101'
const ROLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

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

function role(extra: Record<string, unknown> = {}) {
  return {
    id: 'b3000001-0000-4000-8000-000000000001',
    is_demo: true,
    seat_kind: 'developer',
    title: 'Independent director',
    sector: 'Housing',
    capacity: 'One independent seat. Four meetings a year.',
    city: 'Riyadh',
    asset_class: 'residential',
    unlocked: false,
    access: 'locked',
    intro_status: null,
    organisation_name: ORG,
    terms: 'Independent seat. The appointment stays in the Safa Court Developer brief.',
    contact_name: 'Lina S.',
    contact_email: MAIL,
    contact_phone: PHONE,
    narrative: `${ORG} is a fictional example.`,
    ...extra,
  }
}

test('the board roles migration follows appetite and keeps the tables closed', () => {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  assert.ok(files.includes(migrationName))
  assert.ok(files.includes('20261122120000_re_appetite.sql'))
  assert.ok(migrationName > '20261122120000_re_appetite.sql')
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/https?:\/\//i.test(migration), false)
  assert.equal(/eyJ|sk_live|service_role|BEGIN PRIVATE KEY/i.test(migration), false)
  assert.equal(/\+\d{8,}|05\d{8}/.test(migration), false)
  assert.equal(/create policy/i.test(migration), false)
  assert.equal(/grant\s+select/i.test(migration), false)
  assert.equal(/disable row level security/i.test(migration), false)
  assert.equal(/to anon/.test(migration), false)
  assert.equal(/yield|occupancy/i.test(migration), false)
  const emails = migration.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
  assert.ok(emails.length >= 3)
  for (const email of emails) assert.match(email, /@example\.com$/i)
  for (const table of ['re_board_roles', 're_board_role_intros']) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`))
  }
  assert.match(migration, /re_board_roles_real int not null default 3/)
  assert.match(migration, /when 're_board_roles' then re_board_roles_real/)
  assert.match(migration, /private\.is_staff\(\)/)
  assert.equal(/@gmail\.|@boardarabia\.|michael|mateer/i.test(migration), false)
  for (const banned of ['Knight Frank', 'CBRE', 'JLL', 'Savills', 'Colliers', 'Emaar', 'Dar Al Arkan']) {
    assert.equal(migration.toLowerCase().includes(banned.toLowerCase()), false, banned)
  }
})

test('members see a locked role, and a new intro notes the admin alert', () => {
  const locked = slice(migration, '-- locked_re_board_role_json', '-- end_locked_re_board_role_json')
  const lockedCall = slice(migration, '-- member_board_role_locked_call_begin', '-- member_board_role_locked_call_end')
  const feed = slice(migration, '-- member_board_role_feed_begin', '-- member_board_role_feed_end')
  const request = migration.slice(
    migration.indexOf('function public.request_re_board_role_intro'),
    migration.indexOf('revoke all on function public.request_re_board_role_intro'),
  )
  for (const key of RE_BOARD_ROLE_SENSITIVE_KEYS) {
    assert.equal(locked.includes(key), false, key)
    assert.equal(lockedCall.includes(key), false, key)
    assert.equal(request.includes(key), false, key)
  }
  assert.match(locked, /'unlocked', false/)
  assert.match(locked, /'access', 'locked'/)
  assert.match(locked, /'title', p_title/)
  assert.match(locked, /'capacity', p_capacity/)
  assert.match(feed, /security definer/)
  assert.match(feed, /set search_path = public/)
  assert.match(feed, /m\.seat in \('ksa', 'intl'\)/)
  assert.match(feed, /private\.demo_rows_visible\('re_board_roles', real_n\)/)
  assert.match(feed, /when i\.status = 'approved' then private\.re_board_role_open_json/)
  assert.match(feed, /re_board_role_locked_json/)
  assert.equal(feed.includes("seat = 'sponsor'"), false)
  assert.match(request, /security definer/)
  assert.match(request, /set search_path = public/)
  assert.match(request, /m\.seat in \('ksa', 'intl'\)/)
  assert.match(request, /private\.sample_subject\(p_role_id\)/)
  assert.ok(request.indexOf('sample_blocked') < request.indexOf('insert into public.re_board_role_intros'))
  assert.match(request, /perform private\.note_re_intro_admin_alert\(new_id\)/)
  assert.match(request, /return jsonb_build_object\('status', current_status\)/)
  assert.match(migration, /grant execute on function public\.request_re_board_role_intro\(uuid\) to authenticated/)
  assert.match(migration, /grant execute on function public\.list_re_board_roles\(\) to authenticated/)
  assert.equal(/grant execute on function public\.request_re_board_role_intro\([^;]*\) to anon/.test(migration), false)
  assert.match(migration, /re_board_roles b where b\.id = p_id and b\.is_demo/)
})

test('staff decide a role intro only after the staff check, and the queue omits contacts', () => {
  const decide = migration.slice(migration.indexOf('function public.staff_decide_re_board_role_intro'))
  const list = migration.slice(
    migration.indexOf('function public.staff_list_re_board_role_intros'),
    migration.indexOf('function public.staff_decide_re_board_role_intro'),
  )
  assert.match(decide, /if not private\.is_staff\(\)/)
  assert.ok(decide.indexOf('if not private.is_staff()') < decide.indexOf('update public.re_board_role_intros'))
  assert.match(decide, /sample_blocked/)
  assert.ok(decide.indexOf('sample_blocked') < decide.indexOf('update public.re_board_role_intros'))
  assert.match(decide, /and status = 'pending'/)
  assert.match(list, /if not private\.is_staff\(\)/)
  assert.match(list, /'organisation_name', r\.organisation_name/)
  assert.match(list, /'title', r\.title/)
  for (const key of ['contact_name', 'contact_email', 'contact_phone', 'narrative', 'terms']) {
    assert.equal(list.includes(key), false, key)
  }
  assert.match(migration, /Safa Court Developer/)
  assert.match(migration, /Hadi Shore Hold/)
  assert.match(migration, /Yarda Freight Desk/)
})

test('the presenter keeps the clear brief and drops the organisation until the intro is approved', () => {
  const card = presentReBoardRole(role())
  assert.ok(card)
  assert.equal(card?.unlocked, false)
  assert.equal(card?.access, 'locked')
  assert.equal(reBoardRoleSecretsVisible(role()), false)
  assert.equal(sensitiveKeysIn(card, RE_BOARD_ROLE_SENSITIVE_KEYS).length, 0)
  const encoded = JSON.stringify(card)
  assert.equal(encoded.includes(ORG), false)
  assert.equal(encoded.includes(MAIL), false)
  assert.equal(encoded.includes('6101'), false)
  assert.match(encoded, /Independent director/)
  assert.match(encoded, /Housing/)
  assert.match(encoded, /Four meetings a year/)
  assert.match(encoded, /Riyadh/)
  assert.match(encoded, /residential/)

  const approved = presentReBoardRole(role({ is_demo: false, unlocked: true, access: 'intro', intro_status: 'approved' }))
  assert.equal(approved?.access, 'intro')
  assert.equal(approved?.unlocked, true)
  if (approved?.access === 'intro') {
    assert.equal(approved.organisation_name, ORG)
    assert.equal(approved.contact_email, MAIL)
  }
  const forced = presentReBoardRole(role({ unlocked: true, access: 'intro', intro_status: 'pending' }))
  assert.equal(forced?.access, 'locked')
  assert.equal(JSON.stringify(forced).includes(MAIL), false)

  const inventory = presentReBoardRole(role({ is_demo: false, unlocked: true, access: 'inventory', published: false, sort_order: 4 }))
  assert.equal(inventory?.access, 'inventory')
  if (inventory?.access === 'inventory') {
    assert.equal(inventory.contact_email, MAIL)
    assert.equal(inventory.published, false)
  }
  assert.equal(presentReBoardRole(role({ title: `Seat at ${ORG}` })), null)
  assert.equal(reBoardRoleFeedIsForming([card!]), true)
  assert.equal(reBoardRoleFeedIsForming([presentReBoardRole(role({ is_demo: false }))!]), false)
  assert.equal(JSON.stringify(MEMBER_VIEWS.realEstate).includes('\u2014'), false)
  assert.match(MEMBER_VIEWS.realEstate.rolesForming, /still forming/)
  assert.match(MEMBER_VIEWS.realEstate.rolesEmpty, /No board roles yet/)
  assert.match(MEMBER_VIEWS.realEstate.rolesRequested, /Intro requested/)

  const rows = parseReBoardRoleIntros([
    {
      id: 'i1',
      title: 'Independent director',
      seat_kind: 'developer',
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: 'residential',
      organisation_name: ORG,
      member_name: 'Member',
      contact_email: MAIL,
    },
    { id: '', title: 'Dropped' },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.organisation_name, ORG)
  assert.equal(JSON.stringify(rows).includes(MAIL), false)
  assert.equal(JSON.stringify(STAFF_VIEWS.reBoardRoles).includes('\u2014'), false)
})

test('board roles markup blurs the seat, confirms a request, and keeps the admin queue', async () => {
  const page = source('src/pages/dashboard/RealEstatePage.tsx')
  const fetch = source('src/lib/demoFetch.ts')
  const client = source('src/lib/supabase.ts')
  const edge = source('supabase/functions/request-re-intro/index.ts')
  const handle = source('supabase/functions/request-re-intro/handle.ts')
  const admin = source('src/pages/admin/AdminHome.tsx')
  assert.match(page, /fetchReBoardRoles/)
  assert.match(page, /requestReBoardRoleIntro/)
  assert.equal(page.includes('.from('), false)
  assert.equal(page.includes('request-re-intro'), false)
  assert.equal(fetch.includes('request_re_board_role_intro'), false)
  assert.match(client, /role_id: roleId/)
  assert.match(edge, /request_re_board_role_intro/)
  assert.match(edge, /select\('title, seat_kind, sector, city, asset_class, organisation_name'\)/)
  assert.equal(edge.includes('contact_email'), false)
  assert.equal(edge.includes('contact_phone'), false)
  assert.match(handle, /a real estate board role intro/)
  assert.match(handle, /deliverAdminAlert/)
  assert.match(admin, /ReBoardRoleIntroQueue/)
  for (const rel of [
    'src/pages/dashboard/RealEstateRoles.tsx',
    'src/pages/admin/ReBoardRoleIntroQueue.tsx',
    'src/pages/admin/ReBoardRoleIntroList.tsx',
    'src/lib/reBoardRoles.ts',
  ]) {
    assert.equal(source(rel).includes('\u2014'), false, rel)
    assert.equal(source(rel).includes('\u2013'), false, rel)
  }

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/RealEstateBoard.tsx')
    const queue = await vite.ssrLoadModule('/src/pages/admin/ReBoardRoleIntroList.tsx')
    const demo = presentReBoardRole(role())
    const live = presentReBoardRole(role({
      id: 'b3000001-0000-4000-8000-000000000009',
      is_demo: false,
      seat_kind: 'propco',
      title: 'Non-executive director',
      sector: 'Hospitality',
      city: 'Makkah',
      asset_class: 'hospitality',
    }))
    const pending = presentReBoardRole(role({
      id: 'b3000001-0000-4000-8000-000000000008',
      is_demo: false,
      intro_status: 'pending',
      title: 'Board observer',
    }))
    const clear = presentReBoardRole(role({
      id: 'b3000001-0000-4000-8000-000000000007',
      is_demo: false,
      unlocked: true,
      access: 'intro',
      intro_status: 'approved',
    }))
    assert.ok(demo && live && pending && clear)
    assert.equal(demo.access, 'locked')
    assert.equal(clear.access, 'intro')
    const html = renderToStaticMarkup(
      createElement(view.RealEstateBoard, {
        status: 'ready',
        cards: [],
        busyId: null,
        requestError: false,
        onRetry: () => {},
        onRequest: () => {},
        tab: 'roles',
        rolesStatus: 'ready',
        roles: [demo, live, pending, clear],
        onRequestRole: () => {},
      }),
    )
    assert.match(html, /data-re-panel="roles"/)
    assert.match(html, /Board roles/)
    assert.match(html, /Independent director/)
    assert.match(html, /Non-executive director/)
    assert.match(html, /data-re-role-forming="true"/)
    assert.match(html, /re-locked-copy/)
    assert.match(html, /Intro requested/)
    assert.match(html, /data-re-role-confirm="true"/)
    assert.match(html, /Intro approved for you/)
    assert.match(html, new RegExp(ORG))
    assert.equal((html.match(/>Request intro</g) || []).length, 2)
    assert.match(html, /data-sample-action="inert"/)
    assert.equal((html.match(new RegExp(MAIL.replace('.', '\\.'), 'g')) || []).length, 1)
    assert.equal(html.includes('6101'), true)

    const empty = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.RealEstateBoard, {
          status: 'ready',
          cards: [],
          busyId: null,
          requestError: false,
          onRetry: () => {},
          onRequest: () => {},
          tab: 'roles',
          rolesStatus: 'ready',
          roles: [],
          onRequestRole: () => {},
        }),
      ),
    )
    assert.match(empty, /data-re-roles-empty="true"/)
    assert.match(empty, /No board roles yet/)
    assert.match(empty, /See opportunities/)
    assert.match(empty, /\/dashboard\/deals\/real-estate/)
    assert.equal(empty.includes(MAIL), false)

    const staff = renderToStaticMarkup(
      createElement(queue.ReBoardRoleIntroList, {
        rows: [
          {
            id: 'i1',
            title: 'Independent director',
            seat_kind: 'developer',
            sector: 'Housing',
            city: 'Riyadh',
            asset_class: 'residential',
            organisation_name: ORG,
            member_name: 'Layla N.',
          },
        ],
        error: false,
        busy: false,
        declineId: null,
        onApprove: () => {},
        onDecline: () => {},
        onCancelDecline: () => {},
        onConfirmDecline: () => {},
      }),
    )
    assert.match(staff, /data-re-role-queue="true"/)
    assert.match(staff, /Board role intros/)
    assert.match(staff, /Safa Court Developer/)
    assert.match(staff, /Layla N\./)
    assert.match(staff, /Approve intro/)
    assert.equal(staff.includes(MAIL), false)
  } finally {
    await vite.close()
  }
})

test('a new board role intro fires the admin alert and a repeat does not', async () => {
  const alerts: Array<{ requested: string; item: string; approvePath: string }> = []
  const response = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: ROLE_ID }),
    }),
    {
      alert: (input) => alerts.push(input),
      open: async () => ({
        userId: '11111111-1111-4111-8111-111111111111',
        rpc: async () => ({ data: { status: 'pending' }, error: null }),
        context: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing',
        }),
        roleRpc: async () => ({ data: { status: 'pending' }, error: null }),
        roleContext: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: ORG,
        }),
      }),
    },
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.status, 'pending')
  assert.equal(JSON.stringify(body).includes(ORG), false)
  assert.equal(JSON.stringify(body).includes(MAIL), false)
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0]?.requested, 'a real estate board role intro')
  assert.equal(alerts[0]?.item, ORG)
  assert.equal(alerts[0]?.approvePath, '/admin')

  const repeatAlerts: unknown[] = []
  const repeat = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: ROLE_ID }),
    }),
    {
      alert: () => repeatAlerts.push(true),
      open: async () => ({
        userId: '11111111-1111-4111-8111-111111111111',
        rpc: async () => ({ data: null, error: null }),
        context: async () => ({
          alreadyQueued: true,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing',
        }),
        roleRpc: async () => ({ data: { status: 'pending' }, error: null }),
        roleContext: async () => ({
          alreadyQueued: true,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: ORG,
        }),
      }),
    },
  )
  assert.equal(repeat.status, 200)
  assert.equal(repeatAlerts.length, 0)

  const mixed = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: ROLE_ID, opportunity_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
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
      }),
    },
  )
  assert.equal(mixed.status, 400)
})
