import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { StaffMandateMatch } from '../../src/lib/mandateMatch'
import { MandateShortlist } from '../../src/pages/admin/MandateShortlist'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const view = new URLSearchParams(window.location.search).get('view')
const openId = '11111111-1111-4111-8111-111111111111'
const selectiveId = '22222222-2222-4222-8222-222222222222'

const base: StaffMandateMatch = {
  id: 'a2000001-0000-4000-8000-000000000001',
  isDemo: false,
  published: true,
  sector: 'Energy transition',
  dealType: 'Growth equity',
  ticketBand: '$10-25m',
  geography: 'KSA',
  stage: 'Diligence',
  oneLiner: 'Growth capital for a Saudi industrial services platform.',
  companyName: 'Nahla Industrial Holding',
  sectorTags: ['Energy transition'],
  visionThemes: ['Renewable energy', 'Thriving economy'],
  matches: [],
}

const mandate: StaffMandateMatch =
  view === 'no-tags'
    ? {
        ...base,
        sector: 'General counsel',
        sectorTags: [],
        visionThemes: [],
        published: false,
      }
    : view === 'empty'
      ? base
      : {
          ...base,
          matches: [
            {
              userId: openId,
              fullName: 'Sara Al Noor',
              headline: 'Independent chair',
              company: 'Northwind',
              seat: 'ksa',
              availability: 'open',
              sectorOverlap: ['Energy transition'],
              visionOverlap: ['Renewable energy', 'Thriving economy'],
              score: 9,
            },
            {
              userId: selectiveId,
              fullName: 'Nora Al Noor',
              headline: 'Board advisor',
              company: 'Waha Seat',
              seat: 'intl',
              availability: 'selective',
              sectorOverlap: ['Energy transition'],
              visionOverlap: ['Renewable energy'],
              score: 6,
            },
          ],
        }

function Preview() {
  return (
    <MemoryRouter initialEntries={[`/admin/mandates/${base.id}`]}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 09:41"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Staff"
      >
        <MandateShortlist mandate={mandate} matches={mandate.matches} copied={false} copyError="" onCopy={() => {}} />
      </AppShell>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
