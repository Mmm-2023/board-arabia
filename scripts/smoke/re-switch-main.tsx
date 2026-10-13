import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { presentReBoardRole } from '../../src/lib/reBoardRoles'
import { RE_TICKET_BANDS, presentReOpportunity, presentRePartner } from '../../src/lib/reRedaction'
import { RealEstateBoard, type RealEstateTab } from '../../src/pages/dashboard/RealEstateBoard'
import { DealsLayout } from '../../src/pages/dashboard/DealsLayout'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const opportunity = presentReOpportunity({
  id: 'b1000001-0000-4000-8000-000000000001',
  is_demo: true,
  sector: 'Housing',
  city: 'Riyadh',
  asset_class: 'residential',
  capital_role: 'equity',
  ticket_band: RE_TICKET_BANDS[1],
  one_liner: 'Equity for a residential block in Riyadh aimed at end users.',
  foreign_ownership_path: 'ready',
  escrow_off_plan: 'ready',
  title_clarity: 'ready',
  white_land_exposure: 'ready',
  counterparty_name: 'Nahla House Works',
  terms: 'Observer seat beside the developer. The brief stays with admin.',
  contact_name: 'Amal N.',
  contact_email: 'amal.re@example.com',
  contact_phone: 'Example line 5101',
  narrative: 'Nahla House Works is a fictional example. Admin keeps the contact until an intro is approved.',
})

const partner = presentRePartner({
  id: 'b2000001-0000-4000-8000-000000000001',
  is_demo: true,
  category_slug: 'real_estate',
  name: 'Example House Counsel',
  kind: 'law',
  city: 'Riyadh',
  blurb: 'A fictional law firm for real estate briefs. Outreach stays with admin.',
  sponsor_tied: false,
  unlocked: false,
  access: 'locked',
  contact_name: 'Amal N.',
  contact_email: 'counsel.re@example.com',
  contact_phone: 'Example line 5201',
})

const role = presentReBoardRole({
  id: 'b3000001-0000-4000-8000-000000000001',
  is_demo: true,
  seat_kind: 'developer',
  title: 'Independent director',
  sector: 'Housing',
  capacity: 'One independent seat. Four meetings a year.',
  city: 'Riyadh',
  asset_class: 'residential',
  unlocked: false,
  access: 'locked',
  organisation_name: 'Safa Court Developer',
  terms: 'Independent seat. The appointment stays in the example brief.',
  contact_name: 'Lina S.',
  contact_email: 'lina.role@example.com',
  contact_phone: 'Example line 6101',
  narrative: 'Safa Court Developer is a fictional example.',
})

if (!opportunity || !partner || !role) throw new Error('fixture dropped')

function tabFromView(view: string | null): RealEstateTab {
  if (view === 'partners') return 'partners'
  if (view === 'roles') return 'roles'
  return 'opportunities'
}

function FixtureBoard() {
  const [params, setParams] = useSearchParams()
  const tab = tabFromView(params.get('view'))
  function selectTab(next: RealEstateTab) {
    const nextParams = new URLSearchParams(params)
    if (next === 'partners') nextParams.set('view', 'partners')
    else if (next === 'roles') nextParams.set('view', 'roles')
    else nextParams.delete('view')
    setParams(nextParams, { replace: true })
  }
  return (
    <RealEstateBoard
      status="ready"
      cards={[opportunity!]}
      busyId={null}
      requestError={false}
      onRetry={() => {}}
      onRequest={() => {}}
      tab={tab}
      onTab={selectTab}
      partners={[partner!]}
      partnersStatus="ready"
      onRequestPartner={() => {}}
      roles={[role!]}
      rolesStatus="ready"
      onRequestRole={() => {}}
      appetiteStatus="ready"
      appetite={null}
      onRetryAppetite={() => {}}
      onSaveAppetite={async () => 'ok'}
    />
  )
}

function Preview() {
  const search = window.location.search
  return (
    <MemoryRouter initialEntries={[`/dashboard/deals/real-estate${search}`]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Example member"
      >
        <Routes>
          <Route path="/dashboard/deals" element={<DealsLayout />}>
            <Route path="real-estate" element={<FixtureBoard />} />
          </Route>
        </Routes>
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
