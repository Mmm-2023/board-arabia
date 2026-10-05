import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { handleReIntro } from '../supabase/functions/request-re-intro/handle.ts'
import {
  clubStaffError,
  parseMyReClubInterest,
  parseReClubGroups,
} from '../src/lib/reClubInterest.ts'
import { presentReOpportunity } from '../src/lib/reRedaction.ts'
import { MEMBER_VIEWS, STAFF_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationName = '20261124120000_re_club_interest.sql'
const migration = readFileSync(path.join(root, 'supabase/migrations', migrationName), 'utf8')
const OPP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const MEMBER = '11111111-1111-4111-8111-111111111111'
const ROOM = 'a3000001-0000-4000-8000-000000000099'
const MAIL = 'layla.club@example.com'
const SECRET = 'Nahla House Works'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function slice(sourceText: string, start: string, end: string) {
  const from = sourceText.indexOf(start)
  const to = sourceText.indexOf(end, from + start.length)
  assert.ok(from >= 0, start)
  assert.ok(to > from, end)
  return sourceText.slice(from, to)
}

test('club interest migration is idempotent, staff gated, and alerts once', () => {
  assert.ok(migrationName > '20261123120000_re_board_roles.sql')
  assert.match(migration, /constraint re_club_interest_once unique \(opportunity_id, member_id\)/)
  assert.match(migration, /on conflict \(opportunity_id, member_id\) do nothing/)
  const express = slice(migration, 'function public.express_re_club_interest', 'function public.my_re_club_interest')
  assert.match(express, /if new_id is not null then\s+perform private\.note_re_intro_admin_alert\(new_id\);/s)
  assert.equal(express.split('note_re_intro_admin_alert').length, 2)
  assert.match(express, /'status', 'recorded'/)
  assert.match(express, /'fresh', new_id is not null/)
  assert.match(express, /or demo_flag then/)
  assert.match(slice(migration, 'function public.my_re_club_interest', 'function public.staff_list_re_club_interest'), /c\.member_id = auth\.uid\(\)/)
  assert.equal(migration.includes('counterparty_name'), false)
  assert.equal(migration.includes('@'), false)
  assert.match(migration, /opened_by/)
  assert.match(migration, /'member'/)
  assert.match(migration, /'invited'/)
  assert.match(migration, /invite_status/)
  assert.equal(/create table[^;]*message/i.test(migration), false)
  for (const name of ['staff_list_re_club_interest', 'staff_open_re_club_room', 'staff_link_re_club_room']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\s*\\([^;]*\\)\\s*from public, anon;`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\s*\\([^;]*\\)\\s*to authenticated;`))
    assert.equal(new RegExp(`grant execute on function public\\.${name}\\s*\\([^;]*\\)\\s*to anon`).test(migration), false)
  }
  assert.match(migration, /revoke all on function public\.express_re_club_interest\(uuid\) from public, anon;/)
  assert.equal(/grant execute on function public\.express_re_club_interest\(uuid\) to anon/.test(migration), false)
  assert.match(migration, /revoke all on table public\.re_club_interest from public, anon, authenticated;/)
  const open = slice(migration, 'function public.staff_open_re_club_room', 'function public.staff_link_re_club_room')
  assert.match(open, /if not private\.is_staff\(\) then/)
  assert.ok(open.indexOf('if not private.is_staff()') < open.indexOf('insert into public.rooms'))
  assert.match(open, /opened_by/)
  const link = slice(migration, 'function public.staff_link_re_club_room', 'revoke all on function public.staff_link_re_club_room')
  assert.match(link, /if not private\.is_staff\(\) then/)
  assert.ok(link.indexOf('if not private.is_staff()') < link.search(/\bupdate\b/i))
  assert.match(link, /opened_by is distinct from 'member'/)
  assert.match(migration, /It is not a message thread/)
})

