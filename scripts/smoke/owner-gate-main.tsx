import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { FoundingCapacity } from '../../src/lib/member'
import { StaffDesk } from '../../src/pages/admin/AdminHome'
import { AdminPreview } from '../../src/pages/admin/context'
import { PeoplePage } from '../../src/pages/admin/PeoplePage'
import { SettingsPage } from '../../src/pages/admin/SettingsPage'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const capacity: FoundingCapacity = { ksa: 1, intl: 0, ksa_cap: 50, intl_cap: 50, total_cap: 100 }

function room(staffRole: 'master' | 'staff') {
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
        seat: 'ksa' as const,
        status: 'active' as const,
        invites_remaining: 2,
        invites_granted: 2,
      },
    ],
    peerInvites: [],
    events: [],
    staffRows: [
      {
        user_id: 'owner-1',
        email: 'owner@example.com',
        role: 'master',
        display_name: 'Example Owner',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        user_id: 'admin-1',
        email: 'admin@example.com',
        role: 'staff',
        display_name: 'Example Admin',
        created_at: '2026-09-02T00:00:00.000Z',
      },
    ],
    profileByUser: {},
    capacity,
    platform: null,
    refreshedAt: new Date('2026-10-13T09:00:00.000Z'),
    updatingId: null,
    dryRunInvite: null,
    email: 'owner@example.com',
    isMember: false,
    masterKnown: staffRole === 'master',
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

function Preview() {
  const params = new URLSearchParams(window.location.search)
  const staffRole = params.get('role') === 'admin' ? 'staff' : 'master'
  const view = params.get('view') || 'people'
  const body =
    view === 'settings' ? <SettingsPage /> : view === 'home' ? <StaffDesk /> : <PeoplePage />
  return (
    <MemoryRouter initialEntries={[view === 'settings' ? '/admin/settings' : view === 'home' ? '/admin' : '/admin/people']}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Staff"
      >
        <AdminPreview room={room(staffRole)}>{body}</AdminPreview>
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
