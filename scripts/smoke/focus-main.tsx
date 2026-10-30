import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import type { DirectoryCard } from '../../src/lib/demoRows'
import type { IntroSuggestion } from '../../src/lib/introSuggestions'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
import { IntroSuggestions } from '../../src/pages/dashboard/IntroSuggestions'
import { ProfilePage } from '../../src/pages/dashboard/ProfilePage'
import { ProfileSaveBar } from '../../src/pages/dashboard/ProfileSaveBar'
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

const emptyFocus: Pick<
  ProfileRow,
  'can_help_with' | 'can_help_line' | 'looking_for' | 'looking_for_line' | 'languages'
> = {
  can_help_with: [],
  can_help_line: '',
  looking_for: [],
  looking_for_line: '',
  languages: [],
}

const profile: ProfileRow = {
  user_id: userId,
  full_name: 'Example Member',
  headline: 'Independent chair',
  company: 'Example House',
  location: 'Riyadh',
  city_key: 'riyadh',
  linkedin_url: null,
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
  sector_tags: ['Real estate', 'Health'],
  vision_themes: ['Thriving economy'],
  ...emptyFocus,
  can_help_with: ['Deal introductions', 'Board experience'],
  can_help_line: 'Example. Introductions to operators in this sector.',
  looking_for: ['Co-investors'],
  looking_for_line: 'Example. A board seat with a family company.',
  languages: ['English', 'Arabic'],
}

const openProfile: ProfileRow = {
  ...profile,
  ...emptyFocus,
}

const roomFor = (next: ProfileRow): MemberRoom => ({
  userId,
  email,
  staffRole: null,
  member,
  profile: next,
  reload: async () => undefined,
})

const emptyBoardroom = {
  roles: [],
  openToSeats: false,
  seatTypes: [],
  seatWhere: [],
  expertise: [],
  applicationRegion: null,
  applicationBoardSeats: null,
}

const directoryCard: DirectoryCard = {
  id: 'example-directory-card',
  is_demo: false,
  full_name: 'Example Director',
  headline: 'Independent chair',
  company: 'Example House',
  location: 'Riyadh',
  city_key: 'riyadh',
  about: 'Example. Independent chair across family holdings.',
  sector: 'Real estate',
  sectors: ['Real estate'],
  vision_themes: ['Housing'],
  availability: 'open',
  seat: 'ksa',
  preferred_partner: false,
  portrait_asset: null,
  avatar_path: null,
  avatar_style: 'male',
  membership_status: 'active',
  can_help_with: ['Deal introductions', 'Board experience'],
  looking_for: ['Board seat'],
  can_help_line: 'Example. Introductions to operators in this sector.',
  looking_for_line: 'Example. A board seat with a family company.',
  languages: ['English', 'Arabic', 'French', 'Urdu', 'Hindi'],
}

const suggestion: IntroSuggestion = {
  id: 'example-suggestion',
  suggested_id: 'example-director',
  full_name: 'Example Director',
  headline: 'Independent chair',
  company: 'Example House',
  location: 'Riyadh',
  reason: 'They can help with deal introductions, which you are looking for.',
  avatar_style: 'male',
  avatar_path: null,
}

const view = new URLSearchParams(window.location.search).get('view') || 'focus'
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

function profileView(next: ProfileRow, hash: string) {
  return (
    <MemoryRouter initialEntries={[`/dashboard/profile${hash}`]}>
      <MemberContext.Provider value={roomFor(next)}>
        <AppShell {...shell}>
          <ProfilePage boardroomPreview={emptyBoardroom} />
        </AppShell>
      </MemberContext.Provider>
    </MemoryRouter>
  )
}

createRoot(root).render(
  <StrictMode>
    {view === 'completeness' ? profileView(openProfile, '') : null}
    {view === 'focus' ? profileView(profile, '#focus') : null}
    {view === 'directory' ? (
      <MemoryRouter initialEntries={['/dashboard/people/directory']}>
        <AppShell {...shell}>
          <DirectoryBoard
            cards={[directoryCard]}
            seat={{ status: 'ready', admitted: 2 }}
            selfId="example-viewer"
            viewerLookingFor={['Deal flow']}
            onRequestIntro={() => undefined}
          />
        </AppShell>
      </MemoryRouter>
    ) : null}
    {view === 'save' ? (
      <MemoryRouter initialEntries={['/dashboard/profile']}>
        <AppShell {...shell}>
          <div className="max-w-xl space-y-4">
            <ProfileSaveBar mode="dirty" fixed={false} />
            <ProfileSaveBar mode="saving" fixed={false} />
            <ProfileSaveBar mode="saved" fixed={false} />
            <ProfileSaveBar mode="error" fixed={false} />
          </div>
        </AppShell>
      </MemoryRouter>
    ) : null}
    {view === 'suggestion' ? (
      <MemoryRouter initialEntries={['/dashboard/people/intros']}>
        <AppShell {...shell}>
          <IntroSuggestions
            rows={[suggestion]}
            quota={null}
            introStatus={() => null}
            busyId={null}
            errorId={null}
            error=""
            onRequest={() => undefined}
          />
        </AppShell>
      </MemoryRouter>
    ) : null}
  </StrictMode>,
)
