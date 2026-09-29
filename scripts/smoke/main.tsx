import { StrictMode, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Nav } from '../../src/components/Nav'
import { TrustedPartnersGallery } from '../../src/components/TrustedPartners'
import type { DirectoryCard, PartnerCard, RoomCard } from '../../src/lib/demoRows'
import type { MandateClear } from '../../src/lib/mandateRedaction'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
import { MandateCard } from '../../src/pages/dashboard/MandateCard'
import { RoomsBoard } from '../../src/pages/dashboard/RoomsBoard'
import { SponsorInvitePanel } from '../../src/pages/admin/SponsorInvitePanel'
import { DashboardHome } from '../../src/pages/dashboard/DashboardHome'
import { DashboardStatusContext, MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import type { ProfileRow } from '../../src/lib/member'
import { AppShell } from '../../src/shell/AppShell'
import {
  MEMBER_DESTINATIONS,
  MEMBER_SECONDARY,
  STAFF_DESTINATIONS,
  STAFF_SECONDARY,
} from '../../src/shell/destinations'
import './smoke.css'

const directory: DirectoryCard[] = [
  card('a1000001-0000-4000-8000-000000000001', 'Layla Al-Nadira', 'Independent chair', 'Nadira Family Office', 'Riyadh', 'Energy transition', 'ksa', 'nadira'),
  card('a1000001-0000-4000-8000-000000000002', 'Noura Al-Wahat', 'Non-executive director', 'Wahat Counsel', 'Jeddah', 'Health', 'ksa', 'wahat'),
  card('a1000001-0000-4000-8000-000000000003', 'Hanan Al-Safi', 'Family principal', 'Safi House', 'Khobar', 'Tourism', 'ksa', 'safi'),
  card('a1000001-0000-4000-8000-000000000004', 'Maha Al-Rawnaq', 'Independent director', 'Rawnaq Capital', 'Riyadh', 'Financial services', 'ksa', 'rawnaq'),
  card('a1000001-0000-4000-8000-000000000005', 'Faisal Al-Dihya', 'Non-executive director', 'Dihya Board Seat', 'Dammam', 'Logistics', 'ksa', 'dihya'),
  card('a1000001-0000-4000-8000-000000000006', 'Omar Al-Janub', 'Chair advisor', 'Janub Board Practice', 'Abha', 'Mining', 'intl', 'janub'),
  card('a1000001-0000-4000-8000-000000000007', 'Saud Al-Manar', 'Independent director', 'Manar Seat', 'Riyadh', 'Digital infrastructure', 'ksa', 'manar'),
  card('a1000001-0000-4000-8000-000000000008', 'Yusuf Al-Batin', 'Board member', 'Batin Family Council', 'Jeddah', 'Food security', 'intl', 'batin'),
]

const mandate: MandateClear = {
  id: 'a2000001-0000-4000-8000-000000000001',
  is_demo: true,
  sector: 'Energy transition',
  deal_type: 'Growth equity',
  ticket_band: '$10-25m',
  geography: 'KSA',
  stage: 'Diligence',
  one_liner: 'Growth capital for a Saudi industrial services platform.',
  unlocked: false,
  intro_status: null,
}

const rooms: RoomCard[] = [
  {
    id: 'a3000001-0000-4000-8000-000000000001',
    is_demo: true,
    name: 'Industrial services room',
    summary: 'A working room for a growth brief in industrial services. Opened by admin.',
    sector: 'Energy transition',
    stage: 'Diligence',
    member_count: 4,
    host_name: 'Layla Al-Nadira',
  },
  {
    id: 'a3000001-0000-4000-8000-000000000002',
    is_demo: true,
    name: 'West coast clinics room',
    summary: 'A working room for an acquisition brief in private care. Opened by admin.',
    sector: 'Health',
    stage: 'Sourcing',
    member_count: 3,
    host_name: 'Noura Al-Wahat',
  },
  {
    id: 'a3000001-0000-4000-8000-000000000003',
    is_demo: true,
    name: 'Red Sea hospitality room',
    summary: 'A working room for an advisory brief in hospitality. Opened by admin.',
    sector: 'Tourism',
    stage: 'Closing',
    member_count: 5,
    host_name: 'Hanan Al-Safi',
  },
  {
    id: 'a3000001-0000-4000-8000-000000000004',
    is_demo: true,
    name: 'Domestic freight room',
    summary: 'A working room for a growth brief in domestic freight. Opened by admin.',
    sector: 'Logistics',
    stage: 'Diligence',
    member_count: 4,
    host_name: 'Faisal Al-Dihya',
  },
]

const partners: PartnerCard[] = [
  { id: 'a4000001-0000-4000-8000-000000000001', is_demo: true, name: 'Qaf Ledger', blurb: 'Custody and fund administration for Gulf closings.', monogram: 'QL' },
  { id: 'a4000001-0000-4000-8000-000000000002', is_demo: true, name: 'Mirsad Advisory', blurb: 'Independent corporate finance advice to boards.', monogram: 'MA' },
  { id: 'a4000001-0000-4000-8000-000000000003', is_demo: true, name: 'Dar Escrow House', blurb: 'Escrow and settlement for private transactions.', monogram: 'DE' },
]

function card(
  id: string,
  full_name: string,
  headline: string,
  company: string,
  location: string,
  sector: string,
  seat: 'ksa' | 'intl',
  portrait: string,
): DirectoryCard {
  return {
    id,
    is_demo: true,
    full_name,
    headline,
    company,
    location,
    sector,
    seat,
    portrait_asset: `/demo/portraits/${portrait}.svg`,
    avatar_path: null,
  }
}

function Shell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Example member"
      >
        {children}
      </AppShell>
    </MemoryRouter>
  )
}

function StaffShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Example staff"
      >
        {children}
      </AppShell>
    </MemoryRouter>
  )
}

function sponsorHolder(id: string, email: string, status: 'invited' | 'active' | 'suspended') {
  return { user_id: id, email, seat: 'sponsor', status }
}

function AdminSponsorSmoke({ cap }: { cap: boolean }) {
  const [open, setOpen] = useState(false)
  const [firm, setFirm] = useState('')
  const [email, setEmail] = useState('')
  const holders = cap
    ? [
        sponsorHolder('s1', 'sponsor@example.com', 'active'),
        sponsorHolder('s2', 'sponsor.two@example.com', 'invited'),
        sponsorHolder('s3', 'sponsor.three@example.com', 'active'),
      ]
    : [
        sponsorHolder('s1', 'sponsor@example.com', 'active'),
        sponsorHolder('s9', 'sponsor.suspended@example.com', 'suspended'),
        { user_id: 'k1', email: 'member@example.com', seat: 'ksa', status: 'active' },
      ]
  return (
    <StaffShell path="/admin/people">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">People</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] text-stone/65">
        Members, admins, and sponsors. Invite, suspend, or restore. This screen does not remove
        people. The last master stays in place.
      </p>
      <SponsorInvitePanel
        members={holders}
        firmByUser={{ s1: 'Example Ledger', s2: null, s3: 'Example House' }}
        capKnown
        countError={false}
        submitting={false}
        open={open && !cap}
        firm={firm}
        email={email}
        error=""
        success=""
        dryRunInvite={null}
        onOpen={() => setOpen(true)}
        onCancel={() => setOpen(false)}
        onFirm={setFirm}
        onEmail={setEmail}
        onSubmit={() => {}}
      />
    </StaffShell>
  )
}

function DashboardSponsorSmoke() {
  const profileRow: ProfileRow = {
    user_id: 'a1000001-0000-4000-8000-000000000099',
    full_name: 'Example Sponsor',
    headline: 'Sponsor seat',
    company: 'Example Ledger',
    location: null,
    linkedin_url: null,
    bio: null,
    phone: null,
    investable_capacity_usd: null,
    fo_aum_usd: null,
    turnover_usd: null,
    capacity_currency: 'USD',
    include_in_public_aggregates: false,
    capacity_verified: false,
    avatar_path: null,
  }
  const room: MemberRoom = {
    userId: profileRow.user_id,
    email: 'sponsor@example.com',
    staffRole: null,
    member: {
      user_id: profileRow.user_id,
      email: 'sponsor@example.com',
      seat: 'sponsor',
      status: 'active',
      must_set_password: false,
      invites_remaining: 0,
      invites_granted: 0,
    },
    profile: profileRow,
    reload: async () => {},
  }
  return (
    <Shell path="/dashboard">
      <DashboardStatusContext.Provider
        value={{ refreshError: '', refreshing: false, updatedAt: new Date('2026-09-29T06:41:00Z'), retry: () => {} }}
      >
        <MemberContext.Provider value={room}>
          <DashboardHome />
        </MemberContext.Provider>
      </DashboardStatusContext.Provider>
    </Shell>
  )
}

function MandatesSmoke() {
  const [status, setStatus] = useState<MandateClear['intro_status']>(null)
  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Mandates</p>
      <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Mandates</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/60">
        Sector, deal type, size band, geography, and stage stay visible. Company, exact price, contacts, and the confidential note stay locked until you request an intro and an admin approves it for you.
      </p>
      <div className="mt-8">
        <MandateCard
          mandate={{ ...mandate, intro_status: status }}
          onRequest={() => setStatus('pending')}
        />
      </div>
    </div>
  )
}

const view = new URLSearchParams(window.location.search).get('view')
const path = window.location.pathname
const cap = new URLSearchParams(window.location.search).get('state') === 'cap'
const root = document.getElementById('root')
if (!root) throw new Error('missing root')

createRoot(root).render(
  <StrictMode>
    {path === '/admin/people' ? <AdminSponsorSmoke cap={cap} /> : null}
    {path === '/dashboard' ? <DashboardSponsorSmoke /> : null}
    {path === '/' && view === 'partners' ? (
      <MemoryRouter initialEntries={['/trusted-partners']}>
        <div className="min-h-dvh bg-pearl pt-20">
          <Nav />
          <TrustedPartnersGallery state={{ status: 'ready', partners }} />
        </div>
      </MemoryRouter>
    ) : null}
    {path === '/' && view === 'directory' ? (
      <Shell path="/dashboard/directory">
        <DirectoryBoard cards={directory} seat={{ status: 'ready', admitted: 0 }} />
      </Shell>
    ) : null}
    {path === '/' && view === 'mandates' ? (
      <Shell path="/dashboard/mandates">
        <MandatesSmoke />
      </Shell>
    ) : null}
    {path === '/' && view === 'rooms' ? (
      <Shell path="/dashboard/rooms">
        <RoomsBoard rooms={rooms} />
      </Shell>
    ) : null}
  </StrictMode>,
)
