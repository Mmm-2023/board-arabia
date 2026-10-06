import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import csvText from '../../fixtures/cfo/example-holdings.csv?raw'
import { AI_TOOL_FLAG_DEFAULTS } from '../../supabase/functions/_shared/ai_tools.ts'
import { cfoCheckOutput } from '../../supabase/functions/ai-tool-job/tools/cfo_check.ts'
import { AiToolForm, AiToolReport, AiToolShell } from '../../src/components/ai/AiToolDesk'
import { PRIVACY_LINK, TERMS_LINK } from '../../src/lib/aiToolConfig'
import { previewAiReportOperator } from '../../src/lib/aiReportOperator'
import { renderToolCopy, type LegalSlots } from '../../src/lib/aiToolCopy'
import { AiToolSettingsPanel } from '../../src/pages/admin/AiToolSettingsPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './home.css'

previewAiReportOperator({ entity: 'NAMMCO Holding Co.', cr: '7043252647' })

const slots: LegalSlots = {
  entity: '',
  cr: '',
  provider: 'Example AI',
  privacy: PRIVACY_LINK,
  terms: TERMS_LINK,
  retentionDays: 30,
  date: '30 Sep 2026',
}

const CFO_ACCEPT = '.pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CFO_HINT = 'PDF, CSV, or XLSX. 15 MB max. The file and the output are deleted after the retention period.'

const view = new URLSearchParams(window.location.search).get('view') || 'tool-en'

function memberShell(node: ReactNode) {
  return (
    <AppShell
      tone="member"
      destinations={MEMBER_DESTINATIONS}
      secondary={MEMBER_ACCOUNT}
      updatedLabel="Updated 09:00"
      roleSwitch={null}
      onSignOut={() => undefined}
      accountLabel="Member"
      accountName="Huda Al Sample"
    >
      {node}
    </AppShell>
  )
}

function staffShell(node: ReactNode) {
  return (
    <AppShell
      tone="staff"
      destinations={STAFF_DESTINATIONS}
      secondary={STAFF_SECONDARY}
      updatedLabel="Updated 09:00"
      roleSwitch={null}
      onSignOut={() => undefined}
      accountLabel="Staff"
      accountName="Desk"
    >
      {node}
    </AppShell>
  )
}

function toolForm() {
  const copy = renderToolCopy('cfo_check', 'en', slots)
  return memberShell(
    <AiToolShell title={copy.title}>
      <AiToolForm
        copy={copy}
        consented={false}
        fileName=""
        busy={false}
        accept={CFO_ACCEPT}
        fileHint={CFO_HINT}
        onConsent={() => undefined}
        onFile={() => undefined}
        onRun={() => undefined}
      />
    </AiToolShell>,
  )
}

function report() {
  const copy = renderToolCopy('cfo_check', 'en', slots)
  const output = cfoCheckOutput({
    fileName: 'example-holdings.csv',
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: 'provider_not_configured',
    sourceText: csvText,
    lang: 'en',
  })
  return memberShell(
    <AiToolShell title={copy.title}>
      <AiToolReport
        heading={copy.title}
        output={output}
        footerLead={copy.footerLead}
        footerShared={copy.footerShared}
        onDelete={() => undefined}
      />
    </AiToolShell>,
  )
}

function screen() {
  if (view === 'tool-ar') return toolForm()
  if (view === 'report-en') return report()
  if (view === 'report-ar') return report()
  if (view === 'settings') {
    return staffShell(
      <div className="max-w-3xl pe-16">
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
        <AiToolSettingsPanel shot={{ retentionDays: 30, flags: { ...AI_TOOL_FLAG_DEFAULTS } }} />
      </div>,
    )
  }
  return toolForm()
}

const entry = view === 'settings' ? '/admin/settings' : '/dashboard/ai/cfo-check'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[entry]}>
      <div data-preview="">{screen()}</div>
    </MemoryRouter>
  </StrictMode>,
)
