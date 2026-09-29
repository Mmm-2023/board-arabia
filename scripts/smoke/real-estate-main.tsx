import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { presentReOpportunity, type ReOpportunityCard } from '../../src/lib/reRedaction'
import { RealEstateBoard } from '../../src/pages/dashboard/RealEstateBoard'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

type Mode = 'blurred' | 'approved' | 'demo'

const mode = readMode()

const seed = [
  row({
    id: 'b1000001-0000-4000-8000-000000000001',
    sector: 'Housing',
    city: 'Riyadh',
    asset_class: 'residential',
    capital_role: 'equity',
    ticket_band: '$10-25m',
    one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
    foreign_ownership_path: 'designated_zone',
    escrow_off_plan: 'in_place',
    title_clarity: 'clear',
    white_land_exposure: 'none',
    counterparty_name: 'Nahla House Works',
    terms: 'Observer seat beside the developer. Structure stays in the Nahla House Works brief.',
    contact_name: 'Amal N.',
    contact_email: 'amal.re@example.com',
    contact_phone: 'Desk extension 5101',
    narrative:
      'Nahla House Works is the fictional counterparty on this demo brief. The name, the structure, and the desk stay locked until an admin approves an intro for this member only.',
  }),
  row({
    id: 'b1000001-0000-4000-8000-000000000002',
    sector: 'Hospitality',
    city: 'Red Sea',
    asset_class: 'hospitality',
    capital_role: 'operator',
    ticket_band: '$25-50m',
    one_liner: 'An operator role beside a hospitality asset on the Red Sea.',
    foreign_ownership_path: 'saudi_vehicle',
    escrow_off_plan: 'not_off_plan',
    title_clarity: 'clear',
    white_land_exposure: 'none',
    counterparty_name: 'Qitaf Shore Operator',
    terms: 'Operator appointment. The agreement stays in the Qitaf Shore Operator brief.',
    contact_name: 'Huda S.',
    contact_email: 'huda.re@example.com',
    contact_phone: 'Desk extension 5102',
    narrative:
      'Qitaf Shore Operator is the fictional counterparty. The appointment and the desk stay locked until an admin approves an intro for this member only.',
  }),
  row({
    id: 'b1000001-0000-4000-8000-000000000003',
    sector: 'Logistics property',
    city: 'Jeddah',
    asset_class: 'industrial/logistics',
    capital_role: 'JV partner',
    ticket_band: '$25-50m',
    one_liner: 'A joint venture for logistics yards serving Jeddah freight.',
    foreign_ownership_path: 'not_stated',
    escrow_off_plan: 'not_stated',
    title_clarity: 'in_review',
    white_land_exposure: 'none',
    counterparty_name: 'Darin Yard Holdings',
    terms: 'Joint venture. Governance stays in the Darin Yard Holdings brief.',
    contact_name: 'Tariq D.',
    contact_email: 'tariq.re@example.com',
    contact_phone: 'Desk extension 5103',
    narrative:
      'Darin Yard Holdings is the fictional counterparty. The venture terms and the desk stay locked until an admin approves an intro for this member only.',
  }),
  row({
    id: 'b1000001-0000-4000-8000-000000000004',
    sector: 'Land',
    city: 'NEOM',
    asset_class: 'land bank',
    capital_role: 'land contribution',
    ticket_band: '$50-100m',
    one_liner: 'Land contributed into a northern land bank beside a giga corridor.',
    foreign_ownership_path: 'not_available',
    escrow_off_plan: 'not_off_plan',
    title_clarity: 'in_review',
    white_land_exposure: 'exposed',
    counterparty_name: 'Safi North Land Desk',
    terms: 'Land is the contribution. The schedule stays in the Safi North Land Desk brief.',
    contact_name: 'Nada B.',
    contact_email: 'nada.re@example.com',
    contact_phone: 'Desk extension 5104',
    narrative:
      'Safi North Land Desk is the fictional counterparty. The schedule and the desk stay locked until an admin approves an intro for this member only.',
  }),
  row({
    id: 'b1000001-0000-4000-8000-000000000005',
    sector: 'Offices',
    city: 'Diriyah',
    asset_class: 'office',
    capital_role: 'sukuk/REIT',
    ticket_band: '$10-25m',
    one_liner: 'A sukuk seat in an office development at Diriyah.',
    foreign_ownership_path: 'designated_zone',
    escrow_off_plan: 'not_off_plan',
    title_clarity: 'clear',
    white_land_exposure: 'not_stated',
    counterparty_name: 'Rawnaq Office Hold',
    terms: 'Sukuk participation. The offering stays in the Rawnaq Office Hold brief.',
    contact_name: 'Reem Q.',
    contact_email: 'reem.re@example.com',
    contact_phone: 'Desk extension 5105',
    narrative:
      'Rawnaq Office Hold is the fictional counterparty. The offering and the desk stay locked until an admin approves an intro for this member only.',
  }),
]

function row(fields: Record<string, string>) {
  return fields
}

function readMode(): Mode {
  const value = new URLSearchParams(window.location.search).get('state')
  if (value === 'approved' || value === 'demo' || value === 'blurred') return value
  return 'blurred'
}

function build(next: Mode): ReOpportunityCard[] {
  return seed.map((fields, index) => {
    const approved = next === 'approved' && index === 0
    const card = presentReOpportunity({
      ...fields,
      is_demo: next === 'demo',
      unlocked: approved,
      access: approved ? 'intro' : 'locked',
      intro_status: approved ? 'approved' : null,
    })
    if (!card) throw new Error(`fixture dropped ${fields.id}`)
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
  const [cards, setCards] = useState(() => build(mode))
  return (
    <Shell>
      <RealEstateBoard
        status="ready"
        cards={cards}
        busyId={null}
        requestError={false}
        onRetry={() => {}}
        onRequest={(id) => {
          setCards((rows) =>
            rows.map((card) => {
              if (card.id !== id || card.unlocked) return card
              return { ...card, intro_status: 'pending' }
            }),
          )
        }}
      />
    </Shell>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<Preview />)
