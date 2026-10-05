import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { parseReClubGroups } from '../../src/lib/reClubInterest'
import { ReClubInterestBoard } from '../../src/pages/admin/ReClubInterestBoard'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const rows = parseReClubGroups([
  {
    opportunity_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sector: 'Housing',
    city: 'Riyadh',
    asset_class: 'residential',
    one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
    room_id: null,
    room_name: null,
    members: [
      { member_id: '11111111-1111-4111-8111-111111111111', member_name: 'Layla N.' },
      { member_id: '22222222-2222-4222-8222-222222222222', member_name: 'Huda S.' },
    ],
  },
])

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
          <ReClubInterestBoard
            status="ready"
            rows={rows}
            busyId={null}
            notice=""
            onRetry={() => {}}
            onCreate={() => {}}
            onLink={() => {}}
          />
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
