import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AI_TOOL_FLAG_DEFAULTS } from '../../supabase/functions/_shared/ai_tools.ts'
import { buildMarketBrief } from '../../supabase/functions/ai-tool-job/tools/market_brief.ts'
import { AiToolReport, AiToolShell } from '../../src/components/ai/AiToolDesk'
import { MarketBriefForm } from '../../src/components/ai/MarketBriefForm'
import { PRIVACY_LINK, TERMS_LINK } from '../../src/lib/aiToolConfig'
import { renderToolCopy, type LegalSlots } from '../../src/lib/aiToolCopy'
import { AI_UI } from '../../src/lib/aiToolUi'
import { AiToolSettingsPanel } from '../../src/pages/admin/AiToolSettingsPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import { MARKET_SEARCH_FIXTURE } from '../fixtures/market-brief-search.ts'
import './home.css'

const slots: LegalSlots = {
  entity: 'Example Holdings',
  cr: '0000000000',
  provider: 'Example AI',
  privacy: PRIVACY_LINK,
  terms: TERMS_LINK,
  retentionDays: 30,
  date: '30 Sep 2026',
}

const view = new URLSearchParams(window.location.search).get('view') || 'tool-en'

function memberNav(lang: 'en' | 'ar') {
  if (lang !== 'ar') return MEMBER_DESTINATIONS
  return MEMBER_DESTINATIONS.map((item) => (item.id === 'ai' ? { ...item, label: AI_UI.ar.hub } : item))
}

function memberShell(node: ReactNode, lang: 'en' | 'ar' = 'en') {
  return (
    <AppShell
      tone="member"
      destinations={memberNav(lang)}
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

function toolPage(lang: 'en' | 'ar') {
  const copy = renderToolCopy('market_brief', lang, slots)
  return memberShell(
    <AiToolShell lang={lang} title={copy.title}>
      <MarketBriefForm
        copy={copy}
        lang={lang}
        sector="Health"
        consented={false}
        busy={false}
        onSector={() => undefined}
        onConsent={() => undefined}
        onRun={() => undefined}
      />
    </AiToolShell>,
    lang,
  )
}

function report(lang: 'en' | 'ar') {
  const output = buildMarketBrief({
    sector: 'Health',
    hits: MARKET_SEARCH_FIXTURE,
    generatedOn: '30 Sep 2026',
    lang,
  })
  const copy = renderToolCopy('market_brief', lang, { ...slots, date: output.generated_on })
  return memberShell(
    <AiToolShell lang={lang} title={copy.title}>
      <AiToolReport
        lang={lang}
        heading={copy.title}
        output={output}
        footerLead={copy.footerLead}
        footerShared={copy.footerShared}
        onDelete={() => undefined}
      />
    </AiToolShell>,
    lang,
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
  if (view === 'tool-ar') return toolPage('ar')
  if (view === 'report-en') return report('en')
  if (view === 'report-ar') return report('ar')
  if (view === 'settings') return settings()
  if (view === 'staff-search') return staffSearch()
  return toolPage('en')
}

const entry = view === 'settings' || view === 'staff-search' ? '/admin/settings' : '/dashboard/ai/market-brief'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[entry]}>
      <div data-preview="">{screen()}</div>
    </MemoryRouter>
  </StrictMode>,
)
