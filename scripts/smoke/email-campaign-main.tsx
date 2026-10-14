import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPanelView } from '../../src/components/privacy/PrivacyPanelView'
import type { CampaignSummary, EmailScreen, PauseReason } from '../../src/lib/emailCampaign'
import { EmailCampaignView } from '../../src/pages/admin/EmailCampaignView'
import { UnsubscribeConfirm } from '../../src/pages/EmailUnsubscribeView'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import '../../src/index.css'

const view = new URLSearchParams(window.location.search).get('view') || 'release-off'

const counts = {
  eligible: 12,
  not_opted_in: 4,
  suppressed: 1,
  demo: 1,
  anonymised: 0,
  inactive: 2,
  no_address: 0,
  hidden: 1,
}

const log = {
  queued: 0,
  skipped: 1,
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  failed: 0,
  test: 1,
  events: [{ status: 'sent', at: '2026-10-14T09:15:00.000Z', isTest: true }],
}

function letter(status: CampaignSummary['status'], gate: CampaignSummary['release']): CampaignSummary {
  return {
    id: 'letter-1',
    kind: 'campaign',
    category: 'news_invitations',
    subject: 'October note',
    preheader: 'A short note for members',
    bodyText: 'Hello members. This is an example letter.',
    tiers: ['founding'],
    status,
    digestIssueId: null,
    audience: counts,
    release: gate,
    log,
  }
}

const blocked = letter('approved', {
  ready: false,
  isOwner: true,
  masterEnabled: false,
  approved: true,
  testSentByOwner: false,
  versionMatches: false,
  eligible: 12,
})

const open = letter('test_sent', {
  ready: true,
  isOwner: true,
  masterEnabled: true,
  approved: true,
  testSentByOwner: true,
  versionMatches: true,
  eligible: 12,
})

function screenFor(
  campaign: CampaignSummary,
  master: boolean,
  pauseReason: PauseReason = '',
  isOwner = true,
): EmailScreen {
  return { masterEnabled: master, isOwner, pauseReason, campaigns: [campaign] }
}

function StaffShell({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/admin/email']}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 12:15 AST"
        roleSwitch={null}
        onSignOut={() => undefined}
        accountLabel="Account"
        accountName="Admin"
      >
        <div className="mx-auto max-w-5xl">{children}</div>
      </AppShell>
    </MemoryRouter>
  )
}

function campaign(mode: 'off' | 'on' | 'paused' | 'paused-staff') {
  const paused = mode === 'paused' || mode === 'paused-staff'
  const selected = mode === 'on' ? open : paused ? letter('paused', blocked.release) : blocked
  return (
    <StaffShell>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Email</h1>
      <EmailCampaignView
        state="ready"
        screen={screenFor(selected, mode === 'on', paused ? 'complaint_rate' : '', mode !== 'paused-staff')}
        selected={selected}
        draft={selected}
        digestReady
        confirmOpen={mode === 'on'}
        confirmText={mode === 'on' ? '12' : ''}
        newsFrom={paused ? 'news@news.example.com' : ''}
        mailFrom={paused ? 'letters@mail.example.com' : ''}
        onResume={paused ? () => { document.body.dataset.resumed = '1' } : undefined}
        onSelect={() => undefined}
        onNew={() => undefined}
        onDigest={() => undefined}
        onDraft={() => undefined}
        onToggleTier={() => undefined}
        onSave={() => undefined}
        onApprove={() => undefined}
        onTest={() => undefined}
        onMaster={() => undefined}
        onOpenConfirm={() => undefined}
        onConfirmText={() => undefined}
        onRelease={() => undefined}
        onRetry={() => undefined}
      />
    </StaffShell>
  )
}

function preferences() {
  return (
    <MemoryRouter initialEntries={['/dashboard/privacy']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel="Updated 12:15 AST"
        roleSwitch={null}
        onSignOut={() => undefined}
        accountLabel="Account"
        accountName="Example Member"
      >
        <PrivacyPanelView
          hidden={false}
          showSponsors={false}
          twoStepOn={false}
          analyticsOn={false}
          privacyContact={null}
          downloadState="idle"
          digestOptIn
          newsOptIn={false}
          deliveryConnected={false}
          onHidden={() => undefined}
          onShowSponsors={() => undefined}
          onDownload={() => undefined}
          onDigestOptIn={() => undefined}
          onNewsOptIn={() => undefined}
        />
      </AppShell>
    </MemoryRouter>
  )
}

function UnsubscribeShot({ error = false }: { error?: boolean }) {
  return (
    <MemoryRouter initialEntries={['/email/unsubscribe?t=example']}>
      <UnsubscribeConfirm
        tokenPresent
        done={false}
        error={error}
        onConfirm={() => undefined}
      />
    </MemoryRouter>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    view === 'release-on' ? campaign('on')
    : view === 'paused' ? campaign('paused')
    : view === 'paused-staff' ? campaign('paused-staff')
    : view === 'preferences' ? preferences()
    : view === 'unsubscribe' ? <UnsubscribeShot />
    : view === 'unsubscribe-error' ? <UnsubscribeShot error />
    : campaign('off'),
  )
}
