import type { FormEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { DD_COPY } from '../lib/dueDiligenceCopy.ts'
import type { DeskPhase } from '../lib/dueDiligencePhase.ts'
import { DueDiligenceDeskView } from '../pages/dashboard/DueDiligencePage.tsx'

function noop() {}

function renderDesk(input: {
  phase: DeskPhase
  fileName?: string
  activeJob?: boolean
  progress?: number
  progressLabel?: string
  actionError?: string
}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DueDiligenceDeskView
        phase={input.phase}
        loadState="ready"
        fileName={input.fileName ?? ''}
        companyUrl=""
        busy={false}
        activeJob={Boolean(input.activeJob)}
        progress={input.progress ?? 0}
        progressLabel={input.progressLabel ?? DD_COPY.ctaRunning}
        actionError={input.actionError ?? ''}
        reports={[]}
        onCompanyUrl={noop}
        onFile={noop}
        onSubmit={(event: FormEvent) => event.preventDefault()}
        onRetry={noop}
        onReload={noop}
      />
    </MemoryRouter>,
  )
}

export function renderDueDeskStates() {
  return {
    idle: renderDesk({ phase: 'idle-empty' }),
    chosen: renderDesk({ phase: 'file-chosen', fileName: 'GCC Partnership Proposal.pdf' }),
    error: renderDesk({
      phase: 'job-error',
      fileName: 'GCC Partnership Proposal.pdf',
      actionError: DD_COPY.errorStart,
    }),
    running: renderDesk({
      phase: 'running',
      fileName: 'deck.pdf',
      activeJob: true,
      progress: 40,
      progressLabel: DD_COPY.statusReading,
    }),
  }
}
