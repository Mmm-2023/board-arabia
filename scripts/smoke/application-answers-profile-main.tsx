import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { ProfilePage } from '../../src/pages/dashboard/ProfilePage'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const userId = 'example-member'
const email = 'member@example.com'

const member: MemberRow = {
  user_id: userId,
  email,
  seat: 'ksa',
  status: 'active',
  must_set_password: false,
  invites_remaining: 2,
  invites_granted: 2,
  tier: 'member',
}

const profile: ProfileRow = {
  user_id: userId,
  full_name: 'Example Applicant',
  headline: 'Independent chair',
  company: 'Example House',
  location: null,
  linkedin_url: 'https://www.linkedin.com/in/example-applicant',
  bio: null,
  phone: null,
  investable_capacity_usd: null,
  fo_aum_usd: null,
  turnover_usd: null,
  capacity_currency: null,
  include_in_public_aggregates: false,
  capacity_verified: false,
  avatar_path: null,
  avatar_style: 'male',
  availability: null,
  sector_tags: ['Energy transition', 'Health', 'Tourism'],
  vision_themes: ['Thriving economy', 'Vibrant society', 'Renewable energy'],
}

const room: MemberRoom = {
  userId,
  email,
  staffRole: null,
  member,
  profile,
  reload: async () => {},
}

const root = document.getElementById('root')
if (!root) throw new Error('missing root')

createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/dashboard/profile#profile-tags']}>
      <MemberContext.Provider value={room}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel={email}
          accountMark={<Avatar src={null} avatarStyle="male" size={36} alt="" />}
        >
          <ProfilePage />
        </AppShell>
      </MemberContext.Provider>
    </MemoryRouter>
  </StrictMode>,
)
