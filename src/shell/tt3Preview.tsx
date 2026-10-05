import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { PrivacyPage } from '../pages/PrivacyPage'
import { RegisterScreen } from '../pages/apply/RegisterScreen'
import { MembershipQueueView, type QueueRow } from '../pages/admin/MembershipDesk'
import { DeleteAccountView } from '../pages/dashboard/account/DeleteAccountView'
import { AppShell } from './AppShell'
import { ACCOUNT_SHEET_LINKS, LOCKED_HUBS, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from './destinations'
import '../index.css'

const state = new URLSearchParams(window.location.search).get('state') || 'privacy'

const counts: Record<string, number> = {
  submitted: 1,
  in_review: 1,
  needs_info: 1,
  review_call: 1,
  waitlisted: 1,
  approved: 1,
  declined: 1,
  closed: 1,
}

const closedRow: QueueRow = {
  userId: '11111111-1111-4111-8111-111111111111',
  name: 'Example Chair',
  role: 'chairperson',
  region: 'ksa_gcc',
  company: 'Example Holdings',
  vouch: 'None',
  submittedAt: '2026-09-01T08:00:00.000Z',
  state: 'closed',
  owner: '',
  stateChangedAt: '2026-09-02T08:00:00.000Z',
}

function frame(path: string, node: ReactNode) {
  return (
    <MemoryRouter initialEntries={[path]}>
      {node}
    </MemoryRouter>
  )
}

let tree: ReactNode = frame('/privacy', <PrivacyPage />)

if (state === 'delete') {
  tree = frame(
    '/dashboard/account/delete',
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
      renderAccountMark={() => <span className="inline-flex h-full w-full items-center justify-center text-[0.7rem]">EC</span>}
    >
      <DeleteAccountView busy={false} error="" onConfirm={() => {}} />
    </AppShell>,
  )
}

if (state === 'register') {
  tree = frame(
    '/register',
    <RegisterScreen
      invite={{ kind: 'none' }}
      submitting={false}
      error="Use a work email. Disposable addresses are not accepted."
      onSubmit={() => {}}
      onFocus={() => {}}
      security="preview"
      nav={<Nav />}
      footer={<Footer />}
    />,
  )
}

if (state === 'chips') {
  tree = frame(
    '/admin/review',
    <AppShell
      tone="staff"
      destinations={STAFF_DESTINATIONS}
      secondary={STAFF_SECONDARY}
      updatedLabel="Updated 09:00"
      roleSwitch={null}
      onSignOut={() => {}}
      accountLabel="staff@example.com"
    >
      <div className="mx-auto max-w-5xl">
        <MembershipQueueView
          rows={[closedRow]}
          state="closed"
          counts={counts}
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
        />
      </div>
    </AppShell>,
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode>{tree}</StrictMode>)
