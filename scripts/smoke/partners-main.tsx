import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { presentRePartner, type RePartnerCard } from '../../src/lib/reRedaction'
import { RealEstateBoard } from '../../src/pages/dashboard/RealEstateBoard'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const firms = [
  ['b2000001-0000-4000-8000-000000000001', 'Wahat Title Counsel', 'law', 'Riyadh', 'Counsel on title questions for a private property brief.'],
  ['b2000001-0000-4000-8000-000000000002', 'Manar Valuation Desk', 'valuation', 'Jeddah', 'Independent valuation notes for a board brief.'],
  ['b2000001-0000-4000-8000-000000000003', 'Qaf Project Ledger', 'project finance', 'Diriyah', 'Project finance notes for a property brief. Not a public offer.'],
  ['b2000001-0000-4000-8000-000000000004', 'Lina Court Works', 'developer', 'Qiddiya', 'A developer desk for a private property brief.'],
  ['b2000001-0000-4000-8000-000000000005', 'Hadi Family Desk', 'broker', 'ROSHN', 'A private broker desk for family office property questions.'],
] as const

function build(pendingId: string | null): RePartnerCard[] {
  return firms.map(([id, name, kind, city, blurb]) => {
    const card = presentRePartner({
      id,
      is_demo: true,
      category_slug: 'real_estate',
      name,
      kind,
      city,
      blurb,
      unlocked: false,
      access: 'locked',
      intro_status: pendingId === id ? 'pending' : null,
      sponsor_tied: false,
    })
    if (!card) throw new Error(`fixture dropped ${id}`)
    return card
  })
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/dashboard/real-estate']}>
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

function Preview() {
  const [cards, setCards] = useState(() => build(null))
  return (
    <Shell>
      <RealEstateBoard
        status="ready"
        cards={[]}
        busyId={null}
        requestError={false}
        onRetry={() => {}}
        onRequest={() => {}}
        tab="partners"
        partnersStatus="ready"
        partners={cards}
        partnerBusyId={null}
        partnerRequestError={false}
        onRetryPartners={() => {}}
        onRequestPartner={(id) => setCards(build(id))}
      />
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
