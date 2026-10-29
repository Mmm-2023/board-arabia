import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { MajlisMailDraft, MajlisRequestCard } from '../../src/lib/majlisRequestReview'
import { MajlisRequestsPage } from '../../src/pages/admin/MajlisRequestsPage'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECONDARY, STAFF_SECTIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import './smoke.css'

export const FULL_EVENT = '20000000-0000-4000-8000-0000000000b1'
export const OPEN_EVENT = '20000000-0000-4000-8000-0000000000b2'
export const FULL_REQUEST = '30000000-0000-4000-8000-0000000000b1'
export const OPEN_REQUEST = '30000000-0000-4000-8000-0000000000b2'
export const UNVERIFIED_REQUEST = '30000000-0000-4000-8000-0000000000b3'

const drafts: MajlisMailDraft[] = [
  {
    kind: 'accept',
    subject: 'DRAFT FOR MICHAEL: Majlis request accepted',
    body: 'DRAFT FOR MICHAEL. This wording is not approved. Nothing is sent.\n\nHello,\n\nYour request to attend this majlis is accepted. Sign in to your free Board Arabia account to open the join link.\n\nOur admin team',
    sendEnabled: false,
  },
  {
    kind: 'decline',
    subject: 'DRAFT FOR MICHAEL: Majlis request declined',
    body: 'DRAFT FOR MICHAEL. This wording is not approved. Nothing is sent.\n\nHello,\n\nYour request to attend this majlis was not accepted this time.\n\nOur admin team',
    sendEnabled: false,
  },
]

function card(over: Partial<MajlisRequestCard> & Pick<MajlisRequestCard, 'id' | 'eventId' | 'eventTitle' | 'status'>): MajlisRequestCard {
  return {
    startsAt: '2026-11-20T15:00:00.000Z',
    endsAt: '2026-11-20T16:30:00.000Z',
    submittedAt: '2026-10-19T09:00:00.000Z',
    seatHeld: false,
    emailVerified: true,
    fullName: 'Ada Example',
    phone: '+966500000000',
    company: 'Example Holdings',
    role: 'chairperson',
    linkedin: 'https://www.linkedin.com/in/example',
    why: 'I chair a board and want the governance discussion.',
    ...over,
  }
}

const requests: MajlisRequestCard[] = [
  card({
    id: FULL_REQUEST,
    eventId: FULL_EVENT,
    eventTitle: 'Governance circle',
    status: 'pending',
    fullName: 'Ada Example',
  }),
  card({
    id: OPEN_REQUEST,
    eventId: OPEN_EVENT,
    eventTitle: 'Capital circle',
    status: 'pending',
    fullName: 'Noura Example',
    company: 'Example Capital',
    role: 'board_member',
    phone: '+442000000000',
    why: 'A board seat search that should stay in the room.',
  }),
  card({
    id: UNVERIFIED_REQUEST,
    eventId: OPEN_EVENT,
    eventTitle: 'Capital circle',
    status: 'received',
    emailVerified: false,
    fullName: 'Omar Example',
    company: 'Example Works',
    role: 'c_suite',
  }),
]

function Screen({ empty }: { empty: boolean }) {
  return (
    <MemoryRouter initialEntries={['/admin/majlis/requests']}>
      <div data-shot={empty ? 'requests-empty' : 'requests'}>
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 16:25"
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel="Admin"
          accountName="Admin"
        >
          <SectionTabs label="Majlis sections" sections={STAFF_SECTIONS.majlis ?? []} />
          <div className="mt-6">
            <MajlisRequestsPage
              preview={{
                requests: empty ? [] : requests,
                drafts,
                fullEventIds: [FULL_EVENT],
                status: empty ? 'empty' : 'ready',
              }}
            />
          </div>
        </AppShell>
      </div>
    </MemoryRouter>
  )
}

const empty = new URLSearchParams(window.location.search).get('view') === 'empty'
const root = document.getElementById('root')
if (root) createRoot(root).render(<Screen empty={empty} />)
