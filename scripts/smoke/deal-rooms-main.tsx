import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { DirectoryInvitee, MemberDealRoom, StaffDealRoom, SubjectOption } from '../../src/lib/dealRoomView'
import { StaffRoomsBoard } from '../../src/pages/admin/StaffRoomsBoard'
import { CreateRoomForm } from '../../src/pages/dashboard/CreateRoomForm'
import { DealRoomPanel } from '../../src/pages/dashboard/DealRoomPanel'
import { PendingInviteCards } from '../../src/pages/dashboard/PendingInviteCards'
import { AppShell } from '../../src/shell/AppShell'
import {
  MEMBER_DESTINATIONS,
  MEMBER_SECONDARY,
  STAFF_DESTINATIONS,
  STAFF_SECONDARY,
} from '../../src/shell/destinations'
import './smoke.css'

const OWNER = 'a1000001-0000-4000-8000-000000000001'
const GUEST = 'a1000001-0000-4000-8000-000000000002'
const SPONSOR = 'a1000001-0000-4000-8000-000000000009'
const OTHER = 'a1000001-0000-4000-8000-000000000004'
const ROOM = 'a3000001-0000-4000-8000-000000000010'
const MANDATE = 'a2000001-0000-4000-8000-000000000001'
const OPP = 'b1000001-0000-4000-8000-000000000001'

const mandates: SubjectOption[] = [
  { id: MANDATE, label: 'Logistics: Growth capital for a Saudi freight platform.' },
]
const opportunities: SubjectOption[] = [{ id: OPP, label: 'Jeddah: A logistics yard beside the port.' }]

const invitees: DirectoryInvitee[] = [
  {
    id: OTHER,
    fullName: 'Hanan Al-Safi',
    headline: 'Family principal',
    company: 'Safi House',
    seat: 'ksa',
  },
  {
    id: 'a1000001-0000-4000-8000-00000000000a',
    fullName: 'Huda Al-Sadu',
    headline: 'Sponsor',
    company: 'Sadu Sponsor Desk',
    seat: 'sponsor',
  },
]

const managed: MemberDealRoom = {
  id: ROOM,
  name: 'North logistics room',
  purpose: 'A private room for a logistics mandate.',
  status: 'open',
  openedBy: 'member',
  ownerMemberId: OWNER,
  mandateId: MANDATE,
  reOpportunityId: null,
  createdAt: '2026-10-02T12:00:00.000Z',
  myRole: 'owner',
  myInviteStatus: 'accepted',
  participants: [
    { memberId: OWNER, role: 'owner', inviteStatus: 'accepted', fullName: 'Layla Al-Nadira' },
    { memberId: GUEST, role: 'member', inviteStatus: 'invited', fullName: 'Noura Al-Wahat' },
    { memberId: SPONSOR, role: 'member', inviteStatus: 'declined', fullName: 'Amal Al-Bayt' },
  ],
}

const inviteRoom: MemberDealRoom = {
  ...managed,
  myRole: 'member',
  myInviteStatus: 'invited',
}

const staffRooms: StaffDealRoom[] = [
  {
    id: ROOM,
    name: 'North logistics room',
    purpose: 'A private room for a logistics mandate.',
    status: 'open',
    openedBy: 'member',
    acceptedCount: 1,
    invitedCount: 1,
  },
  {
    id: 'a3000001-0000-4000-8000-000000000011',
    name: 'Industrial services room',
    purpose: 'A working room for a growth brief in industrial services.',
    status: 'open',
    openedBy: 'admin',
    acceptedCount: 4,
    invitedCount: 0,
  },
  {
    id: 'a3000001-0000-4000-8000-000000000012',
    name: 'West coast clinics room',
    purpose: 'A working room for an acquisition brief in private care.',
    status: 'closed',
    openedBy: 'admin',
    acceptedCount: 3,
    invitedCount: 0,
  },
]

const noop = () => {}
const view = new URLSearchParams(window.location.search).get('view') || 'create'

function MemberShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={noop}
        accountLabel="Example member"
      >
        <div data-preview={view}>{children}</div>
      </AppShell>
    </MemoryRouter>
  )
}

function StaffShell({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/admin/rooms']}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={noop}
        accountLabel="Example staff"
      >
        <div data-preview={view}>{children}</div>
      </AppShell>
    </MemoryRouter>
  )
}

function screen() {
  if (view === 'invite') {
    return (
      <MemberShell path="/dashboard/rooms/north">
        <DealRoomPanel
          room={managed}
          mandates={mandates}
          opportunities={opportunities}
          inviteQuery="Al"
          invitees={invitees}
          inviteStatus="ready"
          inviteMessage=""
          actionError=""
          busy={false}
          onRename={noop}
          onSearch={noop}
          onInvite={noop}
          onRemove={noop}
          onClose={noop}
          onArchive={noop}
          onAccept={noop}
          onDecline={noop}
        />
      </MemberShell>
    )
  }
  if (view === 'manage') {
    return (
      <MemberShell path="/dashboard/rooms/north">
        <DealRoomPanel
          room={managed}
          mandates={mandates}
          opportunities={opportunities}
          inviteQuery=""
          invitees={[]}
          inviteStatus="idle"
          inviteMessage=""
          actionError=""
          busy={false}
          onRename={noop}
          onSearch={noop}
          onInvite={noop}
          onRemove={noop}
          onClose={noop}
          onArchive={noop}
          onAccept={noop}
          onDecline={noop}
        />
      </MemberShell>
    )
  }
  if (view === 'accept') {
    return (
      <MemberShell path="/dashboard">
        <div className="max-w-3xl">
          <section aria-label="Identity" className="border border-[var(--ba-line)] bg-white px-4 py-4 md:px-5">
            <p className="hidden text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase md:block">Home</p>
            <h1 className="font-display text-2xl font-bold tracking-[-0.04em] md:mt-1 md:text-[2.4rem]">Noura Al-Wahat</h1>
            <p className="mt-2 text-[0.95rem] text-ink/60">Founding seat · Saudi Arabia</p>
          </section>
          <section aria-label="Needs attention" className="mt-5 md:mt-8">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">Needs attention</h2>
            <div className="mt-3">
              <PendingInviteCards
                invites={[inviteRoom]}
                busyId={null}
                errors={{}}
                onAccept={noop}
                onDecline={noop}
              />
            </div>
          </section>
        </div>
      </MemberShell>
    )
  }
  if (view === 'staff') {
    return (
      <StaffShell>
        <StaffRoomsBoard rooms={staffRooms} busyId={null} error="" onClose={noop} />
      </StaffShell>
    )
  }
  return (
    <MemberShell path="/dashboard/rooms/new">
      <CreateRoomForm
        name="North logistics room"
        purpose="A private room for a logistics mandate."
        subjectKind="mandate"
        mandateId={MANDATE}
        reOpportunityId=""
        mandates={mandates}
        opportunities={opportunities}
        mandatesNote={null}
        opportunitiesNote={null}
        busy={false}
        error=""
        onName={noop}
        onPurpose={noop}
        onSubjectKind={noop}
        onMandateId={noop}
        onReOpportunityId={noop}
        onSubmit={noop}
      />
    </MemberShell>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(screen())
