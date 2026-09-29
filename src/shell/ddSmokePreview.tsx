import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DD_COPY } from '../lib/dueDiligenceCopy'
import { DueDiligenceDeskView } from '../pages/dashboard/DueDiligencePage'
import { AppShell } from './AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from './destinations'
import type { DeskPhase } from '../lib/dueDiligencePhase'
import '../index.css'

const state = new URLSearchParams(window.location.search).get('state') || 'running'

const desk: {
  phase: DeskPhase
  activeJob: boolean
  progress: number
  progressLabel: string
  actionError: string
  retryLabel: string
} =
  state === 'error'
    ? {
        phase: 'job-error',
        activeJob: false,
        progress: 0,
        progressLabel: '',
        actionError: DD_COPY.errorStart,
        retryLabel: DD_COPY.errorRetry,
      }
    : state === 'retry'
      ? {
          phase: 'job-error',
          activeJob: true,
          progress: 40,
          progressLabel: DD_COPY.statusReading,
          actionError: DD_COPY.errorPoll,
          retryLabel: DD_COPY.pollRetry,
        }
      : {
          phase: 'running',
          activeJob: true,
          progress: 40,
          progressLabel: DD_COPY.statusReading,
          actionError: '',
          retryLabel: DD_COPY.errorRetry,
        }

const root = document.getElementById('root')
if (!root) throw new Error('Missing smoke root')

createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/dashboard/due-diligence']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:00"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Example member"
      >
        <DueDiligenceDeskView
          phase={desk.phase}
          loadState="ready"
          fileName="sample-deck.pdf"
          companyUrl=""
          busy={false}
          activeJob={desk.activeJob}
          progress={desk.progress}
          progressLabel={desk.progressLabel}
          actionError={desk.actionError}
          reports={[]}
          onCompanyUrl={() => {}}
          onFile={() => {}}
          onSubmit={(event) => event.preventDefault()}
          onRetry={() => {}}
          onReload={() => {}}
          retryLabel={desk.retryLabel}
        />
      </AppShell>
    </MemoryRouter>
  </StrictMode>,
)
