import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import { adminSeatMatchState } from '../../src/lib/boardroom'
import type { DirectoryCard } from '../../src/lib/demoRows'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import { SeatMatchChip } from '../../src/pages/admin/SeatMatchChip'
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
  location: 'Riyadh',
  city_key: 'riyadh',
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
  sector_tags: ['Real estate'],
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

const emptyBoardroom = {
  roles: [],
  openToSeats: false,
  seatTypes: [],
  seatWhere: [],
  expertise: [],
  applicationRegion: null,
  applicationBoardSeats: null,
}

const filledBoardroom = {
  roles: [
    { organisation: 'Example Holdings', role: 'Chair' as const, orgType: 'Private' as const },
    { organisation: 'Example Trust', role: 'Independent director' as const, orgType: 'Non-profit' as const },
  ],
  openToSeats: true,
  seatTypes: ['Independent director' as const, 'Committee: Audit' as const],
  seatWhere: ['Saudi Arabia' as const, 'GCC' as const],
  expertise: ['Governance' as const, 'Strategy' as const],
  applicationRegion: null,
  applicationBoardSeats: 'Example Holdings, chair',
}

const offerBoardroom = {
  ...emptyBoardroom,
  applicationRegion: 'ksa_gcc' as const,
  applicationBoardSeats: 'Example Holdings, chair',
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
  board_roles: filledBoardroom.roles,
  open_to_board_seats: true,
  seat_types: filledBoardroom.seatTypes,
  seat_where: filledBoardroom.seatWhere,
  expertise: filledBoardroom.expertise,
}

const view = new URLSearchParams(window.location.search).get('view') || 'profile-empty'
const root = document.getElementById('root')
if (!root) throw new Error('missing root')

const shell = {
  tone: 'member' as const,
  destinations: MEMBER_DESTINATIONS,
  secondary: MEMBER_SECONDARY,
  updatedLabel: 'Updated 09:41',
  roleSwitch: null,
  onSignOut: () => undefined,
  accountLabel: email,
  accountMark: <Avatar src={null} avatarStyle="male" size={36} alt="" />,
}

function profileView(kind: 'empty' | 'filled' | 'offer') {
  const boardroom = kind === 'filled' ? filledBoardroom : kind === 'offer' ? offerBoardroom : emptyBoardroom
  return (
    <MemoryRouter initialEntries={['/dashboard/profile#boardroom']}>
      <MemberContext.Provider value={room}>
        <AppShell {...shell}>
          <ProfilePage boardroomPreview={boardroom} />
        </AppShell>
      </MemberContext.Provider>
    </MemoryRouter>
  )
}

createRoot(root).render(
  <StrictMode>
    {view === 'profile-empty' ? profileView('empty') : null}
    {view === 'profile-filled' ? profileView('filled') : null}
    {view === 'profile-offer' ? profileView('offer') : null}
    {view === 'profile-error' ? (
      <MemoryRouter initialEntries={['/dashboard/profile#boardroom']}>
        <MemberContext.Provider value={room}>
          <AppShell {...shell}>
            <ProfilePage />
          </AppShell>
        </MemberContext.Provider>
      </MemoryRouter>
    ) : null}
    {view === 'directory' ? (
      <MemoryRouter initialEntries={['/dashboard/people/directory']}>
        <AppShell {...shell}>
          <DirectoryBoard
            cards={[directoryCard]}
            seat={{ status: 'ready', admitted: 2 }}
            selfId="example-viewer"
            onRequestIntro={() => undefined}
          />
        </AppShell>
      </MemoryRouter>
    ) : null}
    {view === 'admin' ? (
      <MemoryRouter initialEntries={['/admin/people']}>
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Admin"
        >
          <div className="max-w-3xl">
            <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Profiles</h1>
            <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/60">
              Seat match uses the same rule as the profile row. Example rows only.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { name: 'Example Member', on: adminSeatMatchState('Independent director', 'Saudi Arabia') },
                { name: 'Example Director', on: adminSeatMatchState('', '') },
              ].map((row) => (
                <li key={row.name} className="border border-[var(--ba-line)] bg-white px-4 py-4 text-ink">
                  <p className="font-display text-[1.2rem] font-semibold">{row.name}</p>
                  <p className="mt-1 text-[0.9rem] text-ink/60">Saudi Arabia, Active</p>
                  <div className="mt-3">
                    <SeatMatchChip on={row.on} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </AppShell>
      </MemoryRouter>
    ) : null}
  </StrictMode>,
)
