import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import type { DirectoryCard } from '../../src/lib/demoRows'
import type { RoomCard } from '../../src/lib/demoRows'
import type { MemberDealRoom } from '../../src/lib/dealRoomView'
import { emptyMemberSeatDraft } from '../../src/lib/memberBoardSeats'
import { AppShell } from '../../src/shell/AppShell'
import { peopleSections } from '../../src/pages/admin/peopleSections'
import {
  MEMBER_DESTINATIONS,
  MEMBER_SECONDARY,
  MEMBER_SECTIONS,
  STAFF_DESTINATIONS,
  STAFF_SECONDARY,
  STAFF_SECTIONS,
  type SectionLink,
} from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import { CardSkeleton, EmptyState, ErrorBanner } from '../../src/shell/ViewState'
import { MEMBER_VIEWS } from '../../src/shell/viewCopy'
import { DealRoomsView, YourRooms } from '../../src/pages/dashboard/DealRoomsView'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
import { DirectoryEmpty } from '../../src/pages/dashboard/DirectoryEmpty'
import { MemberBoardSeatForm } from '../../src/pages/dashboard/MemberBoardSeatsView'
import { RoomsBoard } from '../../src/pages/dashboard/RoomsBoard'
import './smoke.css'

const ROOM = 'a3000001-0000-4000-8000-000000000010'
const OWNER = 'a1000001-0000-4000-8000-000000000001'

const peer: DirectoryCard = {
  id: 'a1000001-0000-4000-8000-000000000011',
  is_demo: false,
  full_name: 'Example Peer',
  headline: 'Chair, Example House',
  company: 'Example House',
  location: 'Riyadh',
  city_key: 'riyadh',
  about: 'A sample card. Email and phone stay off this page.',
  sector: 'Energy transition',
  sectors: ['Energy transition', 'Industrials and manufacturing'],
  vision_themes: ['Thriving economy'],
  availability: 'open',
  seat: 'intl',
  preferred_partner: true,
  portrait_asset: null,
  avatar_path: null,
  avatar_style: 'female',
  membership_status: 'active',
  board_roles: [{ role: 'Chair', orgType: 'Private', organisation: 'Example Holdings' }],
  open_to_board_seats: true,
  seat_types: ['Independent director'],
  seat_where: ['Saudi Arabia', 'GCC'],
  expertise: ['Governance', 'Strategy'],
  can_help_with: ['Board experience', 'Deal introductions'],
  looking_for: ['Co-investors'],
  can_help_line: 'A short sample line about board work.',
  looking_for_line: 'Looking for a co-investor on a sample mandate.',
  languages: ['English', 'Arabic'],
}

const sample: DirectoryCard = {
  ...peer,
  id: 'a1000001-0000-4000-8000-000000000013',
  is_demo: true,
  full_name: 'Example Sample',
  preferred_partner: false,
  membership_status: 'active',
}

const invited: DirectoryCard = {
  ...peer,
  id: 'a1000001-0000-4000-8000-000000000012',
  full_name: 'Example Guest',
  headline: 'Director',
  company: 'Example Guest House',
  preferred_partner: false,
  membership_status: 'invited',
  is_demo: false,
  availability: 'selective',
  open_to_board_seats: false,
  board_roles: [],
  expertise: [],
  can_help_with: [],
  looking_for: [],
  can_help_line: '',
  looking_for_line: '',
  languages: [],
  about: '',
}

const memberRoom: MemberDealRoom = {
  id: ROOM,
  name: 'Example logistics room',
  purpose: 'A private room for a sample logistics mandate.',
  status: 'open',
  openedBy: 'member',
  ownerMemberId: OWNER,
  mandateId: null,
  reOpportunityId: null,
  createdAt: '2026-10-02T12:00:00.000Z',
  myRole: 'owner',
  myInviteStatus: 'accepted',
  participants: [
    { memberId: OWNER, role: 'owner', inviteStatus: 'accepted', fullName: 'Example Member' },
    {
      memberId: 'a1000001-0000-4000-8000-000000000002',
      role: 'member',
      inviteStatus: 'invited',
      fullName: 'Example Peer',
    },
  ],
}

const adminRoom: RoomCard = {
  id: 'a3000001-0000-4000-8000-000000000020',
  is_demo: true,
  name: 'Example industrial room',
  summary: 'A sample room opened by our admin team for an industrial services mandate.',
  sector: 'Industrials and manufacturing',
  stage: 'Diligence',
  member_count: 4,
  host_name: 'Example Host',
}

const draft = {
  ...emptyMemberSeatDraft(),
  title: 'Independent director',
  organisationName: 'Example Holdings',
  sector: 'Health',
  capacity: 'Four meetings a year.',
  sectorTags: ['Health', 'Financial services'],
  regions: ['Riyadh'],
  terms: 'Independent seat. Four meetings a year.',
  narrative: 'Example Holdings is a fictional company. This seat is an illustration.',
}

type ViewName = 'directory' | 'rooms' | 'seat' | 'tabs'
type StateName = 'ready' | 'empty' | 'error' | 'loading'

function param(name: string, fallback: string) {
  return new URLSearchParams(window.location.search).get(name) || fallback
}

function viewName(): ViewName {
  const value = param('view', 'directory')
  if (value === 'rooms' || value === 'seat' || value === 'tabs') return value
  return 'directory'
}

const HUBS: Record<
  string,
  { tone: 'member' | 'staff'; path: string; label: string; sections: readonly SectionLink[]; title: string }
