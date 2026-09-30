import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import type { FoundingCapacity } from '../src/lib/member.ts'
import type { PlatformStats } from '../src/lib/platformStats.ts'
import { isKeep, settleAdminLoad, type Listed } from '../src/pages/admin/load.ts'
import type { AdminRoom } from '../src/pages/admin/context.tsx'
import { ADMIN_PANEL_NOTICE } from '../src/shell/viewCopy.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20261027120000_email_events_staff_grant.sql', import.meta.url),
  'utf8',
)

test('email_events staff grant is select for authenticated and not anon', () => {
  assert.match(migration, /grant select on public\.email_events to authenticated;/i)
  assert.equal(/\bgrant\b[^;]*\bto\s+anon\b/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(ADMIN_PANEL_NOTICE.includes('\u2014'), false)
  assert.equal(ADMIN_PANEL_NOTICE.includes('\u2013'), false)
  assert.equal(ADMIN_PANEL_NOTICE, "This panel couldn't load. Try again shortly.")
})

test('one failing admin query keeps the other panels', async () => {
  const capacity: FoundingCapacity = { ksa: 4, intl: 3, ksa_cap: 50, intl_cap: 50, total_cap: 100 }
  const platform: PlatformStats = {
    investment: 5000000,
    foAum: null,
    turnover: null,
    admitted: 7,
    ksa: 4,
    intl: 3,
    contributorsInvestment: 6,
    contributorsFo: 0,
    contributorsTurnover: 0,
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
  const app = { id: 'app-1', status: 'pending' }
  const member = { user_id: 'member-1', email: 'member@example.com', seat: 'ksa', status: 'active' }
  const staff = { email: 'staff@example.com', role: 'staff' }
  const ok = <T,>(data: T[]): Listed<T> => ({ data, error: null })

  const settled = settleAdminLoad({
    capacity,
    platform,
    apps: ok([app]),
    members: ok([member]),
    invites: ok([]),
    events: { data: null, error: { message: 'permission denied for table email_events' } },
    directory: ok([staff]),
    profiles: ok([{ user_id: 'member-1', company: 'Example Ledger' }]),
  })

  assert.deepEqual(settled.failed, { email: true })
  assert.equal(isKeep(settled.events), true)
  assert.equal(isKeep(settled.apps), false)
  assert.deepEqual(settled.apps, [app])
  assert.deepEqual(settled.members, [member])
  assert.equal(isKeep(settled.capacity), false)
  assert.deepEqual(settled.capacity, capacity)
  assert.equal(isKeep(settled.platform), false)
  assert.equal(isKeep(settled.staffRows), false)
  assert.equal(isKeep(settled.profileByUser), false)
  if (!isKeep(settled.profileByUser)) {
    assert.equal(settled.profileByUser['member-1']?.company, 'Example Ledger')
  }

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const home = (await vite.ssrLoadModule('/src/pages/admin/AdminHome.tsx')) as {
      StaffDesk: () => ReactNode
    }
    const preview = (await vite.ssrLoadModule('/src/pages/admin/context.tsx')) as {
      AdminPreview: (props: { room: AdminRoom; children: ReactNode }) => ReactNode
    }
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          preview.AdminPreview,
          { room: roomWithEmailFailure(capacity, platform) },
          createElement(home.StaffDesk),
        ),
      ),
    )
    const emailAt = html.indexOf('aria-label="Recent email"')
    assert.ok(emailAt >= 0)
    const emailPanel = html.slice(emailAt)
    assert.match(emailPanel, /This panel couldn(?:'|&#x27;)t load\. Try again shortly\./)
    assert.equal(emailPanel.includes('permission denied'), false)
    assert.match(html, /Pending applications[\s\S]{0,240}>2</)
    assert.match(html, /Founding admitted[\s\S]{0,240}>7 \/ 100</)
    assert.match(html, /Admins[\s\S]{0,240}>1</)
    assert.equal(html.includes("Couldn't refresh"), false)
    assert.equal(html.includes('permission denied'), false)
    assert.equal((html.match(/This panel couldn(?:'|&#x27;)t load/g) || []).length, 1)
  } finally {
    await vite.close()
  }
})

function roomWithEmailFailure(capacity: FoundingCapacity, platform: PlatformStats): AdminRoom {
  const app = {
    id: 'app-1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    full_name: 'Example Applicant',
    email: 'applicant@example.com',
    phone: null,
    turnover: '',
    fo_aum: null,
    investable_capacity_usd: null,
    include_in_public_aggregates: true,
    companies: 'Example Ledger',
    job_titles: 'Director',
    linkedin_url: null,
    calendar_slot: null,
    status: 'pending' as const,
    notes: null,
    invite_event_id: null,
    invite_sent_at: null,
    decision_at: null,
    decision_by: null,
    founding_seat: null,
    member_user_id: null,
    admitted_at: null,
    admitted_by: null,
    invited_by_member_id: null,
    invite_token_id: null,
    invite_reason: null,
  }
  return {
    session: null,
    booting: false,
    isStaff: true,
    staffRole: 'staff',
    loading: false,
    hasLoaded: true,
    listError: '',
    refreshError: '',
    queryDetail: '',
    panelFailed: { email: true },
    actionNote: '',
    apps: [app, { ...app, id: 'app-2', status: 'pending' }],
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
      { email: 'staff@example.com', role: 'staff', created_at: '2026-09-01T00:00:00.000Z' },
    ],
    profileByUser: {},
    capacity,
    platform,
    refreshedAt: new Date('2026-09-29T09:00:00.000Z'),
    updatingId: null,
    dryRunInvite: null,
    email: 'staff@example.com',
    isMember: false,
    masterKnown: false,
    seatById: {},
    setSeat: () => {},
    draftFor: (_key, fallback) => fallback,
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
