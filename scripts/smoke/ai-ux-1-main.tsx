import { type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { passDraftReport } from '../../src/lib/dueDiligenceMemoFixture'
import type { HistoryItem } from '../../src/lib/dueDiligence'
import { DueDiligenceDeskView } from '../../src/pages/dashboard/DueDiligencePage'
import { DueDiligenceReport } from '../../src/pages/dashboard/DueDiligenceReport'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS } from '../../src/shell/destinations'
import { presentReport } from '../../supabase/functions/_shared/due_diligence.ts'
import '../../src/index.css'

type PreviewWindow = Window & {
  __baAiReportOperator?: { entity: string; cr: string } | null
}

;(window as PreviewWindow).__baAiReportOperator = { entity: 'Board Arabia', cr: '' }

const view = new URLSearchParams(window.location.search).get('view') || 'start'

// Keep the shell column and the list clamp in this fixture's CSS build.
const fixtureUtilities =
  'flex flex-col flex-1 gap-2 line-clamp-2 overflow-x-clip rounded-xl rounded-md grid min-w-0 max-w-xs h-11 h-16 h-20 h-24 h-36 break-words text-start'
void fixtureUtilities

const reports: HistoryItem[] = [
  row(
    'a',
    'job-a',
    'Example Cold Chain',
    'example-cold-chain.pdf',
    '2026-10-20T09:00:00.000Z',
    40,
  ),
  row(
    'b',
    'job-b',
    'Example Corridor Holding Company of the Gulf Regional Pilot Programme for Temperature Controlled Freight',
    'example-corridor.pdf',
    '2026-10-18T09:00:00.000Z',
    20,
  ),
  row('c', 'job-c', '\u00D2Example Gateway\u00D3', 'example-gateway.pdf', '2026-10-12T09:00:00.000Z', null),
]

function row(
  id: string,
  jobId: string,
  company: string,
  fileName: string,
  created: string,
  consistent: number | null,
): HistoryItem {
  return {
    id,
    job_id: jobId,
    created_at: created,
    file_name: fileName,
    company_label: company,
    publicly_consistent_pct: consistent,
    not_publicly_verifiable_pct: consistent === null ? null : 100 - consistent,
  }
}

function MemberShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel="Updated 09:15"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Account"
        accountName="Example Member"
      >
        <div data-ai-ux="">{children}</div>
      </AppShell>
    </MemoryRouter>
  )
}

function noopSubmit(event: FormEvent) {
  event.preventDefault()
}

function desk(phase: 'idle' | 'idle-empty' | 'loading' | 'load-error', loadState: 'ready' | 'loading' | 'error') {
  return (
    <DueDiligenceDeskView
      phase={phase}
      loadState={loadState}
      fileName=""
      companyUrl=""
      busy={false}
      activeJob={false}
      progress={0}
      progressLabel=""
      actionError=""
      reports={phase === 'idle' ? reports : []}
      onCompanyUrl={() => {}}
      onFile={() => {}}
      onSubmit={noopSubmit}
      onRetry={() => {}}
      onReload={() => {}}
      onDelete={() => {}}
    />
  )
}

const exampleReport = passDraftReport()
exampleReport.company_label = 'Example Co'
if (exampleReport.analysis) {
  exampleReport.analysis.snapshot.one_liner = 'Example Co wants a seed round to run a pilot lane. Example data only.'
  exampleReport.analysis.hero.one_liner = exampleReport.analysis.snapshot.one_liner
  exampleReport.analysis.hero.company = 'Example Co'
}
const exampleFile = 'example-co.pdf'
const presented = presentReport(exampleReport, exampleFile)

const screen =
  view === 'report' ? (
    <MemberShell path="/dashboard/ai/due-diligence/11111111-1111-4111-8111-111111111111">
      <div className="max-w-3xl">
        <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-[-0.03em] text-balance md:text-[2.2rem]">
          AI Due Diligence
        </h1>
        <p className="mt-3 inline-flex min-h-11 items-center text-[1rem] text-[var(--ba-indigo)]">All checks</p>
        <DueDiligenceReport
          presented={presented}
          preparedAt="2026-09-29T09:00:00.000Z"
          report={exampleReport}
          reportId="11111111-1111-4111-8111-111111111111"
        />
      </div>
    </MemberShell>
  ) : (
    <MemberShell path="/dashboard/ai/due-diligence">
      {view === 'loading'
        ? desk('loading', 'loading')
        : view === 'error'
          ? desk('load-error', 'error')
          : view === 'list'
            ? desk('idle', 'ready')
            : desk('idle-empty', 'ready')}
    </MemberShell>
  )

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(screen)
