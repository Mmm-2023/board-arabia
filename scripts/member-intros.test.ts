import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  cleanIntroReason,
  filterIntros,
  outgoingMemberStatus,
  presentIntroList,
  presentIntroRow,
  type IntroRow,
} from '../src/lib/memberIntros.ts'
import { buildHeadlines } from '../src/lib/homeSnapshot.ts'
import { resolveRedirect } from '../src/shell/redirects.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20261020120000_member_warm_intros.sql', import.meta.url),
  'utf8',
)

const LIVE = '11111111-1111-4111-8111-111111111111'
const SAMPLE = 'a1000001-0000-4000-8000-000000000001'

function page(node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

async function loadUi() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  const action = await vite.ssrLoadModule('/src/pages/dashboard/DirectoryIntroAction.tsx')
  const board = await vite.ssrLoadModule('/src/pages/dashboard/IntroBoard.tsx')
  return {
    vite,
    DirectoryIntroAction: action.DirectoryIntroAction as (props: Record<string, unknown>) => ReturnType<typeof createElement>,
    IntroBoard: board.IntroBoard as (props: Record<string, unknown>) => ReturnType<typeof createElement>,
  }
}

function sliceFn(name: string) {
  const start = migration.indexOf(`function public.${name}`)
  assert.ok(start > 0, name)
  const next = migration.indexOf('create or replace function', start + 10)
  return migration.slice(start, next === -1 ? undefined : next)
}

test('intro reason is required and cannot carry contact details', () => {
  assert.equal(cleanIntroReason('  ').ok, false)
  assert.equal(cleanIntroReason('x'.repeat(281)).ok, false)
  assert.equal(cleanIntroReason('Write me at name@example.com').ok, false)
  assert.equal(cleanIntroReason('Call +966 50 123 4567 about the seat').ok, false)
  const cleaned = cleanIntroReason('  Shared work on an energy brief.  ')
  assert.equal(cleaned.ok, true)
  if (cleaned.ok) assert.equal(cleaned.reason, 'Shared work on an energy brief.')
})

test('intro rows drop contact fields and keep the directory shape', () => {
  assert.equal(
    presentIntroRow({
      id: LIVE,
      kind: 'member',
      direction: 'incoming',
      status: 'pending',
      title: 'Layla Al-Nadira',
      detail: 'Independent chair',
      reason: 'Shared board work.',
      is_demo: false,
      subject_id: SAMPLE,
      created_at: '2026-09-29T12:00:00.000Z',
      email: 'person@example.com',
    }),
    null,
  )
  assert.equal(
    presentIntroRow({
      id: LIVE,
      kind: 'mandate',
      direction: 'outgoing',
      status: 'pending',
      title: 'Energy transition · Growth equity',
      detail: 'KSA',
      reason: '',
      is_demo: true,
      subject_id: SAMPLE,
      created_at: '2026-09-29T12:00:00.000Z',
      contact_email: 'desk@example.com',
    }),
    null,
  )
  const row = presentIntroRow({
    id: LIVE,
    kind: 'member',
    direction: 'outgoing',
    status: 'accepted',
    title: 'Noura Al-Wahat',
    detail: 'Non-executive director · Wahat Counsel · Jeddah',
    reason: 'A board question on health.',
    is_demo: false,
    subject_id: SAMPLE,
    created_at: '2026-09-29T12:00:00.000Z',
  })
  assert.ok(row)
  assert.equal(row?.status, 'accepted')
  assert.equal(JSON.stringify(row).includes('@'), false)

  const rows = presentIntroList([
    {
      id: LIVE,
      kind: 'mandate',
      direction: 'outgoing',
      status: 'pending',
      title: 'Health · Acquisition',
      detail: 'GCC',
      reason: '',
      is_demo: false,
      subject_id: '22222222-2222-4222-8222-222222222222',
      created_at: '2026-09-29T12:00:00.000Z',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'member',
      direction: 'outgoing',
      status: 'pending',
      title: 'Hanan Al-Safi',
      detail: 'Family principal',
      reason: 'Tourism operators.',
      is_demo: false,
      subject_id: SAMPLE,
      created_at: '2026-09-29T11:00:00.000Z',
    },
  ])
  assert.deepEqual(filterIntros(rows, 'member').map((item) => item.kind), ['member'])
  assert.equal(outgoingMemberStatus(rows, SAMPLE), 'pending')
  assert.equal(outgoingMemberStatus(rows, LIVE), null)
})

