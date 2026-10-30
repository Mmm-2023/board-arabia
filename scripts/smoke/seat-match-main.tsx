import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { emptyBoardSeatDraft, type BoardSeatRow } from '../../src/lib/boardSeats'
import { emptyBoardroom } from '../../src/lib/boardroom'
import type { SuggestedPerson, SuggestedSeat } from '../../src/lib/seatMatch'
import { BoardSeatsView } from '../../src/pages/admin/BoardSeatsView'
import { BoardroomSection } from '../../src/pages/dashboard/BoardroomSection'
import { MayFitYou, PeopleWhoMayFit, SeatWhyBox } from '../../src/pages/dashboard/SeatSuggestions'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECTIONS, MEMBER_SECONDARY, STAFF_DESTINATIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import './smoke.css'

const seat: SuggestedSeat = {
  id: 'c1111111-1111-4111-8111-111111111111',
  title: 'Independent director',
  organisationName: 'North Court',
  seatKind: 'ned',
  sectorTag: 'Health',
  region: 'Riyadh',
  reasons: [
    { code: 'looking_for', value: 'Board seat' },
    { code: 'sector', value: 'Health' },
    { code: 'where', value: 'Saudi Arabia' },
  ],
}

const person: SuggestedPerson = {
  userId: '11111111-1111-4111-8111-111111111111',
  name: 'Layla Al Harbi',
  headline: 'Independent director',
  company: 'Example Holdings',
  introStatus: null,
  reasons: [
    { code: 'looking_for', value: 'Board seat' },
    { code: 'help_with', value: 'Board experience' },
    { code: 'sector', value: 'Health' },
  ],
}

const adminSeat: BoardSeatRow = {
  ...emptyBoardSeatDraft(),
  id: 'c2222222-2222-4222-8222-222222222222',
  isDemo: false,
  status: 'published',
  title: 'Audit chair',
  sector: 'Health',
  capacity: 'Four meetings a year.',
  sectorTags: ['Health'],
  regions: ['Riyadh'],
  organisationName: 'North Court',
  terms: 'Independent seat.',
  narrative: 'A fictional seat.',
  posterName: 'Example Member',
  applicantCount: 0,
  skillsWanted: ['Governance'],
}

function MemberShell({ shot, children }: { shot: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/dashboard/deals/board-seats']}>
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
          <div className="mt-6 max-w-3xl">{children}</div>
        </AppShell>
      </div>
    </MemoryRouter>
  )
}

function Preview() {
  const shot = new URLSearchParams(window.location.search).get('shot') || 'may-fit'
  if (shot === 'not-open') {
    return (
      <MemberShell shot={shot}>
        <MayFitYou phase="not_open" seats={[]} updatedAt={null} toast="" onRetry={() => {}} onDismiss={() => {}} onSeeAll={() => {}} onUndo={() => {}} />
      </MemberShell>
    )
  }
  if (shot === 'no-fit') {
    return (
      <MemberShell shot={shot}>
        <MayFitYou phase="empty" seats={[]} updatedAt={null} toast="" onRetry={() => {}} onDismiss={() => {}} onSeeAll={() => {}} onUndo={() => {}} />
      </MemberShell>
    )
  }
  if (shot === 'error') {
    return (
      <MemberShell shot={shot}>
        <MayFitYou phase="error" seats={[]} updatedAt={new Date('2026-10-30T18:16:00Z')} toast="" onRetry={() => {}} onDismiss={() => {}} onSeeAll={() => {}} onUndo={() => {}} />
      </MemberShell>
    )
  }
  if (shot === 'loading') {
    return (
      <MemberShell shot={shot}>
        <MayFitYou phase="loading" seats={[]} updatedAt={null} toast="" onRetry={() => {}} onDismiss={() => {}} onSeeAll={() => {}} onUndo={() => {}} />
      </MemberShell>
    )
  }
  if (shot === 'seat') {
    return (
      <MemberShell shot={shot}>
        <SeatWhyBox phase="match" reasons={seat.reasons} onDismiss={() => {}} />
        <article className="border border-[var(--ba-line)] bg-white px-5 py-5">
          <h1 className="font-display text-[2rem] font-bold">Independent director</h1>
          <p className="mt-2 text-[1rem] text-ink/75">North Court. Published.</p>
          <p className="mt-3 text-[1rem]">Skills wanted: Governance</p>
          <button type="button" className="mt-4 inline-flex min-h-12 items-center bg-[var(--ba-indigo)] px-4 text-[1.0625rem] font-semibold text-[var(--ba-porcelain)]">
            Put yourself forward
          </button>
        </article>
      </MemberShell>
    )
  }
  if (shot === 'people') {
    return (
      <MemberShell shot={shot}>
        <PeopleWhoMayFit phase="ready" people={[person]} quota={{ used: 0, base: 4, allowance: 4, remaining: 4 }} onDismiss={() => {}} onAsk={() => {}} />
      </MemberShell>
    )
  }
  if (shot === 'people-none') {
    return (
      <MemberShell shot={shot}>
        <PeopleWhoMayFit phase="empty" people={[]} quota={null} onDismiss={() => {}} onAsk={() => {}} />
      </MemberShell>
    )
  }
  if (shot === 'pending') {
    return (
      <MemberShell shot={shot}>
        <PeopleWhoMayFit phase="pending" people={[]} quota={null} onDismiss={() => {}} onAsk={() => {}} />
      </MemberShell>
    )
  }
  if (shot === 'open-card') {
    return (
      <MemberShell shot={shot}>
        <BoardroomSection
          preview={{
            ...emptyBoardroom(),
            openToSeats: true,
            seatTypes: ['Independent director'],
            seatWhere: ['Saudi Arabia'],
            expertise: ['Governance'],
          }}
        />
      </MemberShell>
    )
  }
  if (shot === 'admin') {
    return (
      <MemoryRouter initialEntries={['/admin/board-seats']}>
        <div data-shot="admin">
          <AppShell
            tone="staff"
            destinations={STAFF_DESTINATIONS}
            secondary={[]}
            updatedLabel="Updated 09:41"
            roleSwitch={null}
            onSignOut={() => {}}
            accountLabel="Admin"
            accountName="Admin"
          >
            <BoardSeatsView
              status="ready"
              seats={[adminSeat]}
              draft={{ ...emptyBoardSeatDraft(), skillsWanted: ['Governance'] }}
              editingId={null}
              message=""
              notice=""
              busy={false}
              openId={null}
              applicants={{}}
              suggestionsEnabled={false}
              onSuggestions={() => {}}
              onDraft={() => {}}
              onSubmit={() => {}}
              onEdit={() => {}}
              onPublish={() => {}}
              onClose={() => {}}
              onOpenApplicants={() => {}}
              onRetry={() => {}}
            />
          </AppShell>
        </div>
      </MemoryRouter>
    )
  }
  return (
    <MemberShell shot="may-fit">
      <h1 className="font-display text-[2.2rem] font-bold">Board seats</h1>
      <MayFitYou phase="ready" seats={[seat]} updatedAt={null} toast="" onRetry={() => {}} onDismiss={() => {}} onSeeAll={() => {}} onUndo={() => {}} />
      <div id="all-board-seats" className="mt-8 border border-[var(--ba-line)] bg-white px-4 py-4">
        <h2 className="font-display text-[1.35rem] font-semibold">Independent director</h2>
        <p className="mt-2 text-[1rem] text-ink/70">North Court</p>
      </div>
    </MemberShell>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
