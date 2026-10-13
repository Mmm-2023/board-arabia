import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { emptyBoardSeatDraft, type BoardSeatDraft, type BoardSeatRow } from '../../src/lib/boardSeats'
import { assembleHome, type AssembleInput } from '../../src/lib/homeSnapshot'
import { BoardSeatsPanel } from '../../src/pages/admin/BoardSeatsPanel'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import './smoke.css'

const DRAFT = 'b3000001-0000-4000-8000-0000000000bb'
const INTRO = 'c3000001-0000-4000-8000-0000000000cc'

const draft: BoardSeatDraft = {
  ...emptyBoardSeatDraft(),
  title: 'Independent director',
  sector: 'Health',
  capacity: 'Four meetings a year.',
  sectorTags: ['Health', 'Financial services'],
  regions: ['Riyadh'],
  organisationName: 'Example Holdings',
  terms: 'Independent seat. Four meetings a year.',
  contactName: 'Noura S.',
  contactEmail: 'noura.seat@example.com',
  contactPhone: 'Extension 20',
  narrative: 'Example Holdings is a fictional company. This seat is an illustration.',
}

const seat: BoardSeatRow = {
  id: DRAFT,
  isDemo: false,
  status: 'pending_review',
  posterName: 'Example Member',
  applicantCount: 1,
  ...draft,
}

function homeInput(): AssembleInput {
  return {
    nowMs: Date.parse('2026-10-13T09:00:00.000Z'),
    seat: 'ksa',
    name: 'Huda Al Sample',
    photoUrl: null,
    profileReady: true,
    mustSetPassword: false,
    invitesRemaining: 0,
    personalCapacityIncluded: false,
    attention: [],
    mandates: [],
    rooms: [],
    directory: [],
    partners: [],
    gatherings: [],
    admitted: 12,
    ksa: 8,
    intl: 4,
    money: [],
    activity: [],
    activityStatus: 'empty',
    loading: false,
    partialError: false,
    updatedLabel: 'Updated 09:00',
  }
}

function Preview() {
  return (
    <MemoryRouter initialEntries={['/admin']}>
      <div data-shot="admin">
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel="Admin"
        >
          <div className="max-w-3xl">
            <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Staff home</h1>
            <BoardSeatsPanel
              preview={{
                seats: [seat],
                openId: DRAFT,
                draft,
                applicants: {
                  [DRAFT]: [
                    {
                      id: INTRO,
                      memberName: 'Example Member',
                      headline: 'Board director',
                      company: 'Example Holdings',
                      note: 'Happy to be considered.',
                      status: 'pending',
                    },
                  ],
                },
              }}
            />
          </div>
        </AppShell>
      </div>
      <div data-shot="member">
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel="Member"
          accountName="Huda Al Sample"
        >
          <HomeSnapshotView
            model={assembleHome(homeInput())}
            needsYou={[]}
            seatCaption="Founding seat"
            seatValue="Saudi Arabia"
            unreadNote={{
              id: 'n1',
              title: 'A seat that fits your profile',
              body: '',
            }}
            onMarkNotificationRead={() => {}}
          />
        </AppShell>
      </div>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