test('member interest goes through request-re-intro and does not call the rpc from the page', () => {
  const page = source('src/pages/dashboard/RealEstatePage.tsx')
  const fetch = source('src/lib/demoFetch.ts')
  const client = source('src/lib/supabase.ts')
  const interest = slice(page, 'async function onInterest', 'async function onRequest')
  assert.match(interest, /interestLock\.current/)
  assert.match(interest, /sampleRow\(list\.cards, id\)/)
  assert.match(interest, /expressReClubInterest/)
  assert.equal(page.includes('express_re_club_interest'), false)
  assert.equal(page.includes('.from('), false)
  assert.match(fetch, /expressReClubInterest as postReClubInterest/)
  assert.equal(fetch.includes('express_re_club_interest'), false)
  assert.match(client, /interest_opportunity_id/)
  assert.match(client, /request-re-intro/)
  const edge = source('supabase/functions/request-re-intro/index.ts')
  const clubLoad = slice(edge, 'async function loadClubInterest', 'async function loadContext')
  assert.match(clubLoad, /re_club_interest/)
  assert.match(clubLoad, /select\('sector, city, asset_class'\)/)
  assert.equal(clubLoad.includes('counterparty_name'), false)
  assert.equal(clubLoad.includes('contact_email'), false)
  const handle = source('supabase/functions/request-re-intro/handle.ts')
  const clubFile = source('supabase/functions/request-re-intro/club.ts')
  assert.match(handle, /interest_opportunity_id/)
  assert.match(handle, /finishClubInterest/)
  assert.match(clubFile, /deliverAdminAlert/)
  assert.match(clubFile, /a real estate club interest/)
  assert.equal(clubFile.includes('\u2014'), false)
  assert.equal(clubFile.includes('\u2013'), false)
  for (const file of [
    page,
    fetch,
    source('src/pages/dashboard/RealEstateBoard.tsx'),
    source('src/pages/dashboard/ClubInterestAction.tsx'),
    source('src/pages/admin/AdminHome.tsx'),
    source('src/pages/admin/ReClubInterestBoard.tsx'),
    source('src/shell/viewCopy.ts'),
  ]) {
    assert.equal(file.includes('\u2014'), false)
    assert.equal(file.includes('\u2013'), false)
  }
  assert.equal(MEMBER_VIEWS.realEstate.club.cta, 'Express interest to co-invest')
  assert.match(MEMBER_VIEWS.realEstate.club.recorded, /does not message other members/)
  assert.equal(MEMBER_VIEWS.realEstate.club.cta.includes('\u2014'), false)
})

test('parsers drop mailboxes and keep one id per member', () => {
  assert.deepEqual(parseMyReClubInterest([OPP, OPP, 'nope', MEMBER]), [OPP, MEMBER])
  const groups = parseReClubGroups([
    {
      opportunity_id: OPP,
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: 'residential',
      one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
      room_id: null,
      room_name: null,
      members: [{ member_id: MEMBER, member_name: 'Layla N.', email: MAIL }],
      contact_email: MAIL,
      counterparty_name: SECRET,
    },
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.members[0]?.member_name, 'Layla N.')
  assert.equal(groups[0]?.asset_class, 'Residential')
  assert.equal(JSON.stringify(groups).includes(MAIL), false)
  assert.equal(JSON.stringify(groups).includes(SECRET), false)
  assert.equal(JSON.stringify(groups).includes('email'), false)
  assert.equal(clubStaffError('already_linked'), 'linked')
  assert.equal(clubStaffError('no_active_member'), 'owner')
  assert.equal(clubStaffError('not_found'), 'link')
})

test('the card shows the co-invest state and staff can create or link a room', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const cardView = await vite.ssrLoadModule('/src/pages/dashboard/OpportunityCard.tsx')
    const staffView = await vite.ssrLoadModule('/src/pages/admin/ReClubInterestBoard.tsx')
    const live = presentReOpportunity({
      id: OPP,
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
      terms: 'Observer seat beside the developer.',
      contact_name: 'Amal N.',
      contact_email: MAIL,
      contact_phone: 'Desk extension 5101',
      narrative: 'Locked.',
    })
    const demo = presentReOpportunity({
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
      counterparty_name: SECRET,
      contact_email: MAIL,
    })
    assert.ok(live && demo)
    const cta = renderToStaticMarkup(
      createElement(cardView.OpportunityCard, {
        card: live,
        showInterest: true,
        onInterest: () => {},
      }),
    )
    assert.match(cta, /data-re-club="express"/)
    assert.match(cta, /Express interest to co-invest/)
    assert.match(cta, /min-h-11/)
    assert.equal(cta.includes('data-re-club="recorded"'), false)
    assert.equal(cta.includes(SECRET), false)
    assert.equal(cta.includes(MAIL), false)
    assert.equal(cta.includes('<textarea'), false)

    const recorded = renderToStaticMarkup(
      createElement(cardView.OpportunityCard, {
        card: live,
        showInterest: true,
        interested: true,
        onInterest: () => {},
      }),
    )
    assert.match(recorded, /data-re-club="recorded"/)
    assert.match(recorded, /Interest recorded/)
    assert.match(recorded, /does not message other members/)
    assert.equal(recorded.includes('data-re-club="express"'), false)
    assert.equal(recorded.includes(SECRET), false)

    const sample = renderToStaticMarkup(
      createElement(cardView.OpportunityCard, {
        card: demo,
        showInterest: true,
        onInterest: () => {},
      }),
    )
    assert.match(sample, /data-re-club="sample"/)
    assert.match(sample, /disabled/)
    assert.match(sample, />Example</)

    const rows = parseReClubGroups([
      {
        opportunity_id: OPP,
        sector: 'Housing',
        city: 'Riyadh',
        asset_class: 'residential',
        one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
        room_id: null,
        room_name: null,
        members: [
          { member_id: MEMBER, member_name: 'Layla N.', email: MAIL },
          { member_id: '22222222-2222-4222-8222-222222222222', member_name: 'Huda S.' },
        ],
      },
    ])
    const staff = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(staffView.ReClubInterestBoard, {
          status: 'ready',
          rows,
          busyId: null,
          notice: '',
          onRetry: () => {},
          onCreate: () => {},
          onLink: () => {},
        }),
      ),
    )
    assert.match(staff, /data-re-club-staff="true"/)
    assert.match(staff, /Club interest/)
    assert.match(staff, /Layla N\./)
    assert.match(staff, /Huda S\./)
    assert.match(staff, /Create Deal Room/)
    assert.match(staff, /Link Deal Room/)
    assert.match(staff, /Existing room/)
    assert.equal(staff.includes(MAIL), false)
    assert.equal(staff.includes(SECRET), false)
    assert.equal(staff.includes('<textarea'), false)

    const empty = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(staffView.ReClubInterestBoard, {
          status: 'ready',
          rows: [],
          busyId: null,
          notice: '',
          onRetry: () => {},
          onCreate: () => {},
          onLink: () => {},
        }),
      ),
    )
    assert.match(empty, new RegExp(STAFF_VIEWS.reClub.empty))
    assert.match(empty, /href="\/admin\/rooms"/)
    assert.match(empty, /Deal rooms/)
    assert.equal(empty.includes(MAIL), false)
  } finally {
    await vite.close()
  }
})

