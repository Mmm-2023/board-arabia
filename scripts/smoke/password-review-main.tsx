import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS } from '../../src/shell/destinations'
import { AppShell } from '../../src/shell/AppShell'
import { DashboardStatusContext, MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { DashboardHome } from '../../src/pages/dashboard/DashboardHome'
import { ProfilePage } from '../../src/pages/dashboard/ProfilePage'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import '../../src/index.css'

const view = new URLSearchParams(window.location.search).get('view') || 'home'

const member: MemberRow = {
  user_id: 'a1000001-0000-4000-8000-000000000001',
  email: 'member@example.com',
  seat: 'intl',
  status: 'active',
  must_set_password: false,
  invites_remaining: 1,
  invites_granted: 2,
}

const profile: ProfileRow = {
  user_id: member.user_id,
  full_name: 'Member name',
  headline: view === 'home' ? null : 'Chair',
  company: 'Example Desk',
  location: view === 'home' ? null : 'Riyadh',
  linkedin_url: null,
  bio: null,
  phone: null,
  investable_capacity_usd: null,
  fo_aum_usd: null,
  turnover_usd: null,
  capacity_currency: null,
  include_in_public_aggregates: false,
  capacity_verified: false,
  avatar_path: null,
}

const room: MemberRoom = {
  userId: member.user_id,
  email: member.email,
  staffRole: null,
  member,
  profile,
  reload: async () => {},
}

const path = view === 'profile' ? '/dashboard/profile' : '/dashboard'

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')

createRoot(root).render(
  <MemoryRouter initialEntries={[path]}>
    <DashboardStatusContext.Provider
      value={{ refreshError: '', refreshing: false, updatedAt: new Date('2026-09-29T12:00:00Z'), retry: () => {} }}
    >
      <MemberContext.Provider value={room}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_ACCOUNT}
          updatedLabel={null}
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel="member@example.com"
          accountName="Member name"
          dealsBadge={2}
          accountMark={<span aria-hidden="true">MN</span>}
        >
          {view === 'profile' ? <ProfilePage /> : <DashboardHome />}
        </AppShell>
      </MemberContext.Provider>
    </DashboardStatusContext.Provider>
  </MemoryRouter>,
)
