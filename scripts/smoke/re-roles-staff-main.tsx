import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ReBoardRoleIntroList } from '../../src/pages/admin/ReBoardRoleIntroList'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

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
          <ReBoardRoleIntroList
            rows={[
              {
                id: 'i1',
                title: 'Independent director',
                seat_kind: 'developer',
                sector: 'Housing',
                city: 'Riyadh',
                asset_class: 'residential',
                organisation_name: 'Safa Court Developer',
                member_name: 'Layla N.',
              },
            ]}
            error={false}
            busy={false}
            declineId={null}
            onApprove={() => {}}
            onDecline={() => {}}
            onCancelDecline={() => {}}
            onConfirmDecline={() => {}}
          />
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
