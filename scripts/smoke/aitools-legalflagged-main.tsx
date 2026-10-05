import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AI_TOOL_FLAG_DEFAULTS } from '../../supabase/functions/_shared/ai_tools.ts'
import { pricingSenseCheckOutput } from '../../supabase/functions/ai-tool-job/tools/pricing_sense_check.ts'
import { termSheetReviewOutput } from '../../supabase/functions/ai-tool-job/tools/term_sheet_review.ts'
import { PricingInputs } from '../../src/components/ai/PricingInputs'
import { AiToolForm, AiToolReport, AiToolShell } from '../../src/components/ai/AiToolDesk'
import { PRIVACY_LINK, TERMS_LINK } from '../../src/lib/aiToolConfig'
import { renderToolCopy, type LegalSlots } from '../../src/lib/aiToolCopy'
import { AiToolSettingsPanel } from '../../src/pages/admin/AiToolSettingsPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import { PRICING_FIXTURE, TERM_SHEET_FIXTURE } from '../fixtures/legal-flagged.ts'
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

const emptyPricing = {
  company: '',
  sector: '',
  stage: '',
  region: '',
  asking: '',
  revenue: '',
  notes: '',
}

const view = new URLSearchParams(window.location.search).get('view') || 'term-en'

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

function toolPage(tool: 'term_sheet_review' | 'pricing_sense_check') {
  const copy = renderToolCopy(tool, 'en', slots)
  return memberShell(
    <AiToolShell title={copy.title}>
      <AiToolForm
        copy={copy}
        consented={false}
        fileName={tool === 'term_sheet_review' ? 'example-term-sheet.txt' : ''}
        busy={false}
        inputsReady={tool === 'pricing_sense_check' ? false : undefined}
        extra={
          tool === 'pricing_sense_check' ? (
            <PricingInputs draft={emptyPricing} onChange={() => undefined} />
          ) : (
            <p className="mt-6 text-[0.95rem] leading-relaxed text-ink/70">
              A text file works best. Put one term on each line, for example: Liquidation preference: 1x non-participating.
            </p>
          )
        }
        onConsent={() => undefined}
        onFile={() => undefined}
        onRun={() => undefined}
      />
    </AiToolShell>,
  )
}

function report(tool: 'term_sheet_review' | 'pricing_sense_check') {
  const copy = renderToolCopy(tool, 'en', slots)
  const output =
    tool === 'term_sheet_review'
      ? termSheetReviewOutput({
          fileName: 'example-term-sheet.txt',
          generatedOn: '30 Sep 2026',
          modelId: null,
          modelSkipReason: 'provider_not_configured',
          sourceText: TERM_SHEET_FIXTURE,
          mimeType: 'text/plain',
        })
      : pricingSenseCheckOutput({
          fileName: 'pricing-inputs.txt',
          generatedOn: '30 Sep 2026',
          modelId: null,
          modelSkipReason: 'provider_not_configured',
          sourceText: PRICING_FIXTURE,
          mimeType: 'text/plain',
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
  if (view === 'term-ar') return toolPage('term_sheet_review')
  if (view === 'term-report') return report('term_sheet_review')
  if (view === 'pricing-en') return toolPage('pricing_sense_check')
  if (view === 'pricing-ar') return toolPage('pricing_sense_check')
  if (view === 'pricing-report') return report('pricing_sense_check')
  if (view === 'settings') {
    return staffShell(
      <div className="max-w-3xl pe-16">
        <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
        <AiToolSettingsPanel shot={{ retentionDays: 30, flags: { ...AI_TOOL_FLAG_DEFAULTS } }} />
      </div>,
    )
  }
  return toolPage('term_sheet_review')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[view === 'settings' ? '/admin/settings' : '/dashboard/ai']}>
      {screen()}
    </MemoryRouter>
  </StrictMode>,
)