test('a new club interest fires the admin alert and a repeat does not', async () => {
  const alerts: Array<{ requested: string; item: string; approvePath: string }> = []
  const first = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest_opportunity_id: OPP }),
    }),
    {
      alert: (input) => alerts.push(input),
      open: async () => ({
        userId: MEMBER,
        rpc: async () => ({ data: null, error: null }),
        context: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing',
        }),
        interestRpc: async () => ({ data: { status: 'recorded', fresh: true }, error: null }),
        interestContext: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing, Riyadh, residential',
        }),
      }),
    },
  )
  assert.equal(first.status, 200)
  const body = await first.json()
  assert.equal(body.ok, true)
  assert.equal(body.status, 'recorded')
  assert.equal(JSON.stringify(body).includes(MAIL), false)
  assert.equal(JSON.stringify(body).includes(SECRET), false)
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0]?.requested, 'a real estate club interest')
  assert.equal(alerts[0]?.item, 'Housing, Riyadh, residential')
  assert.equal(alerts[0]?.approvePath, '/admin')

  const repeatAlerts: unknown[] = []
  const repeat = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest_opportunity_id: OPP }),
    }),
    {
      alert: () => repeatAlerts.push(true),
      open: async () => ({
        userId: MEMBER,
        rpc: async () => ({ data: null, error: null }),
        context: async () => ({
          alreadyQueued: true,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing',
        }),
        interestRpc: async () => ({ data: { status: 'recorded', fresh: false }, error: null }),
        interestContext: async () => ({
          alreadyQueued: true,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing, Riyadh, residential',
        }),
      }),
    },
  )
  assert.equal(repeat.status, 200)
  assert.equal(repeatAlerts.length, 0)

  const staleAlerts: unknown[] = []
  const stale = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest_opportunity_id: OPP }),
    }),
    {
      alert: () => staleAlerts.push(true),
      open: async () => ({
        userId: MEMBER,
        rpc: async () => ({ data: { status: 'recorded', fresh: true }, error: null }),
        context: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing',
        }),
        interestRpc: async () => ({ data: { status: 'recorded', fresh: false }, error: null }),
        interestContext: async () => ({
          alreadyQueued: false,
          requesterName: 'Example Person',
          requesterKind: 'member' as const,
          item: 'Housing, Riyadh, residential',
        }),
      }),
    },
  )
  assert.equal(stale.status, 200)
  assert.equal(staleAlerts.length, 0)

  const mixed = await handleReIntro(
    new Request('https://boardarabia.com/functions/v1/request-re-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest_opportunity_id: OPP, opportunity_id: ROOM }),
    }),
    {
      open: async () => ({
        userId: MEMBER,
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
