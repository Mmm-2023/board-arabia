import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import csvText from '../../fixtures/cfo/example-holdings.csv?raw'
import { AI_TOOL_FLAG_DEFAULTS } from '../../supabase/functions/_shared/ai_tools.ts'
import { cfoCheckOutput } from '../../supabase/functions/ai-tool-job/tools/cfo_check.ts'
import { AiToolForm, AiToolReport, AiToolShell } from '../../src/components/ai/AiToolDesk'
import { PRIVACY_LINK, TERMS_LINK } from '../../src/lib/aiToolConfig'
import { renderToolCopy, type LegalSlots } from '../../src/lib/aiToolCopy'
import { AiToolSettingsPanel } from '../../src/pages/admin/AiToolSettingsPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
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

const CFO_ACCEPT = '.pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CFO_HINT = {
  en: 'PDF, CSV, or XLSX. 15 MB max. The file and the output are deleted after the retention period.',
  ar: 'ملف PDF أو CSV أو XLSX. الحد 15 ميغابايت. يُحذف الملف والنتيجة بعد مدة الحفظ.',
}

const view = new URLSearchParams(window.location.search).get('view') || 'tool-en'

function memberShell(node: ReactNode, lang: 'en' | 'ar') {
  const destinations =
    lang === 'ar'
      ? MEMBER_DESTINATIONS.map((item) => (item.id === 'ai' ? { ...item, label: 'أدوات الذكاء الاصطناعي' } : item))
      : MEMBER_DESTINATIONS
  return (
    <AppShell
      tone="member"
      destinations={destinations}
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

function toolForm(lang: 'en' | 'ar') {
  const copy = renderToolCopy('cfo_check', lang, slots)
  return memberShell(
    <AiToolShell lang={lang} title={copy.title}>
      <AiToolForm
        copy={copy}
        lang={lang}
        consented={false}
        fileName=""
        busy={false}
        accept={CFO_ACCEPT}
        fileHint={CFO_HINT[lang]}
        onConsent={() => undefined}
        onFile={() => undefined}
        onRun={() => undefined}
      />
    </AiToolShell>,
    lang,
  )
}

function report(lang: 'en' | 'ar') {
  const copy = renderToolCopy('cfo_check', lang, slots)
  const output = cfoCheckOutput({
    fileName: 'example-holdings.csv',
    generatedOn: '30 Sep 2026',
    modelId: null,
    modelSkipReason: 'provider_not_configured',
    sourceText: csvText,
    lang,
  })
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

function screen() {
  if (view === 'tool-ar') return toolForm('ar')
  if (view === 'report-en') return report('en')
  if (view === 'report-ar') return report('ar')
  if (view === 'settings') {
    return staffShell(
      <div className="max-w-3xl pe-16">
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
        <AiToolSettingsPanel shot={{ retentionDays: 30, flags: { ...AI_TOOL_FLAG_DEFAULTS } }} />
      </div>,
    )
  }
  return toolForm('en')
}

const entry = view === 'settings' ? '/admin/settings' : '/dashboard/ai/cfo-check'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[entry]}>
      <div data-preview="">{screen()}</div>
    </MemoryRouter>
  </StrictMode>,
)
