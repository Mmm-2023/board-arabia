import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { BoardSeatDetail } from '../../src/lib/memberBoardSeats'
import { MemberBoardSeatDetail, MemberBoardSeatList } from '../../src/pages/dashboard/MemberBoardSeatsView'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECTIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import './smoke.css'

const SEAT = 'b3000001-0000-4000-8000-0000000000aa'
const POSTED = 'b3000001-0000-4000-8000-0000000000bb'
const INTRO = 'c3000001-0000-4000-8000-0000000000cc'

const published = {
  id: SEAT,
  seatKind: 'ned' as const,
  status: 'published' as const,
  title: 'Independent director',
  sector: 'Health',
  capacity: 'Four meetings a year.',
  sectorTags: ['Health'],
  regions: ['Riyadh'],
  organisationName: 'North Court',
  terms: 'Independent seat. Four meetings a year.',
  narrative: 'North Court is a fictional company. This seat is an illustration.',
  isDemo: false,
  posterIsPartner: true,
}

const detail: BoardSeatDetail = {
  ...published,
  mine: false,
  applicationStatus: null,
  showCardToPartners: false,
}

function Shell({ path, shot, children }: { path: string; shot: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <div data-shot={shot}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel="Updated 09:41"
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel="Member"
          accountName="Example Member"
        >
          <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
          <div className="mt-6">{children}</div>
        </AppShell>
      </div>
    </MemoryRouter>
  )
}

function Preview() {
  const shot = new URLSearchParams(window.location.search).get('shot') || 'list'
  if (shot === 'apply') {
    return (
      <Shell path={`/dashboard/deals/board-seats/${SEAT}`} shot="apply">
        <MemberBoardSeatDetail
          status="ready"
          seat={detail}
          shortlist={null}
          note="Happy to be considered."
          message=""
          notice=""
          busy={false}
          onNote={() => {}}
          onApply={() => {}}
          onOpen={() => {}}
          onRetry={() => {}}
        />
      </Shell>
    )
  }
  if (shot === 'shortlist') {
    return (
      <Shell path={`/dashboard/deals/board-seats/${POSTED}`} shot="shortlist">
        <MemberBoardSeatDetail
          status="ready"
          seat={{
            ...published,
            id: POSTED,
            title: 'Audit chair',
            organisationName: 'Example Holdings',
            seatKind: 'company_board',
            posterIsPartner: false,
            mine: true,
            status: 'published',
            terms: 'Independent seat. Four meetings a year.',
            narrative: 'Example Holdings is a fictional company. This seat is an illustration.',
          }}
          shortlist={[
            {
              id: INTRO,
              memberName: 'Example Applicant',
              headline: 'Board director',
              company: 'Example Holdings',
              note: 'Happy to be considered.',
              status: 'pending',
            },
          ]}
          note=""
          message=""
          notice=""
          busy={false}
          onNote={() => {}}
          onApply={() => {}}
          onOpen={() => {}}
          onRetry={() => {}}
        />
      </Shell>
    )
  }
  return (
      <Shell path="/dashboard/deals/board-seats" shot="list">
        <MemberBoardSeatList
          status="ready"
          seats={[published]}
          applications={[
            {
              id: INTRO,
              roleId: SEAT,
              title: 'Independent director',
              organisationName: 'North Court',
              seatKind: 'ned',
              seatStatus: 'published',
              status: 'pending',
              note: 'Happy to be considered.',
            },
          ]}
          posted={[
            {
              id: POSTED,
              title: 'Audit chair',
              organisationName: 'Example Holdings',
              seatKind: 'company_board',
              status: 'pending_review',
              sector: 'Health',
              capacity: 'Four meetings a year.',
              applicantCount: 0,
            },
          ]}
          onRetry={() => {}}
        />
      </Shell>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