> = {
  people: {
    tone: 'member',
    path: '/dashboard/people/directory',
    label: 'People sections',
    sections: MEMBER_SECTIONS.people ?? [],
    title: 'Directory',
  },
  majlis: {
    tone: 'member',
    path: '/dashboard/majlis',
    label: 'Majlis sections',
    sections: MEMBER_SECTIONS.majlis ?? [],
    title: 'Majlis',
  },
  ai: {
    tone: 'member',
    path: '/dashboard/ai',
    label: 'AI tools sections',
    sections: MEMBER_SECTIONS.ai ?? [],
    title: 'AI tools',
  },
  'staff-people': {
    tone: 'staff',
    path: '/admin/people',
    label: 'People sections',
    sections: peopleSections(),
    title: 'People',
  },
  'staff-majlis': {
    tone: 'staff',
    path: '/admin/majlis',
    label: 'Majlis sections',
    sections: STAFF_SECTIONS.majlis ?? [],
    title: 'Majlis',
  },
}

function stateName(): StateName {
  const value = param('state', 'ready')
  if (value === 'empty' || value === 'error' || value === 'loading') return value
  return 'ready'
}

function DirectoryScreen({ state }: { state: StateName }) {
  if (state === 'loading') {
    return (
      <div className="max-w-3xl" data-read-floor="">
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Directory</h1>
        <div className="mt-8">
          <CardSkeleton tone="member" label="Loading directory" />
        </div>
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="max-w-3xl" data-read-floor="">
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Directory</h1>
        <div className="mt-8">
          <ErrorBanner
            tone="member"
            message={MEMBER_VIEWS.directory.error}
            retryLabel={MEMBER_VIEWS.directory.retry}
            onRetry={() => {}}
          />
        </div>
      </div>
    )
  }
  if (state === 'empty') {
    return <DirectoryEmpty seat={{ status: 'ready', admitted: 1 }} profileReady={false} invitesRemaining={2} onRetry={() => {}} />
  }
  return (
    <DirectoryBoard
      cards={[peer, invited, sample]}
      seat={{ status: 'ready', admitted: 12 }}
      viewerLookingFor={['Co-investors']}
      quota={{ used: 1, base: 5, allowance: 5, remaining: 4 }}
      onRequestIntro={() => {}}
    />
  )
}

function RoomsScreen({ state }: { state: StateName }) {
  const yours =
    state === 'loading' ? (
      <CardSkeleton tone="member" label="Loading your rooms" />
    ) : state === 'error' ? (
      <ErrorBanner tone="member" message={MEMBER_VIEWS.rooms.error} retryLabel={MEMBER_VIEWS.rooms.retry} onRetry={() => {}} />
    ) : state === 'empty' ? (
      <YourRooms rooms={[]} />
    ) : (
      <YourRooms rooms={[memberRoom]} />
    )
  const opened =
    state === 'loading' ? (
      <CardSkeleton tone="member" label="Loading rooms" />
    ) : state === 'error' ? (
      <ErrorBanner tone="member" message={MEMBER_VIEWS.rooms.error} retryLabel={MEMBER_VIEWS.rooms.retry} onRetry={() => {}} />
    ) : state === 'empty' ? (
      <EmptyState tone="member" message="A deal room opens for a live mandate, and only by our admin team. None are open." />
    ) : (
      <RoomsBoard rooms={[adminRoom]} embedded />
    )
  return <DealRoomsView showCreate={state === 'ready'} yours={yours} openedByAdmin={opened} />
}

function SeatScreen({ state }: { state: StateName }) {
  return (
    <MemberBoardSeatForm
      draft={draft}
      message={state === 'error' ? 'Add a title before you submit.' : ''}
      busy={state === 'loading'}
      onDraft={() => {}}
      onSubmit={() => {}}
    />
  )
}

function Screen({ view, state }: { view: ViewName; state: StateName }) {
  if (view === 'rooms') {
    return (
      <>
        <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
        <div className="mt-6">
          <RoomsScreen state={state} />
        </div>
      </>
    )
  }
  if (view === 'seat') {
    return (
      <>
        <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
        <div className="mt-6">
          <SeatScreen state={state} />
        </div>
      </>
    )
  }
  return (
    <>
      <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
      <div className="mt-6">
        <DirectoryScreen state={state} />
      </div>
    </>
  )
}

const view = viewName()
const state = stateName()
const hub = HUBS[param('hub', 'people')] ?? HUBS.people
const path =
  view === 'tabs'
    ? hub.path
    : view === 'rooms'
      ? '/dashboard/deals/rooms'
      : view === 'seat'
        ? '/dashboard/deals/board-seats/new'
        : '/dashboard/people/directory'
const staff = view === 'tabs' && hub.tone === 'staff'

const root = document.getElementById('root')
if (!root) throw new Error('missing root')

createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone={staff ? 'staff' : 'member'}
        destinations={staff ? STAFF_DESTINATIONS : MEMBER_DESTINATIONS}
        secondary={staff ? STAFF_SECONDARY : MEMBER_SECONDARY}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel={staff ? 'Admin' : 'Member'}
        accountName="Example Member"
        accountMark={<Avatar src={null} avatarStyle="male" size={36} alt="" />}
      >
        {view === 'tabs' ? (
          <>
            <SectionTabs label={hub.label} sections={hub.sections} />
            <div className="mt-6 max-w-3xl">
              <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">{hub.title}</h1>
              <p className="mt-3 max-w-xl text-[1rem] leading-relaxed">Section tabs for this hub.</p>
            </div>
          </>
        ) : (
          <Screen view={view} state={state} />
        )}
      </AppShell>
    </MemoryRouter>
  </StrictMode>,
)
