import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { ReAppetite } from '../../src/lib/reAppetite'
import { ReAppetiteStaffView } from '../../src/pages/admin/ReAppetiteStaffView'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const appetite: ReAppetite = {
  ticket_band: '$10-25m',
  cities: ['Riyadh', 'NEOM'],
  asset_classes: ['residential'],
  capital_roles: ['equity', 'JV partner'],
}

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
        <div className="max-w-3xl">
          <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Staff home</h1>
          <ReAppetiteStaffView
            status="ready"
            rows={[{ member_id: 'm1', member_name: 'Layla N.', appetite }]}
            onRetry={() => {}}
          />
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
