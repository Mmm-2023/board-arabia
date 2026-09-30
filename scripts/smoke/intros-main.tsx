import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { DirectoryCard } from '../../src/lib/demoRows'
import type { IntroRow } from '../../src/lib/memberIntros'
import { Avatar } from '../../src/components/Avatar'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
import { IntroBoard } from '../../src/pages/dashboard/IntroBoard'
import { AppShell } from '../../src/shell/AppShell'
import {
  MEMBER_ACCOUNT,
  MEMBER_DESTINATIONS,
  MEMBER_SECTIONS,
  STAFF_DESTINATIONS,
  STAFF_SECONDARY,
} from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import '../../src/index.css'

const params = new URLSearchParams(window.location.search)
const view = params.get('view') || 'directory'

const selfId = '11111111-1111-4111-8111-111111111111'
const liveId = '22222222-2222-4222-8222-222222222222'

function directoryCard(partial: Partial<DirectoryCard> & Pick<DirectoryCard, 'id' | 'full_name' | 'is_demo'>): DirectoryCard {
  return {
    headline: 'Independent director',
    company: 'Harbi Seat',
    location: 'Riyadh',
    sector: 'Energy transition',
    sectors: ['Energy transition'],
    vision_themes: [],
    availability: 'open',
    seat: 'ksa',
    portrait_asset: null,
    avatar_path: null,
    avatar_style: 'male',
    ...partial,
  }
}

const cards: DirectoryCard[] = [
  directoryCard({
    id: 'a1000001-0000-4000-8000-000000000001',
    is_demo: true,
    full_name: 'Layla Al-Nadira',
    headline: 'Independent chair',
    company: 'Nadira Family Office',
    portrait_asset: '/demo/portraits/nadira.svg',
  }),
  directoryCard({
    id: liveId,
    is_demo: false,
    full_name: 'Amina Al-Harbi',
    avatar_style: 'female',
    headline: 'Non-executive director',
    company: 'Harbi Seat',
    availability: 'selective',
  }),
]

const memberRows: IntroRow[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'member',
    direction: 'incoming',
    status: 'pending',
    title: 'Omar Al-Janub',
    detail: 'Chair advisor · Janub Board Practice · Abha',
    reason: 'A question on a mining board seat.',
    is_demo: false,
    subject_id: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-09-29T09:15:00.000Z',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    kind: 'member',
    direction: 'outgoing',
    status: 'pending',
    title: 'Amina Al-Harbi',
    detail: 'Non-executive director · Harbi Seat · Riyadh',
    reason: 'Shared work on an energy brief.',
    is_demo: false,
    subject_id: liveId,
    created_at: '2026-09-29T08:40:00.000Z',
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    kind: 'mandate',
    direction: 'outgoing',
    status: 'pending',
    title: 'Energy transition · Growth equity',
    detail: 'KSA',
    reason: '',
    is_demo: true,
    subject_id: 'a2000001-0000-4000-8000-000000000001',
    created_at: '2026-09-28T14:00:00.000Z',
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    kind: 'real_estate',
    direction: 'outgoing',
    status: 'approved',
    title: 'Logistics · Jeddah',
    detail: 'industrial',
    reason: '',
    is_demo: false,
    subject_id: '88888888-8888-4888-8888-888888888888',
    created_at: '2026-09-27T11:05:00.000Z',
  },
]

const staffRows: IntroRow[] = [
  {
    ...memberRows[0],
    title: 'Omar Al-Janub',
    detail: '',
    requester_name: 'Amina Al-Harbi',
    target_name: 'Omar Al-Janub',
  },
  {
    ...memberRows[2],
    is_demo: false,
    title: 'Nahla Industrial Holding',
    detail: 'Energy transition · Growth equity',
    requester_name: 'Member name',
  },
  {
    id: '99999999-9999-4999-8999-999999999999',
    kind: 'mandate',
    direction: 'outgoing',
    status: 'pending',
    title: 'Sample brief',
    detail: 'Health · Acquisition',
    reason: '',
    is_demo: true,
    subject_id: 'a2000001-0000-4000-8000-000000000002',
    created_at: '2026-09-26T10:00:00.000Z',
    requester_name: 'Member name',
  },
]

function MemberShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Account"
        accountName="Member name"
        accountMark={<Avatar src={null} avatarStyle="male" size={36} alt="" />}
      >
        <div data-preview="">
          <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
          <div className="mt-6">{children}</div>
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

function StaffShell({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/admin/people/intros']}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Account"
        accountName="Desk"
        accountMark={<Avatar src={null} avatarStyle="female" size={36} alt="" />}
      >
        <div data-preview="">{children}</div>
      </AppShell>
    </MemoryRouter>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    view === 'admin' ? (
      <StaffShell>
        <div className="max-w-3xl">
          <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Intros</h1>
          <p className="mt-2 max-w-2xl text-[0.95rem] text-stone/65">
            Every intro request and its status. Members accept or decline a warm introduction. Mandate and real estate unlocks are still approved here.
          </p>
          <div className="mt-8">
            <IntroBoard tone="staff" rows={staffRows} busyId={null} error="" onDecide={() => {}} />
          </div>
        </div>
      </StaffShell>
    ) : view === 'intros' ? (
      <MemberShell path="/dashboard/people/intros">
        <div className="max-w-3xl">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Intros</p>
          <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Intros</h1>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
            Requests you sent, and requests sent to you. Mandate and real estate unlocks are in this list too.
          </p>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
            Email and phone are not shared. After someone accepts, you still see only the directory card.
          </p>
          <div className="mt-8">
            <IntroBoard tone="member" rows={memberRows} busyId={null} error="" onRespond={() => {}} />
          </div>
        </div>
      </MemberShell>
    ) : (
      <MemberShell path="/dashboard/people/directory">
        <DirectoryBoard
          cards={cards}
          seat={{ status: 'ready', admitted: 1 }}
          selfId={selfId}
          onRequestIntro={() => {}}
        />
      </MemberShell>
    ),
  )
}
