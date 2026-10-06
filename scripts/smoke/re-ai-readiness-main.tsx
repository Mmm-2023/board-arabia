import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import teaser from '../../fixtures/re/example-teaser.txt?raw'
import { dealReadinessOutput } from '../../supabase/functions/ai-tool-job/tools/deal_readiness.ts'
import { AiToolJobStatus, AiToolReport, AiToolShell, AiToolWillList } from '../../src/components/ai/AiToolDesk'
import { DealReadinessSkeleton } from '../../src/components/ai/DealReadinessMemo'
import { DealReadinessForm, DealReadinessNotice } from '../../src/components/ai/DealReadinessView'
import { PRIVACY_LINK, TERMS_LINK } from '../../src/lib/aiToolConfig'
import { previewAiReportOperator } from '../../src/lib/aiReportOperator'
import { renderToolCopy, type LegalSlots } from '../../src/lib/aiToolCopy'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS } from '../../src/shell/destinations'
import './home.css'

const operatorOff = new URLSearchParams(window.location.search).get('operator') === 'off'
previewAiReportOperator(
  operatorOff ? null : { entity: 'NAMMCO Holding Co.', cr: '7043252647' },
)

const slots: LegalSlots = {
  entity: '',
  cr: '',
  provider: 'Example AI',
  privacy: PRIVACY_LINK,
  terms: TERMS_LINK,
  retentionDays: 30,
  date: '05 Oct 2026',
}

const view = new URLSearchParams(window.location.search).get('view') || 'upload'

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
      accountName="Sample Member"
    >
      {node}
    </AppShell>
  )
}

function screen() {
  const copy = renderToolCopy('deal_readiness', 'en', slots)
  const notice = <DealReadinessNotice text={copy.banner} />
  if (view === 'running') {
    return memberShell(
      <AiToolShell title={copy.title} notice={notice}>
        <AiToolWillList will={copy.will} willNot={copy.willNot} />
        <AiToolJobStatus status="reading" step="intake" />
        <DealReadinessSkeleton />
      </AiToolShell>,
    )
  }
  if (view === 'memo') {
    const output = dealReadinessOutput({
      fileName: 'example-teaser.txt',
      generatedOn: '05 Oct 2026',
      modelId: null,
      modelSkipReason: 'document_only',
      sourceText: teaser,
      lang: 'en',
    })
    return memberShell(
      <AiToolShell title={copy.title} notice={notice}>
        <AiToolWillList will={copy.will} willNot={copy.willNot} />
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
  return memberShell(
    <AiToolShell title={copy.title} notice={notice}>
      <DealReadinessForm
        copy={copy}
        retentionDays={30}
        consented={false}
        fileName="example-teaser.txt"
        busy={false}
        onConsent={() => undefined}
        onFile={() => undefined}
        onRun={() => undefined}
      />
    </AiToolShell>,
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/dashboard/ai/deal-readiness']}>
      <div data-preview="">{screen()}</div>
    </MemoryRouter>
  </StrictMode>,
)
