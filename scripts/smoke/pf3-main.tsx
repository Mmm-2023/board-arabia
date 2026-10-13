import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import type { DirectoryCard } from '../../src/lib/demoRows'
import { emptyNewMandate } from '../../src/lib/newMandate'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import { AdminMandatesView } from '../../src/pages/admin/AdminMandatesView'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
import { ProfilePage } from '../../src/pages/dashboard/ProfilePage'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
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
  full_name: 'Example Member',
  headline: 'Independent chair',
  company: 'Example House',
  location: 'Abha',
  city_key: 'other',
  linkedin_url: 'https://www.linkedin.com/in/example-member',
  bio: 'Example member. Board work across family holdings.',
  phone: '',
  investable_capacity_usd: null,
  fo_aum_usd: null,
  turnover_usd: null,
  capacity_currency: null,
  include_in_public_aggregates: false,
  capacity_verified: false,
  avatar_path: null,
  avatar_style: 'male',
  availability: 'open',
  sector_tags: ['Real estate', 'Health', 'Tourism'],
  vision_themes: ['Thriving economy'],
}

const room: MemberRoom = {
  userId,
  email,
  staffRole: null,
  member,
  profile,
  reload: async () => undefined,
}

const directoryCard: DirectoryCard = {
  id: 'example-directory-card',
  is_demo: false,
  full_name: 'Example Member',
  headline: 'Independent chair',
  company: 'Example House',
  location: 'Riyadh',
  city_key: 'riyadh',
  about: 'Example. Independent chair across family holdings.',
  sector: 'Real estate',
  sectors: ['Real estate'],
  vision_themes: ['Thriving economy'],
  availability: 'open',
  seat: 'ksa',
  preferred_partner: false,
  portrait_asset: null,
  avatar_path: null,
  avatar_style: 'male',
  membership_status: 'active',
}

const view = new URLSearchParams(window.location.search).get('view') || 'profile'
const root = document.getElementById('root')
if (!root) throw new Error('missing root')

createRoot(root).render(
  <StrictMode>
    {view === 'admin' ? (
      <MemoryRouter initialEntries={['/admin/mandates']}>
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Admin"
        >
          <AdminMandatesView
            mandates={[]}
            draft={emptyNewMandate()}
            field=""
            message=""
            notice=""
            busy={false}
            onDraft={() => undefined}
            onSubmit={() => undefined}
          />
        </AppShell>
      </MemoryRouter>
    ) : null}
    {view === 'directory' ? (
      <MemoryRouter initialEntries={['/dashboard/people/directory']}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel={email}
          accountMark={<Avatar src={null} avatarStyle="male" size={36} alt="" />}
        >
          <DirectoryBoard
            cards={[directoryCard]}
            seat={{ status: 'ready', admitted: 2 }}
            selfId="example-viewer"
            onRequestIntro={() => undefined}
          />
        </AppShell>
      </MemoryRouter>
    ) : null}
    {view === 'profile' ? (
      <MemoryRouter initialEntries={['/dashboard/profile']}>
        <MemberContext.Provider value={room}>
          <AppShell
            tone="member"
            destinations={MEMBER_DESTINATIONS}
            secondary={MEMBER_SECONDARY}
            updatedLabel="Updated 09:41"
            roleSwitch={null}
            onSignOut={() => undefined}
            accountLabel={email}
            accountMark={<Avatar src={null} avatarStyle="male" size={36} alt="" />}
          >
            <ProfilePage />
          </AppShell>
        </MemberContext.Provider>
      </MemoryRouter>
    ) : null}
  </StrictMode>,
)
