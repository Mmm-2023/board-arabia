import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { ReAppetite } from '../../src/lib/reAppetite'
import { presentReOpportunity, type ReOpportunityCard } from '../../src/lib/reRedaction'
import { RealEstateBoard } from '../../src/pages/dashboard/RealEstateBoard'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const appetite: ReAppetite = {
  ticket_band: '$10-25m',
  cities: ['Riyadh', 'NEOM'],
  asset_classes: ['residential'],
  capital_roles: ['equity', 'JV partner'],
}

const mode = new URLSearchParams(window.location.search).get('state') === 'empty' ? 'empty' : 'filled'

function build(): ReOpportunityCard[] {
  return [
    fields({
      id: 'b1000001-0000-4000-8000-000000000001',
      sector: 'Housing',
      city: 'Riyadh',
      asset_class: 'residential',
      capital_role: 'equity',
      ticket_band: '$10-25m',
      one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
    }),
    fields({
      id: 'b1000001-0000-4000-8000-000000000002',
      sector: 'Hospitality',
      city: 'Red Sea',
      asset_class: 'hospitality',
      capital_role: 'operator',
      ticket_band: '$25-50m',
      one_liner: 'An operator role beside a hospitality asset on the Red Sea.',
    }),
  ]
}

function fields(row: Record<string, string>) {
  const card = presentReOpportunity({
    ...row,
    is_demo: true,
    unlocked: false,
    access: 'locked',
    intro_status: null,
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'ready',
    title_clarity: 'ready',
    white_land_exposure: 'ready',
  })
  if (!card) throw new Error(`fixture dropped ${row.id}`)
  return card
}

function Preview() {
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
        <RealEstateBoard
          status="ready"
          cards={build()}
          busyId={null}
          requestError={false}
          onRetry={() => {}}
          onRequest={() => {}}
          appetiteStatus="ready"
          appetite={mode === 'filled' ? appetite : null}
          onRetryAppetite={() => {}}
          onSaveAppetite={async () => 'ok'}
        />
      </AppShell>
    </MemoryRouter>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<Preview />)
