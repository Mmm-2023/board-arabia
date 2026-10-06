import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import { assembleHome } from '../../src/lib/homeSnapshot'
import type { IntroSuggestion } from '../../src/lib/introSuggestions'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { IntroBoard } from '../../src/pages/dashboard/IntroBoard'
import { IntroSuggestions } from '../../src/pages/dashboard/IntroSuggestions'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, MEMBER_SECTIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import '../../src/index.css'

const params = new URLSearchParams(window.location.search)
const view = params.get('view') || 'home-two'

const LAYLA = 'layla'
const NOURA = 'noura'
const HANA = 'hana'
const SUGGEST_A = 'suggest-a'
const SUGGEST_B = 'suggest-b'

const quota = { used: 0, base: 5, allowance: 5, remaining: 5 }

function suggestion(
  id: string,
  suggestedId: string,
  fullName: string,
  headline: string,
  company: string,
  location: string,
  reason: string,
): IntroSuggestion {
  return {
    id,
    suggested_id: suggestedId,
    full_name: fullName,
    headline,
    company,
    location,
    reason,
    avatar_style: 'female',
    avatar_path: null,
  }
}

const twoNew: IntroSuggestion[] = [
  suggestion(SUGGEST_A, LAYLA, 'Layla Al-Diriyah', 'Director', 'Diriyah Works', 'Riyadh', 'Both work on energy transition in Riyadh.'),
  suggestion(SUGGEST_B, NOURA, 'Noura Al-Wahat', 'Non-executive director', 'Wahat Counsel', 'Jeddah', 'Both work on energy transition.'),
]

// First card is carried from last week. Second card is new this week.
const carriedAndNew: IntroSuggestion[] = [
  suggestion(SUGGEST_A, LAYLA, 'Layla Al-Diriyah', 'Director', 'Diriyah Works', 'Riyadh', 'Both work on energy transition in Riyadh.'),
  suggestion(SUGGEST_B, HANA, 'Hana Al-Safi', 'Family principal', 'Safi Holdings', 'Riyadh', 'Both are in Riyadh.'),
]

const homeModel = assembleHome({
  nowMs: Date.parse('2026-09-30T09:15:00.000Z'),
  seat: 'ksa',
  name: 'Huda Al-Harbi',
  photoUrl: null,
  avatarStyle: 'female',
  profileReady: true,
  mustSetPassword: false,
  invitesRemaining: 2,
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
  updatedLabel: 'Updated 09:15',
})

function MemberShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel="Updated 09:15"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Account"
        accountName="Huda Al-Harbi"
        accountMark={<Avatar src={null} avatarStyle="female" size={36} alt="" />}
      >
        <div data-preview="">{children}</div>
      </AppShell>
    </MemoryRouter>
  )
}

function suggestionBlock(rows: IntroSuggestion[]) {
  return (
    <IntroSuggestions
      rows={rows}
      quota={quota}
      introStatus={() => null}
      busyId={null}
      errorId={null}
      error=""
      showEmpty
      onRequest={() => {}}
    />
  )
}

function introsPage(rows: IntroSuggestion[]) {
  return (
    <MemberShell path="/dashboard/people/intros">
      <SectionTabs label="Sections" sections={MEMBER_SECTIONS.people ?? []} />
      <div className="mt-6 max-w-3xl">
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Intros</h1>
        <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
          Requests you sent, and requests sent to you. Mandate and real estate unlocks are in this list too.
        </p>
        <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
          After someone accepts, you both see email, LinkedIn, and phone when it is set. Before that, those stay private.
        </p>
        <p className="mt-3 text-[1rem] text-ink/70">5 of 5 left this month.</p>
        {suggestionBlock(rows)}
        <div className="mt-8">
          <IntroBoard tone="member" rows={[]} busyId={null} error="" />
        </div>
      </div>
    </MemberShell>
  )
}

const root = document.getElementById('root')
if (root) {
  const screen =
    view === 'home-carried' ? (
      <MemberShell path="/dashboard">
        <HomeSnapshotView
          model={homeModel}
          seatCaption="Founding seat"
          seatValue="Saudi Arabia"
          userId="huda"
          suggestionsSlot={suggestionBlock(carriedAndNew)}
        />
      </MemberShell>
    ) : view === 'intros-two' ? (
      introsPage(twoNew)
    ) : view === 'intros-empty' ? (
      introsPage([])
    ) : (
      <MemberShell path="/dashboard">
        <HomeSnapshotView
          model={homeModel}
          seatCaption="Founding seat"
          seatValue="Saudi Arabia"
          userId="huda"
          suggestionsSlot={suggestionBlock(twoNew)}
        />
      </MemberShell>
    )
  createRoot(root).render(screen)
}
