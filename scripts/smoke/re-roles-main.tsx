import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { presentReBoardRole, type ReBoardRoleCard } from '../../src/lib/reBoardRoles'
import { RealEstateBoard } from '../../src/pages/dashboard/RealEstateBoard'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

type Mode = 'list' | 'clear' | 'blurred' | 'intro' | 'empty'

const mode = readMode()

function readMode(): Mode {
  const value = new URLSearchParams(window.location.search).get('state')
  if (value === 'clear' || value === 'blurred' || value === 'intro' || value === 'empty') return value
  return 'list'
}

function seat(fields: Record<string, unknown>): ReBoardRoleCard {
  const card = presentReBoardRole({
    is_demo: false,
    unlocked: false,
    access: 'locked',
    intro_status: null,
    organisation_name: 'Safa Court Developer',
    terms: 'Independent seat. The appointment stays in the Safa Court Developer brief.',
    contact_name: 'Lina S.',
    contact_email: 'lina.role@example.com',
    contact_phone: 'Desk extension 6101',
    narrative: 'Safa Court Developer is a fictional example. This seat is an illustration, not a live appointment.',
    ...fields,
  })
  if (!card) throw new Error('fixture dropped')
  return card
}

const demoSeats: ReBoardRoleCard[] = [
  seat({
    id: 'b3000001-0000-4000-8000-000000000001',
    is_demo: true,
    seat_kind: 'developer',
    title: 'Independent director',
    sector: 'Housing',
    capacity: 'One independent seat. Four meetings a year.',
    city: 'Riyadh',
    asset_class: 'residential',
  }),
  seat({
    id: 'b3000001-0000-4000-8000-000000000002',
    is_demo: true,
    seat_kind: 'propco',
    title: 'Non-executive director',
    sector: 'Hospitality',
    capacity: 'One non-executive seat. Quarterly meetings.',
    city: 'Makkah',
    asset_class: 'hospitality',
    organisation_name: 'Hadi Shore Hold',
    terms: 'Non-executive seat. The appointment stays in the Hadi Shore Hold brief.',
    contact_name: 'Nada Q.',
    contact_email: 'nada.role@example.com',
    contact_phone: 'Desk extension 6102',
    narrative: 'Hadi Shore Hold is a fictional example.',
  }),
  seat({
    id: 'b3000001-0000-4000-8000-000000000003',
    is_demo: true,
    seat_kind: 'propco',
    title: 'Board observer',
    sector: 'Logistics',
    capacity: 'One observer seat. Six meetings a year.',
    city: 'Eastern Province',
    asset_class: 'industrial/logistics',
    organisation_name: 'Yarda Freight Desk',
    terms: 'Observer seat. The appointment stays in the Yarda Freight Desk brief.',
    contact_name: 'Tariq Y.',
    contact_email: 'tariq.role@example.com',
    contact_phone: 'Desk extension 6103',
    narrative: 'Yarda Freight Desk is a fictional example.',
  }),
]

function cardsFor(current: Mode, requested: boolean): ReBoardRoleCard[] {
  if (current === 'empty') return []
  if (current === 'list') return demoSeats
  if (current === 'clear') {
    return [
      seat({
        id: 'b3000001-0000-4000-8000-000000000007',
        seat_kind: 'developer',
        title: 'Independent director',
        sector: 'Housing',
        capacity: 'One independent seat. Four meetings a year.',
        city: 'Riyadh',
        asset_class: 'residential',
        unlocked: true,
        access: 'intro',
        intro_status: 'approved',
      }),
    ]
  }
  return [
    seat({
      id: 'b3000001-0000-4000-8000-000000000009',
      seat_kind: 'propco',
      title: 'Non-executive director',
      sector: 'Hospitality',
      capacity: 'One non-executive seat. Quarterly meetings.',
      city: 'Makkah',
      asset_class: 'hospitality',
      organisation_name: 'Hadi Shore Hold',
      terms: 'Non-executive seat. The appointment stays in the Hadi Shore Hold brief.',
      contact_name: 'Nada Q.',
      contact_email: 'nada.role@example.com',
      contact_phone: 'Desk extension 6102',
      narrative: 'Hadi Shore Hold is a fictional example.',
      intro_status: current === 'intro' || requested ? 'pending' : null,
    }),
  ]
}

function Preview() {
  const [requested, setRequested] = useState(mode === 'intro')
  const cards = cardsFor(mode, requested)
  return (
    <MemoryRouter initialEntries={['/dashboard/deals/real-estate?view=roles']}>
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
          cards={[]}
          busyId={null}
          requestError={false}
          onRetry={() => {}}
          onRequest={() => {}}
          tab="roles"
          rolesStatus="ready"
          roles={cards}
          onRequestRole={() => setRequested(true)}
        />
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
