import { type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { fullDraftReport } from '../../src/lib/dueDiligenceMemoFixture'
import type { HistoryItem } from '../../src/lib/dueDiligence'
import { reportListTitle } from '../../src/lib/recentReports'
import { DueDiligenceDeskView } from '../../src/pages/dashboard/DueDiligencePage'
import { DueDiligenceReport } from '../../src/pages/dashboard/DueDiligenceReport'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, MEMBER_SECTIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import { presentReport } from '../../supabase/functions/_shared/due_diligence.ts'
import '../../src/index.css'

const view = new URLSearchParams(window.location.search).get('view') || 'list'

// The loading bars use these utilities. Name them here so this fixture's CSS build keeps the height.
const loadingBar = 'h-20 space-y-3 bg-[var(--ba-lavender)] animate-pulse motion-reduce:animate-none'
void loadingBar

const reports: HistoryItem[] = [
  row('a', 'job-a', 'Northwind Logistics', 'northwind.pdf', '2026-10-20T09:00:00.000Z'),
  row('b', 'job-b', '\u00D2Made In KSA\u00D3 Gateway to Centralized Economy', 'deck.pdf', '2026-10-18T09:00:00.000Z'),
  row('c', 'job-c', 'Foo\uFFFDbar', 'Harborline Robotics.pdf', '2026-10-12T09:00:00.000Z'),
]

function row(id: string, jobId: string, company: string, fileName: string, created: string): HistoryItem {
  return {
    id,
    job_id: jobId,
    created_at: created,
    file_name: fileName,
    company_label: company,
    publicly_consistent_pct: 40,
    not_publicly_verifiable_pct: 60,
  }
}

function MemberShell({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/dashboard/ai/due-diligence']}>
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
        <SectionTabs label="AI tools sections" sections={MEMBER_SECTIONS.ai ?? []} />
        <div className="mt-6" data-dd-screen="">
          {children}
        </div>
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

const garbled = fullDraftReport()
garbled.company_label = '\u00D2Made In KSA\u00D3 Gateway to Centralized Economy'
const fileName = 'made-in-ksa.pdf'
const presented = presentReport(garbled, fileName)

const screen =
  view === 'title' ? (
    <div className="max-w-5xl">
      <h1
        className="font-display text-[1.75rem] leading-tight font-bold tracking-[-0.03em] break-words text-balance md:text-[2.2rem]"
        data-dd-title="report"
      >
        {reportListTitle(garbled.company_label, fileName)}
      </h1>
      <p className="mt-3 inline-flex min-h-11 items-center text-[0.95rem] text-[var(--ba-indigo)]">All checks</p>
      <DueDiligenceReport
        presented={presented}
        preparedAt="2026-10-18T09:00:00.000Z"
        report={garbled}
        reportId="11111111-1111-4111-8111-111111111111"
      />
    </div>
  ) : view === 'loading' ? (
    desk('loading', 'loading')
  ) : view === 'empty' ? (
    desk('idle-empty', 'ready')
  ) : view === 'error' ? (
    desk('load-error', 'error')
  ) : (
    desk('idle', 'ready')
  )

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(<MemberShell>{screen}</MemberShell>)
