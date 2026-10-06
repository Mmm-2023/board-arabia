import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AI_TOOL_FLAG_DEFAULTS, type AiToolKey } from '../../supabase/functions/_shared/ai_tools.ts'
import { cfoCheckOutput } from '../../supabase/functions/ai-tool-job/tools/cfo_check.ts'
import { AiToolCardList } from '../../src/components/ai/AiToolCards'
import { AiToolForm, AiToolReport, AiToolShell } from '../../src/components/ai/AiToolDesk'
import { PRIVACY_LINK, TERMS_LINK } from '../../src/lib/aiToolConfig'
import { renderToolCopy, type LegalSlots } from '../../src/lib/aiToolCopy'
import { aiReportOperatorFields } from '../../src/lib/aiReportOperator'
import { AI_UI } from '../../src/lib/aiToolUi'
import { AiToolSettingsPanel } from '../../src/pages/admin/AiToolSettingsPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './home.css'

const slots: LegalSlots = {
  ...aiReportOperatorFields(),
  provider: 'Example AI',
  privacy: PRIVACY_LINK,
  terms: TERMS_LINK,
  retentionDays: 30,
  date: '30 Sep 2026',
}

const view = new URLSearchParams(window.location.search).get('view') || 'cards'

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

function flagsWith(on: AiToolKey[]): Record<AiToolKey, boolean> {
  return {
    ...AI_TOOL_FLAG_DEFAULTS,
    ...Object.fromEntries(on.map((key) => [key, true])),
  } as Record<AiToolKey, boolean>
}

function toolForm(consented: boolean) {
  const copy = renderToolCopy('cfo_check', 'en', slots)
  return memberShell(
    <AiToolShell title={copy.title}>
      <AiToolForm
        copy={copy}
        consented={consented}
        fileName="example.pdf"
        busy={false}
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
    fileName: 'example.pdf',
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: 'provider_not_configured',
  })
  return memberShell(
    <AiToolShell title={copy.title}>
      <AiToolReport heading={copy.title} output={output} footerLead={copy.footerLead} footerShared={copy.footerShared} onDelete={() => undefined} />
    </AiToolShell>,
  )
}

function screen() {
  if (view === 'unticked') return toolForm(false)
  if (view === 'ticked') return toolForm(true)
  if (view === 'arabic-tool') return toolForm(false)
  if (view === 'report') return report()
  if (view === 'arabic-report') return report()
  if (view === 'settings') {
    return staffShell(
      <div className="max-w-3xl pe-16">
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
        <AiToolSettingsPanel shot={{ retentionDays: 30, flags: { ...AI_TOOL_FLAG_DEFAULTS } }} />
      </div>,
    )
  }
  if (view === 'cards-staff') {
    return staffShell(
      <div className="max-w-3xl pe-16">
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em] text-pearl">{AI_UI.hub}</h1>
        <p className="mt-3 text-[1rem] text-pearl/80">{AI_UI.staffPreview}</p>
        <AiToolCardList flags={{ ...AI_TOOL_FLAG_DEFAULTS }} preview />
      </div>,
    )
  }
  if (view === 'cards-member-empty') {
    return memberShell(
      <div className="max-w-3xl pe-16">
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">{AI_UI.hub}</h1>
        <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">{AI_UI.intro}</p>
        <AiToolCardList flags={{ ...AI_TOOL_FLAG_DEFAULTS }} />
      </div>,
    )
  }
  return memberShell(
    <div className="max-w-3xl pe-16" data-flag-fixture="cfo_check">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">{AI_UI.hub}</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">{AI_UI.intro}</p>
      <AiToolCardList flags={flagsWith(['cfo_check'])} />
    </div>,
  )
}

const entry = view === 'settings' ? '/admin/settings' : view === 'cards-staff' ? '/admin/ai' : '/dashboard/ai'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[entry]}>
      {screen()}
    </MemoryRouter>
  </StrictMode>,
)
