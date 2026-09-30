import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AI_TOOL_FLAG_DEFAULTS, AI_TOOL_NAMES } from '../../supabase/functions/_shared/ai_tools.ts'
import { cfoCheckOutput } from '../../supabase/functions/ai-tool-job/tools/cfo_check.ts'
import { AiToolCardList } from '../../src/components/ai/AiToolCards'
import { AiToolForm, AiToolReport, AiToolShell } from '../../src/components/ai/AiToolDesk'
import { renderToolCopy, type LegalSlots } from '../../src/lib/aiToolCopy'
import { AiToolSettingsPanel } from '../../src/pages/admin/AiToolSettingsPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './home.css'

const slots: LegalSlots = {
  entity: 'Example Holdings',
  cr: '0000000000',
  provider: 'Example AI',
  privacy: 'https://example.com/privacy',
  terms: 'https://example.com/terms',
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

function toolForm(lang: 'en' | 'ar', consented: boolean) {
  const copy = renderToolCopy('cfo_check', lang, slots)
  return memberShell(
    <AiToolShell lang={lang} title={copy.title}>
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

function screen() {
  if (view === 'unticked') return toolForm('en', false)
  if (view === 'ticked') return toolForm('en', true)
  if (view === 'arabic') return toolForm('ar', false)
  if (view === 'report') {
    const copy = renderToolCopy('cfo_check', 'en', slots)
    const output = cfoCheckOutput({
      fileName: 'example.pdf',
      generatedOn: '30 Sep 2026',
      modelId: null,
      modelSkipReason: 'provider_not_configured',
    })
    return memberShell(
      <AiToolShell lang="en" title={copy.title}>
        <AiToolReport output={output} footerLead={copy.footerLead} footerShared={copy.footerShared} onDelete={() => undefined} />
      </AiToolShell>,
    )
  }
  if (view === 'settings') {
    return staffShell(
      <div className="max-w-3xl pe-16">
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
        <AiToolSettingsPanel shot={{ retentionDays: 30, flags: { ...AI_TOOL_FLAG_DEFAULTS } }} />
      </div>,
    )
  }
  return memberShell(
    <div className="max-w-3xl pe-16">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">AI tools</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
        Live tools only. Each one says what it checks and what it will not do.
      </p>
      <AiToolCardList flags={{ ...AI_TOOL_FLAG_DEFAULTS }} staff />
      <p className="sr-only">{AI_TOOL_NAMES.cfo_check}</p>
    </div>,
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[view === 'settings' ? '/admin/settings' : '/dashboard/ai']}>
      {screen()}
    </MemoryRouter>
  </StrictMode>,
)
