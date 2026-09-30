import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { Avatar } from '../../src/components/Avatar'
import { ProfilePage } from '../../src/pages/dashboard/ProfilePage'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const userId = '00000000-0000-4000-8000-000000000001'
const email = 'member@example.com'
const params = new URLSearchParams(window.location.search)
const withPhoto = params.get('photo') === '1'
const sponsor = params.get('sponsor') === '1'
const photoSrc = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#4b3f9a"/><circle cx="64" cy="48" r="22" fill="#f4efe6"/><ellipse cx="64" cy="112" rx="40" ry="28" fill="#f4efe6"/></svg>`,
)}`

const member: MemberRow = {
  user_id: userId,
  email,
  seat: sponsor ? 'sponsor' : 'ksa',
  status: 'active',
  must_set_password: false,
  invites_remaining: 2,
  invites_granted: 2,
}

const profile: ProfileRow = {
  user_id: userId,
  full_name: sponsor ? 'Example Sponsor' : 'Example Member',
  headline: 'Independent chair',
  company: 'Example House',
  location: 'Riyadh',
  linkedin_url: null,
  bio: null,
  phone: null,
  investable_capacity_usd: null,
  fo_aum_usd: null,
  turnover_usd: null,
  capacity_currency: null,
  include_in_public_aggregates: false,
  capacity_verified: false,
  avatar_path: withPhoto ? `${userId}/avatar` : null,
  avatar_style: sponsor ? 'female' : 'male',
  availability: 'selective',
  sector_tags: ['Health', 'Energy transition'],
  vision_themes: ['Health transformation', 'Thriving economy'],
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
    <MemoryRouter initialEntries={['/dashboard/profile']}>
      <MemberContext.Provider value={room}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel={email}
          accountMark={
            <Avatar
              src={withPhoto ? photoSrc : null}
              avatarStyle={sponsor ? 'female' : 'male'}
              size={36}
              alt=""
            />
          }
        >
          <ProfilePage preview={{ src: withPhoto ? photoSrc : null }} />
        </AppShell>
      </MemberContext.Provider>
    </MemoryRouter>
  </StrictMode>,
)