test('sample ids are rejected in the database functions before any write', () => {
  const writes: Array<[string, 'insert' | 'update']> = [
    ['request_member_intro', 'insert'],
    ['respond_member_intro', 'update'],
    ['request_mandate_intro', 'insert'],
    ['staff_decide_mandate_intro', 'update'],
    ['request_re_opportunity_intro', 'insert'],
    ['staff_decide_re_opportunity_intro', 'update'],
    ['request_re_partner_intro', 'insert'],
    ['staff_decide_re_partner_intro', 'update'],
  ]
  for (const [name, verb] of writes) {
    const body = sliceFn(name)
    const guard = body.indexOf('sample_blocked')
    const write = body.toLowerCase().indexOf(verb)
    assert.ok(guard > 0 && write > guard, `${name} must reject a sample before ${verb}`)
    assert.match(body, /private\.sample_subject|m\.is_demo|o\.is_demo|t\.is_demo/)
  }
  assert.match(sliceFn('request_member_intro'), /directory_entries|sample_subject/)
  assert.match(migration, /function private\.sample_subject/)
  assert.match(migration, /directory_entries d where d\.id = p_id/)
  assert.equal(/delete\s+from\s+public\.(mandate_intros|majlis|members|directory_entries)/i.test(migration), false)
})

test('member intro payloads do not select contact details', () => {
  const mine = sliceFn('list_my_intros')
  const staff = sliceFn('staff_list_all_intros')
  for (const body of [mine, staff, migration]) {
    assert.equal(body.includes('contact_email'), false)
    assert.equal(body.includes('contact_phone'), false)
    assert.equal(body.includes('linkedin_url'), false)
    assert.equal(/\bemail\b/i.test(body), false)
  }
  assert.equal(mine.includes('company_name'), false)
  assert.equal(mine.includes('counterparty_name'), false)
  assert.match(staff, /company_name/)
  assert.match(staff, /counterparty_name/)
  assert.match(migration, /revoke all on table public\.member_intros from public, anon, authenticated/)
  assert.match(migration, /position\('@' in reason\) = 0/)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
})

test('sample directory cards stay inert and the old intros path opens the list', async () => {
  const ui = await loadUi()
  try {
  const sample = page(
    createElement(ui.DirectoryIntroAction, {
      sample: true,
      self: false,
      status: null,
      busy: false,
      error: '',
      onRequest: () => {},
    }),
  )
  assert.match(sample, /data-sample-action="inert"/)
  assert.match(sample, /data-intro-action="sample"/)
  assert.match(sample, /disabled=""[^>]*>Request intro</)
  const live = page(
    createElement(ui.DirectoryIntroAction, {
      sample: false,
      self: false,
      status: null,
      busy: false,
      error: '',
      onRequest: () => {},
    }),
  )
  assert.equal(live.includes('data-sample-action'), false)
  assert.match(live, /data-intro-action="request"/)
  assert.match(live, />Request intro</)
  const self = page(
    createElement(ui.DirectoryIntroAction, {
      sample: false,
      self: true,
      status: null,
      busy: false,
      error: '',
    }),
  )
  assert.match(self, /This is your card/)
  assert.equal(self.includes('>Request intro<'), false)

  const rows: IntroRow[] = [
    {
      id: LIVE,
      kind: 'member',
      direction: 'incoming',
      status: 'pending',
      title: 'Omar Al-Janub',
      detail: 'Chair advisor',
      reason: 'A question on mining seats.',
      is_demo: false,
      subject_id: SAMPLE,
      created_at: '2026-09-29T12:00:00.000Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'mandate',
      direction: 'outgoing',
      status: 'pending',
      title: 'Energy transition · Growth equity',
      detail: 'KSA',
      reason: '',
      is_demo: true,
      subject_id: 'a2000001-0000-4000-8000-000000000001',
      created_at: '2026-09-29T11:00:00.000Z',
    },
  ]
  const board = page(
    createElement(ui.IntroBoard, {
      tone: 'member',
      rows,
      busyId: null,
      error: '',
      onRespond: () => {},
    }),
  )
  assert.match(board, />Accept</)
  assert.match(board, />Decline</)
  assert.match(board, /Omar Al-Janub/)
  assert.match(board, />Mandate</)
  assert.match(board, />Sample</)
  assert.equal(board.includes('@'), false)
  assert.equal(board.includes('\u2014'), false)
  assert.equal(board.includes('\u2013'), false)
  assert.equal(resolveRedirect('/dashboard/intros'), '/dashboard/people/intros')

  const pulse = buildHeadlines({
    founding: false,
    invitesRemaining: 0,
    mandates: [
      { id: 'live', is_demo: false, intro_status: 'pending' },
      { id: 'sample', is_demo: true, intro_status: 'pending' },
    ],
    rooms: [],
    directory: [],
  })
  assert.equal(pulse.find((item) => item.id === 'intros')?.value, '1')
  assert.equal(pulse.find((item) => item.id === 'intros')?.example, false)
  assert.equal(pulse.find((item) => item.id === 'intros')?.to, '/dashboard/people/intros')
  assert.equal(pulse.find((item) => item.id === 'intros' && item.example), undefined)
  } finally {
    await ui.vite.close()
  }
})
