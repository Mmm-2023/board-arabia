import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AI_TOOL_FLAG_DEFAULTS } from '../../supabase/functions/_shared/ai_tools.ts'
import { buildMarketBrief } from '../../supabase/functions/ai-tool-job/tools/market_brief.ts'
import { AiToolReport, AiToolShell } from '../../src/components/ai/AiToolDesk'
import { MarketBriefForm } from '../../src/components/ai/MarketBriefForm'
import { PRIVACY_LINK, TERMS_LINK } from '../../src/lib/aiToolConfig'
import { previewAiReportOperator } from '../../src/lib/aiReportOperator'
import { renderToolCopy, type LegalSlots } from '../../src/lib/aiToolCopy'
import { AiToolSettingsPanel } from '../../src/pages/admin/AiToolSettingsPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import { MARKET_SEARCH_FIXTURE } from '../fixtures/market-brief-search.ts'
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

function toolPage() {
  const copy = renderToolCopy('market_brief', 'en', slots)
  return memberShell(
    <AiToolShell title={copy.title}>
      <MarketBriefForm
        copy={copy}
        sector="Health"
        consented={false}
        busy={false}
        onSector={() => undefined}
        onConsent={() => undefined}
        onRun={() => undefined}
      />
    </AiToolShell>,
  )
}

function report() {
  const output = buildMarketBrief({
    sector: 'Health',
    hits: MARKET_SEARCH_FIXTURE,
    generatedOn: '30 Sep 2026',
    lang: 'en',
  })
  const copy = renderToolCopy('market_brief', 'en', { ...slots, date: output.generated_on })
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

function settings() {
  return staffShell(
    <div className="max-w-3xl md:pe-16">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
      <AiToolSettingsPanel
        shot={{ retentionDays: 30, flags: { ...AI_TOOL_FLAG_DEFAULTS }, searchConfigured: false }}
      />
    </div>,
  )
}

function staffSearch() {
  return staffShell(
    <div className="w-full max-w-3xl md:pe-16">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
      <AiToolSettingsPanel
        shot={{ retentionDays: 30, flags: { ...AI_TOOL_FLAG_DEFAULTS }, searchConfigured: false }}
      />
    </div>,
  )
}

function screen() {
  if (view === 'tool-ar') return toolPage()
  if (view === 'report-en') return report()
  if (view === 'report-ar') return report()
  if (view === 'settings') return settings()
  if (view === 'staff-search') return staffSearch()
  return toolPage()
}

const entry = view === 'settings' || view === 'staff-search' ? '/admin/settings' : '/dashboard/ai/market-brief'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[entry]}>
      <div data-preview="">{screen()}</div>
    </MemoryRouter>
  </StrictMode>,
)
