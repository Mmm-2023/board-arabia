import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { emptyNewMandate, type NewMandateDraft } from '../../src/lib/newMandate'
import type { StaffMandateBrief } from '../../src/lib/mandateMatch'
import { AdminMandatesView } from '../../src/pages/admin/AdminMandatesView'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const view = new URLSearchParams(window.location.search).get('view') || 'empty'

const created: StaffMandateBrief = {
  id: 'example-freight',
  isDemo: false,
  published: false,
  sector: 'Logistics',
  dealType: 'Growth equity',
  ticketBand: 'Growth band',
  geography: 'KSA',
  stage: 'Diligence',
  oneLiner: 'Growth capital for a regional freight platform.',
  companyName: 'Example Freight',
  sectorTags: ['Logistics'],
  visionThemes: ['Industrial development and logistics'],
  matchCount: 0,
}

const sample: StaffMandateBrief = {
  id: 'example-holdings',
  isDemo: true,
  published: true,
  sector: 'Health',
  dealType: 'Advisory seat',
  ticketBand: 'Growth band',
  geography: 'KSA',
  stage: 'Sourcing',
  oneLiner: 'A sample brief kept on the list.',
  companyName: 'Example Holdings',
  sectorTags: ['Health'],
  visionThemes: ['Health transformation'],
  matchCount: 0,
}

function filled(): NewMandateDraft {
  return {
    ...emptyNewMandate(),
    sector: 'Logistics @ north',
    dealType: 'Growth equity',
    ticketBand: 'Growth band',
    geography: 'KSA',
    stage: 'Diligence',
    oneLiner: 'Growth capital for a regional freight platform.',
    companyName: 'Example Freight',
    exactAmount: 'Set on request',
    terms: 'One board seat.',
    contactName: 'Example Contact',
    contactEmail: 'contact@example.com',
    contactPhone: 'Extension 100',
    narrative: 'Example Freight is a sample brief. Terms stay in this note.',
    sectorTags: ['Logistics'],
    visionThemes: ['Industrial development and logistics'],
  }
}

const state =
  view === 'invalid'
    ? {
        draft: filled(),
        field: 'sector' as const,
        message: 'Public fields cannot include @.',
        notice: '',
        mandates: [] as StaffMandateBrief[],
      }
    : view === 'success'
      ? {
          draft: emptyNewMandate(),
          field: '' as const,
          message: '',
          notice: 'Mandate saved. It is not an Example.',
          mandates: [created],
        }
      : view === 'list'
        ? {
            draft: emptyNewMandate(),
            field: '' as const,
            message: '',
            notice: '',
            mandates: [created, sample],
          }
        : {
            draft: emptyNewMandate(),
            field: '' as const,
            message: '',
            notice: '',
            mandates: [] as StaffMandateBrief[],
          }

function Preview() {
  return (
    <div data-preview="">
      <MemoryRouter initialEntries={['/admin/mandates']}>
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Staff"
        >
          <AdminMandatesView
            mandates={state.mandates}
            draft={state.draft}
            field={state.field}
            message={state.message}
            notice={state.notice}
            busy={false}
            onDraft={() => undefined}
            onSubmit={() => undefined}
          />
        </AppShell>
      </MemoryRouter>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
