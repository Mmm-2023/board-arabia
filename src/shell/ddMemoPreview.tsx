import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { exampleCoReport, fullDraftReport, passDraftReport, publicChecksReport, rangeBreachReport } from '../lib/dueDiligenceMemoFixture'
import { DueDiligenceReport } from '../pages/dashboard/DueDiligenceReport'
import { presentReport } from '../../supabase/functions/_shared/due_diligence.ts'
import { AppShell } from './AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from './destinations'
import '../index.css'

const state = new URLSearchParams(window.location.search).get('state') || 'evidence'
const report =
  state === 'pass'
    ? passDraftReport()
    : state === 'nosearch'
      ? publicChecksReport()
      : state === 'range'
        ? rangeBreachReport()
        : state === 'example'
          ? exampleCoReport()
          : fullDraftReport()
const presented = presentReport(report, state === 'example' ? 'example-seed.pdf' : 'northwind-freight.pdf')
const root = document.getElementById('root')
if (!root) throw new Error('Missing memo preview root')

createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/dashboard/ai/due-diligence/11111111-1111-4111-8111-111111111111']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:00"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Example member"
      >
        <div className="max-w-5xl">
          <p className="hidden text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase md:block">AI Due Diligence</p>
          <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-[-0.03em] break-words text-balance md:mt-3 md:text-[2.2rem]">
            {report.company_label}
          </h1>
          <p className="mt-3 inline-flex min-h-11 items-center text-[0.95rem] text-[var(--ba-indigo)]">All checks</p>
          <DueDiligenceReport
            presented={presented}
            preparedAt="2026-09-29T09:00:00.000Z"
            report={report}
            reportId="11111111-1111-4111-8111-111111111111"
          />
        </div>
      </AppShell>
    </MemoryRouter>
  </StrictMode>,
)
