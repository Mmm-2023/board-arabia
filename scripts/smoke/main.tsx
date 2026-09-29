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
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
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
const root = document.getElementById('root')
if (!root) throw new Error('missing root')

createRoot(root).render(
  <StrictMode>
    {view === 'partners' ? (
      <MemoryRouter initialEntries={['/trusted-partners']}>
        <div className="min-h-dvh bg-pearl pt-20">
          <Nav />
          <TrustedPartnersGallery state={{ status: 'ready', partners }} />
        </div>
      </MemoryRouter>
    ) : null}
    {view === 'directory' ? (
      <Shell path="/dashboard/directory">
        <DirectoryBoard cards={directory} seat={{ status: 'ready', admitted: 0 }} />
      </Shell>
    ) : null}
    {view === 'mandates' ? (
      <Shell path="/dashboard/mandates">
        <MandatesSmoke />
      </Shell>
    ) : null}
    {view === 'rooms' ? (
      <Shell path="/dashboard/rooms">
        <RoomsBoard rooms={rooms} />
      </Shell>
    ) : null}
  </StrictMode>,
)
