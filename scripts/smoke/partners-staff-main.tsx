import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { presentRePartner, type RePartnerCard } from '../../src/lib/reRedaction'
import { RePartnersEditor } from '../../src/pages/admin/RePartnersEditor'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const live = presentRePartner({
  id: 'c2000001-0000-4000-8000-000000000009',
  is_demo: false,
  category_slug: 'real_estate',
  name: 'Safa Court Works',
  kind: 'developer',
  city: 'Qiddiya',
  blurb: 'A developer desk for a private property brief.',
  unlocked: true,
  access: 'inventory',
  published: true,
  sort_order: 6,
  sponsor_tied: true,
  intro_status: null,
  contact_name: 'Desk contact',
  contact_email: '',
  contact_phone: 'Desk line',
})

const demo = presentRePartner({
  id: 'b2000001-0000-4000-8000-000000000001',
  is_demo: true,
  category_slug: 'real_estate',
  name: 'Wahat Title Counsel',
  kind: 'law',
  city: 'Riyadh',
  blurb: 'Counsel on title questions for a private property brief.',
  unlocked: false,
  access: 'locked',
  intro_status: null,
  sponsor_tied: false,
})

if (!live || live.access !== 'inventory' || !demo) throw new Error('staff fixture dropped')

const cards: RePartnerCard[] = [live, demo]

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
        <RePartnersEditor
          status="ready"
          cards={cards}
          busyId={null}
          notice={null}
          alert={null}
          onRetry={() => {}}
          onSave={() => {}}
          onMove={() => {}}
        />
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
