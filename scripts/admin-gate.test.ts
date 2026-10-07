import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { buildMasterInvite } from '../supabase/functions/_shared/invite_copy.ts'
import {
  MASTER_ONLY_MESSAGE,
  writeStaffRole,
  type StaffRoleStore,
} from '../supabase/functions/invite-master/handle.ts'

const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const MASTER = '33333333-3333-4333-8333-333333333333'
const NEW_USER = '44444444-4444-4444-8444-444444444444'

type Row = { user_id: string; email: string; role: string }

function memory(initial: Row[]) {
  const rows = initial.map((row) => ({ ...row }))
  const ops: string[] = []
  const store: StaffRoleStore = {
    async findRole(userId) {
      ops.push(`find:${userId}`)
      const row = rows.find((item) => item.user_id === userId)
      return { role: row?.role ?? null, error: null }
    },
    async insertRole(row) {
      ops.push(`insert:${row.role}`)
      rows.push({ user_id: row.userId, email: row.email, role: row.role })
      return null
    },
    async updateRole(row) {
      ops.push(`update:${row.role}`)
      const found = rows.find((item) => item.user_id === row.userId)
      if (!found) return 'missing row'
      found.role = row.role
      found.email = row.email
      return null
    },
  }
  return { rows, ops, store }
}

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

test('a staff caller cannot create anyone', async () => {
  const table = memory([])
  const result = await writeStaffRole(table.store, {
    callerRole: 'staff',
    requestedRole: 'master',
    userId: NEW_USER,
    email: 'new.admin@example.com',
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 403)
    assert.equal(result.error, MASTER_ONLY_MESSAGE)
  }
  assert.deepEqual(table.rows, [])
  assert.deepEqual(table.ops, [])
})

