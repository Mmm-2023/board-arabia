import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { presentReOpportunity, type ReOpportunityCard } from '../../src/lib/reRedaction'
import { ReReadinessEditor } from '../../src/pages/admin/ReReadinessEditor'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const card = presentReOpportunity({
  id: 'c1000001-0000-4000-8000-000000000009',
  is_demo: false,
  sector: 'Housing',
  city: 'Riyadh',
  asset_class: 'residential',
  capital_role: 'equity',
  ticket_band: '$25-50m',
  one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
  foreign_ownership_path: 'in_progress',
  escrow_off_plan: 'ready',
  title_clarity: 'not_yet',
  white_land_exposure: 'not_applicable',
  unlocked: true,
  access: 'inventory',
  published: true,
  sponsor_member_id: null,
  counterparty_name: '',
  terms: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  narrative: '',
})

if (!card || card.access !== 'inventory') throw new Error('staff fixture dropped')

function Preview() {
  return (
    <MemoryRouter initialEntries={['/admin']}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Staff"
      >
        <ReReadinessEditor
          status="ready"
          cards={[card as ReOpportunityCard]}
          busyId={null}
          notice={null}
          alert={null}
          onRetry={() => {}}
          onSave={() => {}}
        />
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
