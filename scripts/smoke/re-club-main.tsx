import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { presentReOpportunity, type ReOpportunityCard } from '../../src/lib/reRedaction'
import { RealEstateBoard } from '../../src/pages/dashboard/RealEstateBoard'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const mode = new URLSearchParams(window.location.search).get('state') === 'recorded' ? 'recorded' : 'cta'
const LIVE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function card(fields: Record<string, unknown>): ReOpportunityCard {
  const row = presentReOpportunity({
    is_demo: false,
    sector: 'Housing',
    city: 'Riyadh',
    asset_class: 'residential',
    capital_role: 'equity',
    ticket_band: '$10-25m',
    one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'ready',
    title_clarity: 'ready',
    white_land_exposure: 'ready',
    unlocked: false,
    access: 'locked',
    intro_status: null,
    counterparty_name: 'Nahla House Works',
    terms: 'Observer seat beside the developer. Structure stays in the Nahla House Works brief.',
    contact_name: 'Amal N.',
    contact_email: 'amal.re@example.com',
    contact_phone: 'Desk extension 5101',
    narrative: 'The counterparty stays locked until an intro is approved.',
    ...fields,
  })
  if (!row) throw new Error('fixture dropped')
  return row
}

const cards = [
  card({ id: LIVE, is_demo: false }),
  card({ id: 'b1000001-0000-4000-8000-000000000001', is_demo: true }),
]

function Preview() {
  const [recorded, setRecorded] = useState(mode === 'recorded')
  return (
    <MemoryRouter initialEntries={['/dashboard/deals/real-estate']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Example member"
      >
        <RealEstateBoard
          status="ready"
          cards={cards}
          busyId={null}
          requestError={false}
          onRetry={() => {}}
          onRequest={() => {}}
          showInterest
          interestedIds={recorded ? [LIVE] : []}
          onInterest={() => setRecorded(true)}
        />
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