test('a staff caller cannot change any role, their own included', async () => {
  const initial = [
    { user_id: SELF, email: 'self.admin@example.com', role: 'staff' },
    { user_id: OTHER, email: 'other.admin@example.com', role: 'staff' },
    { user_id: MASTER, email: 'master@example.com', role: 'master' },
  ]
  const table = memory(initial)
  for (const userId of [SELF, OTHER, MASTER]) {
    const result = await writeStaffRole(table.store, {
      callerRole: 'staff',
      requestedRole: 'master',
      userId,
      email: 'self.admin@example.com',
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, 403)
    const omitted = await writeStaffRole(table.store, {
      callerRole: 'staff',
      requestedRole: null,
      userId,
      email: 'self.admin@example.com',
    })
    assert.equal(omitted.ok, false)
  }
  assert.deepEqual(table.rows, initial)
  assert.deepEqual(table.ops, [])
})

test('a master caller creates role staff by default', async () => {
  const table = memory([])
  const result = await writeStaffRole(table.store, {
    callerRole: 'master',
    requestedRole: null,
    userId: NEW_USER,
    email: 'new.admin@example.com',
  })
  assert.deepEqual(result, { ok: true, role: 'staff', changed: true })
  assert.deepEqual(table.rows, [
    { user_id: NEW_USER, email: 'new.admin@example.com', role: 'staff' },
  ])
  assert.deepEqual(table.ops, [`find:${NEW_USER}`, 'insert:staff'])
})

test('a master with explicit role=master creates or promotes a master', async () => {
  const table = memory([{ user_id: OTHER, email: 'other.admin@example.com', role: 'staff' }])
  const created = await writeStaffRole(table.store, {
    callerRole: 'master',
    requestedRole: 'master',
    userId: NEW_USER,
    email: 'new.master@example.com',
  })
  assert.deepEqual(created, { ok: true, role: 'master', changed: true })
  const promoted = await writeStaffRole(table.store, {
    callerRole: 'master',
    requestedRole: 'master',
    userId: OTHER,
    email: 'other.admin@example.com',
  })
  assert.deepEqual(promoted, { ok: true, role: 'master', changed: true })
  assert.equal(table.rows.find((row) => row.user_id === NEW_USER)?.role, 'master')
  assert.equal(table.rows.find((row) => row.user_id === OTHER)?.role, 'master')
})

test('an existing role is not overwritten without an explicit master request', async () => {
  const initial = [
    { user_id: MASTER, email: 'master@example.com', role: 'master' },
    { user_id: OTHER, email: 'other.admin@example.com', role: 'staff' },
  ]
  const table = memory(initial)
  const keptMaster = await writeStaffRole(table.store, {
    callerRole: 'master',
    requestedRole: null,
    userId: MASTER,
    email: 'master@example.com',
  })
  const keptStaff = await writeStaffRole(table.store, {
    callerRole: 'master',
    requestedRole: undefined,
    userId: OTHER,
    email: 'other.admin@example.com',
  })
  assert.deepEqual(keptMaster, { ok: true, role: 'master', changed: false })
  assert.deepEqual(keptStaff, { ok: true, role: 'staff', changed: false })
  assert.deepEqual(table.rows, initial)
  assert.equal(table.ops.some((op) => op.startsWith('update') || op.startsWith('insert')), false)

  const tricky = await writeStaffRole(table.store, {
    callerRole: 'master',
    requestedRole: 'Master',
    userId: OTHER,
    email: 'other.admin@example.com',
  })
  assert.equal(tricky.ok, false)
  if (!tricky.ok) assert.equal(tricky.status, 400)
  assert.deepEqual(table.rows, initial)
})

test('a master explicit role=staff can change an existing master', async () => {
  const table = memory([{ user_id: MASTER, email: 'master@example.com', role: 'master' }])
  const result = await writeStaffRole(table.store, {
    callerRole: 'master',
    requestedRole: 'staff',
    userId: MASTER,
    email: 'master@example.com',
  })
  assert.deepEqual(result, { ok: true, role: 'staff', changed: true })
  assert.equal(table.rows[0]?.role, 'staff')
})

test('invite-master checks the caller before any credential or staff write', () => {
  const index = read('supabase/functions/invite-master/index.ts')
  const gateAt = index.indexOf('assertMasterCaller(gate.role)')
  const issueAt = index.indexOf('issueCredential(')
  const writeAt = index.indexOf('writeStaffRole(')
  assert.ok(gateAt > 0 && issueAt > gateAt && writeAt > issueAt)
  assert.match(index, /requireStaff\(/)
  assert.equal(index.includes("role: 'master'"), false)
  assert.equal(index.includes('.upsert('), false)
  assert.equal(/body\.role|user_metadata|app_metadata/.test(index), false)
  assert.match(index, /requestedStaffRole\(/)
  assert.match(index, /callerRole: gate\.role/)
})

test('an admin invite does not call the person master staff', () => {
  const admin = buildMasterInvite({
    greeting: 'there',
    seatLabel: null,
    loginUrl: 'https://boardarabia.com/login',
    confirmUrl: null,
    staffLoginUrl: 'https://boardarabia.com/login/staff',
    memberLoginUrl: 'https://boardarabia.com/login',
    staffRole: 'staff',
    issued: { mode: 'magic_link', otp: '123456' },
  })
  assert.match(admin.text, /as an admin/)
  assert.equal(admin.text.includes('master staff'), false)
  assert.equal(admin.html.includes('master staff'), false)
  const master = buildMasterInvite({
    greeting: 'there',
    seatLabel: 'Saudi Arabia',
    loginUrl: 'https://boardarabia.com/login',
    confirmUrl: null,
    staffLoginUrl: 'https://boardarabia.com/login/staff',
    memberLoginUrl: 'https://boardarabia.com/login',
    staffRole: 'master',
    issued: { mode: 'temp_password', tempPassword: 'example-temp' },
  })
  assert.match(master.text, /as master staff/)
  assert.equal(admin.text.includes('\u2014') || admin.text.includes('\u2013'), false)
})

test('the UI hides the add admin form for non-master staff', async () => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const peopleMod = (await vite.ssrLoadModule('/src/pages/admin/PeoplePage.tsx')) as {
      PeoplePage: () => ReactNode
    }
    const previewMod = (await vite.ssrLoadModule('/src/pages/admin/context.tsx')) as {
      AdminPreview: (props: { room: Record<string, unknown>; children: ReactNode }) => ReactNode
    }
    const masterHtml = renderPeople(previewMod.AdminPreview, peopleMod.PeoplePage, 'master')
    const staffHtml = renderPeople(previewMod.AdminPreview, peopleMod.PeoplePage, 'staff')
    assert.match(masterHtml, /data-add-admin="true"/)
    assert.match(masterHtml, />Add admin</)
    assert.match(masterHtml, /<option value="staff" selected="">Admin<\/option>/)
    assert.match(masterHtml, /<option value="master">Master<\/option>/)
    assert.equal(masterHtml.includes('value="master" selected'), false)
    assert.equal(staffHtml.includes('data-add-admin'), false)
    assert.equal(staffHtml.includes('Add admin'), false)
    assert.match(staffHtml, /Add partner/)
    assert.match(masterHtml, /Add partner/)
  } finally {
    await vite.close()
  }
})

test('no email literal in SettingsPage or People', () => {
  const settings = read('src/pages/admin/SettingsPage.tsx')
  const people = read('src/pages/admin/PeoplePage.tsx')
  const foreign = /[A-Z0-9._%+-]+@(?!example\.com)[A-Z0-9.-]+\.[A-Z]{2,}/i
  for (const source of [settings, people]) {
    assert.equal(foreign.test(source), false)
    assert.equal(source.includes('\u2014') || source.includes('\u2013'), false)
    assert.equal(/michael/i.test(source), false)
    assert.equal(source.includes('Invite / promote'), false)
  }
  assert.equal(settings.includes('Promote admin'), false)
  assert.match(people, /staffRole === 'master'/)
  assert.match(people, /Add admin/)
  const client = read('src/lib/supabase.ts')
  const start = client.indexOf('export async function inviteMaster')
  const next = client.indexOf('\nexport ', start + 10)
  const fn = client.slice(start, next === -1 ? undefined : next)
  assert.match(fn, /input\?\.role === 'master'/)
  assert.equal(fn.includes("payload.role = 'staff'"), false)
})

function renderPeople(
  Preview: (props: { room: Record<string, unknown>; children: ReactNode }) => ReactNode,
  Page: () => ReactNode,
  staffRole: 'master' | 'staff',
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/admin/people'] },
      createElement(
        Preview,
        { room: peopleRoom(staffRole) },
        createElement(Page),
      ),
    ),
  )
}

