import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { MembershipChecklistView, type MembershipModel } from '../../src/pages/dashboard/account/MembershipChecklistView'
import type { ChecklistInput } from '../../supabase/functions/_shared/membership_steps'
import { AppShell } from '../../src/shell/AppShell'
import { ACCOUNT_SHEET_LINKS, MEMBER_DESTINATIONS } from '../../src/shell/destinations'
import '../../src/index.css'

const input: ChecklistInput = {
  emailVerified: true,
  role: 'chairperson',
  boardSeats: '',
  companyName: 'Example Company',
  jobTitle: 'Chair',
  companyWebsite: 'https://example.com',
  linkedinUrl: 'https://example.com/in/member',
  scaleKind: '',
  scaleBand: '',
  sectorTags: ['Industry'],
  visionTags: [],
  statement: 'A short example statement.',
  crNumber: '',
  crCountry: '',
  referralName: '',
  invited: false,
  investable: '',
  phone: '',
}

const model: MembershipModel = {
  input,
  state: 'open',
  submittedAt: null,
  declinedUntil: null,
  needsQuestion: '',
  needsItems: [],
  emailVerifiedAt: '2026-10-01T08:00:00.000Z',
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')

createRoot(root).render(
  <MemoryRouter initialEntries={['/dashboard/membership']}>
    <AppShell
      tone="member"
      destinations={MEMBER_DESTINATIONS}
      secondary={ACCOUNT_SHEET_LINKS}
      updatedLabel={null}
      roleSwitch={null}
      onSignOut={() => {}}
      accountLabel="member@example.com"
      accountName="Example Member"
      renderAccountMark={(size) => (
        <span data-account-photo="" data-photo-size={size}>
          EM
        </span>
      )}
    >
      <MembershipChecklistView
        model={model}
        mode="list"
        active={null}
        draft={input}
        saving={false}
        error=""
        consent={false}
        submitting={false}
        onOpen={() => {}}
        onDraft={() => {}}
        onSave={() => {}}
        onConsent={() => {}}
        onSubmit={() => {}}
        onReply={() => {}}
        reply=""
        onReplyChange={() => {}}
      />
    </AppShell>
  </MemoryRouter>,
)
