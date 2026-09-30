import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ACCOUNT_SHEET_LINKS, LOCKED_HUBS, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from './destinations'
import { MembershipChecklistView } from '../pages/dashboard/account/MembershipChecklistView'
import { FoundingWelcome } from '../pages/dashboard/FoundingWelcome'
import { MembershipDetailView, MembershipQueueView, type DeskDetail, type QueueRow } from '../pages/admin/MembershipDesk'
import { checklistFromRecord } from '../../supabase/functions/_shared/membership_steps.ts'
import '../index.css'

const state = new URLSearchParams(window.location.search).get('state') || 'checklist'
const partial = checklistFromRecord({
  email_verified_at: '2026-09-30T08:00:00.000Z',
  role: 'chairperson',
  board_seats: 'Board member',
  company_name: 'Example Holdings',
  job_title: 'Chief Executive',
  linkedin_url: 'https://www.linkedin.com/in/example-chair',
  scale_kind: 'turnover',
  scale_band: 't_50m_to_250m',
})
const complete = checklistFromRecord({
  ...{
    email_verified_at: '2026-09-30T08:00:00.000Z',
    role: 'chairperson',
    board_seats: 'Board member',
    company_name: 'Example Holdings',
    job_title: 'Chief Executive',
    linkedin_url: 'https://www.linkedin.com/in/example-chair',
    scale_kind: 'turnover',
    scale_band: 't_50m_to_250m',
    sector_tags: ['Energy transition'],
    vision_tags: ['Thriving economy'],
    statement:
      'I would bring a board seat and a calm view of capital. I want a room of peers who decide carefully. The work is personal, and the room should stay small, private, and useful to the people in it always.',
  },
})

const rows: QueueRow[] = [
  {
    userId: '11111111-1111-4111-8111-111111111111',
    name: 'Example Chair',
    role: 'chairperson',
    region: 'ksa_gcc',
    company: 'Example Holdings',
    vouch: 'None',
    submittedAt: '2026-09-28T08:00:00.000Z',
    state: 'submitted',
    owner: '',
    stateChangedAt: '2026-09-28T08:00:00.000Z',
  },
  {
    userId: '22222222-2222-4222-8222-222222222222',
    name: 'Example Director',
    role: 'board_member',
    region: 'intl',
    company: 'Harbour Example',
    vouch: 'A member',
    submittedAt: '2026-09-20T08:00:00.000Z',
    state: 'in_review',
    owner: 'Assigned',
    stateChangedAt: '2026-09-21T08:00:00.000Z',
  },
  {
    userId: '33333333-3333-4333-8333-333333333333',
    name: 'Example Operator',
    role: 'c_suite',
    region: 'ksa_gcc',
    company: 'Northwind Example',
    vouch: 'None',
    submittedAt: '2026-09-18T08:00:00.000Z',
    state: 'needs_info',
    owner: 'Assigned',
    stateChangedAt: '2026-09-19T08:00:00.000Z',
  },
]

const detail: DeskDetail = {
  userId: rows[0].userId,
  name: 'Example Chair',
  email: 'chair@example.com',
  role: 'chairperson',
  region: 'ksa_gcc',
  company: 'Example Holdings',
  title: 'Chief Executive',
  website: 'https://example.com',
  linkedin: 'https://www.linkedin.com/in/example-chair',
  statement: 'I would bring a board seat and a calm view of capital.',
  crNumber: 'Not listed',
  referral: '',
  phone: 'Not listed',
  vouch: 'None',
  state: 'in_review',
  domainMatch: false,
  linkedinChecked: true,
  crChecked: false,
  seatsLeft: 'Founding places left: Saudi Arabia 48, International 50.',
  events: [{ id: '1', label: '28 Sep 2026: Submitted to In review' }],
  notes: [{ id: '1', body: 'Desk note stays internal.', at: '28 Sep 2026' }],
}

function memberShell(chip: string | null, node: ReactNode) {
  return (
    <MemoryRouter initialEntries={['/dashboard/membership']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={ACCOUNT_SHEET_LINKS}
        lockedDestinationIds={LOCKED_HUBS}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="chair@example.com"
        accountName="Example Chair"
        headerChip={chip}
        renderAccountMark={(size) => (
          <span className="inline-flex h-full w-full items-center justify-center text-[0.7rem]">{size > 40 ? 'EC' : 'EC'}</span>
        )}
      >
        {node}
      </AppShell>
    </MemoryRouter>
  )
}

function staffShell(path: string, node: ReactNode) {
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
        <div className="mx-auto max-w-5xl">{node}</div>
      </AppShell>
    </MemoryRouter>
  )
}

const checklist = (input: ReturnType<typeof checklistFromRecord>) => (
  <MembershipChecklistView
    model={{
      input,
      state: 'open',
      submittedAt: null,
      declinedUntil: null,
      needsQuestion: '',
      needsItems: [],
      emailVerifiedAt: '2026-09-30T08:00:00.000Z',
    }}
    mode="list"
    active={null}
    draft={input}
    saving={false}
    error=""
    consent={false}
    submitting={false}
    reply=""
    onOpen={() => {}}
    onDraft={() => {}}
    onSave={() => {}}
    onConsent={() => {}}
    onSubmit={() => {}}
    onReply={() => {}}
    onReplyChange={() => {}}
  />
)

let tree = memberShell('Membership: 5 of 7', checklist(partial))
if (state === 'gate') tree = memberShell('Membership: 7 of 7', checklist(complete))
if (state === 'queue' || state === 'tabs') {
  tree = staffShell(
    '/admin/applications',
    <MembershipQueueView
      rows={state === 'tabs' ? rows.slice(0, 1) : rows}
      state="submitted"
      counts={{ submitted: 4, in_review: 2, needs_info: 1, review_call: 0, waitlisted: 1, approved: 3, declined: 1, closed: 0 }}
      vouchedOnly={false}
      region=""
      owner=""
      onState={() => {}}
      onVouched={() => {}}
      onRegion={() => {}}
      onOwner={() => {}}
      loading={false}
      error=""
      onRetry={() => {}}
    />,
  )
}
if (state === 'detail') {
  tree = staffShell(
    '/admin/applications/11111111-1111-4111-8111-111111111111',
    <MembershipDetailView
      detail={detail}
      seat="ksa"
      tier="founding"
      reason="fit"
      note=""
      question=""
      busy={false}
      error=""
      confirm={null}
      onSeat={() => {}}
      onTier={() => {}}
      onReason={() => {}}
      onNote={() => {}}
      onQuestion={() => {}}
      onAction={() => {}}
      onTick={() => {}}
      onConfirm={() => {}}
      onCancelConfirm={() => {}}
    />,
  )
}
if (state === 'approved') {
  tree = memberShell(
    null,
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Home</p>
      <h1 className="mt-2 font-display text-[2rem] font-semibold">Good morning</h1>
      <FoundingWelcome tier="founding" foundingNumber={7} onDismiss={() => {}} />
    </div>,
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing preview root')
createRoot(root).render(<StrictMode>{tree}</StrictMode>)
