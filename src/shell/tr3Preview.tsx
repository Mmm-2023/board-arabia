/**
 * Screenshot-only preview for scripts/capture-tr3.mjs.
 * Not imported by App, main, or any route, so the production bundle leaves it out.
 */
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { MarketingView } from '../pages/admin/MarketingView'
import { MarketingHomeCardView } from '../pages/admin/MarketingHomeCard'
import { MembershipDetailView, type DeskDetail } from '../pages/admin/MembershipDesk'
import { emptyFunnel, type FunnelPayload } from '../lib/marketing'
import { AppShell } from './AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY } from './destinations'
import '../index.css'

const state = new URLSearchParams(window.location.search).get('state') || 'marketing'

const exampleFunnel: FunnelPayload = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
  channel: 'all',
  funnel: {
    form_sent: 42,
    email_verified: 18,
    legacy_applications: 6,
    checklist_complete: 11,
    full_requested: 8,
    approved: 7,
    legacy_approved: 5,
  },
  checklist: [
    { step: 'email', count: 18 },
    { step: 'role', count: 16 },
    { step: 'company_title', count: 14 },
    { step: 'linkedin', count: 13 },
    { step: 'scale_band', count: 12 },
    { step: 'sectors', count: 11 },
    { step: 'statement', count: 11 },
    { step: 'cr_number', count: 6 },
    { step: 'referral', count: 5 },
    { step: 'capacity', count: 'lt5' },
    { step: 'phone', count: 'lt5' },
  ],
  sources: [
    { source: 'linkedin', medium: 'social', kind: 'organic', line: 'candidate', registrations: 12, approved: 5 },
    { source: 'linkedin', medium: 'paid_social', kind: 'paid', line: 'candidate', registrations: 6, approved: 'lt5' },
    { source: 'direct', medium: 'none', kind: 'organic', line: 'legacy', registrations: 6, approved: 5 },
  ],
  days: [{ day: '2026-09-20', registrations: 6 }],
  has_quiet_days: true,
  has_spend: false,
}

const detail: DeskDetail = {
  userId: '11111111-1111-4111-8111-111111111111',
  name: 'Example Chair',
  email: 'chair@example.com',
  role: 'chairperson',
  region: 'ksa_gcc',
  company: 'Example Holdings',
  title: 'Chief Executive',
  website: 'https://example.com',
  linkedin: 'https://www.linkedin.com/in/example-chair',
  statement: 'A short statement for the desk.',
  crNumber: '',
  referral: '',
  phone: '',
  vouch: '',
  state: 'in_review',
  domainMatch: true,
  linkedinChecked: false,
  crChecked: false,
  seatsLeft: 'Founding places left: Saudi Arabia 48, International 50.',
  events: [],
  notes: [],
  firstTouch: 'linkedin / social',
  firstTouchPaid: false,
}

function shell(path: string, node: ReactNode) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 09:00"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="staff@example.com"
      >
        <div className="mx-auto max-w-6xl">{node}</div>
      </AppShell>
    </MemoryRouter>
  )
}

const noop = () => {}

const screen =
  state === 'empty' ? (
    shell(
      '/admin/marketing',
      <MarketingView
        range="30"
        channel="all"
        compare={false}
        customFrom=""
        customTo=""
        onRange={noop}
        onChannel={noop}
        onCompare={noop}
        onCustom={noop}
        funnel={emptyFunnel()}
        previous={null}
        stats={null}
        statsStatus="not_live"
        lastGoodAt={null}
        loadingFunnel={false}
        funnelError=""
        denied={false}
        updatedAt={new Date('2026-09-30T09:00:00+03:00')}
        onRetry={noop}
      />,
    )
  ) : state === 'home' ? (
    shell(
      '/admin',
      <div>
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Staff home</h1>
        <MarketingHomeCardView
          loading={false}
          error={false}
          visits="Not live yet"
          registrations="18"
          source="linkedin / social"
          example
        />
      </div>,
    )
  ) : state === 'chip' ? (
    shell('/admin/review/11111111-1111-4111-8111-111111111111', <MembershipDetailView
      detail={detail}
      seat="ksa"
      tier="founding"
      reason="fit"
      note=""
      question=""
      busy={false}
      error=""
      confirm={null}
      onSeat={noop}
      onTier={noop}
      onReason={noop}
      onNote={noop}
      onQuestion={noop}
      onAction={noop}
      onTick={noop}
      onConfirm={noop}
      onCancelConfirm={noop}
    />)
  ) : (
    shell(
      '/admin/marketing',
      <MarketingView
        range="30"
        channel="all"
        compare
        customFrom=""
        customTo=""
        onRange={noop}
        onChannel={noop}
        onCompare={noop}
        onCustom={noop}
        funnel={exampleFunnel}
        previous={{
          ...exampleFunnel,
          funnel: { ...exampleFunnel.funnel, email_verified: 12, approved: 5 },
        }}
        stats={null}
        statsStatus="not_live"
        lastGoodAt={null}
        loadingFunnel={false}
        funnelError=""
        denied={false}
        updatedAt={new Date('2026-09-30T09:00:00+03:00')}
        onRetry={noop}
        example
      />,
    )
  )

const root = document.getElementById('root')
if (!root) throw new Error('Missing preview root')
createRoot(root).render(<StrictMode>{screen}</StrictMode>)