function peopleRoom(staffRole: 'master' | 'staff') {
  return {
    session: null,
    booting: false,
    isStaff: true,
    staffRole,
    loading: false,
    hasLoaded: true,
    listError: '',
    refreshError: '',
    queryDetail: '',
    panelFailed: {},
    actionNote: '',
    apps: [],
    members: [
      {
        user_id: 'member-1',
        email: 'member@example.com',
        seat: 'ksa',
        status: 'active',
        invites_remaining: 2,
        invites_granted: 2,
      },
    ],
    peerInvites: [],
    events: [],
    staffRows: [
      { email: 'master@example.com', role: 'master', created_at: '2026-09-01T00:00:00.000Z' },
      { email: 'admin@example.com', role: 'staff', created_at: '2026-09-02T00:00:00.000Z' },
    ],
    profileByUser: {},
    capacity: null,
    platform: null,
    refreshedAt: null,
    updatingId: null,
    dryRunInvite: null,
    email: 'viewer@example.com',
    isMember: false,
    masterKnown: true,
    seatById: {},
    setSeat: () => {},
    draftFor: (_key: string, fallback: unknown) => fallback,
    setDraft: () => {},
    refresh: () => {},
    onAccept: async () => {},
    onAdmit: async () => {},
    onReject: async () => {},
    runInvite: async () => {},
    onMemberStatus: async () => {},
    onSaveCapacity: async () => {},
    signOut: async () => {},
  }
}
