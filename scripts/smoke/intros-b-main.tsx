import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import { assembleHome } from '../../src/lib/homeSnapshot'
import type { IntroSuggestion } from '../../src/lib/introSuggestions'
import type { IntroRow } from '../../src/lib/memberIntros'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { IntroBoard } from '../../src/pages/dashboard/IntroBoard'
import { IntroSuggestions } from '../../src/pages/dashboard/IntroSuggestions'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, MEMBER_SECTIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import '../../src/index.css'

const params = new URLSearchParams(window.location.search)
const view = params.get('view') || 'home'

const LAYLA = '22222222-2222-4222-8222-222222222222'
const NOURA = '66666666-6666-4666-8666-666666666666'
const HANA = '77777777-7777-4777-8777-777777777777'
const SUGGEST_A = '11111111-1111-4111-8111-111111111111'
const SUGGEST_B = '88888888-8888-4888-8888-888888888888'
const SUGGEST_C = '99999999-9999-4999-8999-999999999999'
const MEET = '55555555-5555-4555-8555-555555555555'

const quota = { used: 2, base: 5, allowance: 5, remaining: 3 }

const suggestions: IntroSuggestion[] = [
  suggestion(SUGGEST_A, LAYLA, 'Layla Al-Diriyah', 'Director', 'Diriyah Works', 'Riyadh', 'Both work on energy transition in Riyadh.'),
  suggestion(SUGGEST_B, NOURA, 'Noura Al-Wahat', 'Non-executive director', 'Wahat Counsel', 'Jeddah', 'Both work on energy transition.'),
  suggestion(SUGGEST_C, HANA, 'Hana Al-Safi', 'Family principal', 'Safi Holdings', 'Riyadh', 'Both are in Riyadh.'),
]

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

const meetRow: IntroRow = {
  id: MEET,
  kind: 'member',
  direction: 'incoming',
  status: 'accepted',
  title: 'Layla Al-Diriyah',
  detail: 'Director · Diriyah Works · Riyadh',
  reason: 'Both work on energy transition in Riyadh.',
  is_demo: false,
  subject_id: LAYLA,
  created_at: '2026-09-01T09:15:00.000Z',
  meet_due: true,
}

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

function MemberShell({
  path,
  sections,
  children,
}: {
  path: string
  sections?: readonly { id: string; label: string; to: string; end: boolean }[]
  children: ReactNode
}) {
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
        <div data-preview="">
          {sections ? <SectionTabs label="Sections" sections={sections} /> : null}
          <div className={sections ? 'mt-6' : ''}>{children}</div>
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

function suggestionBlock() {
  return (
    <IntroSuggestions
      rows={suggestions}
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

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    view === 'intros' ? (
      <MemberShell path="/dashboard/people/intros" sections={MEMBER_SECTIONS.people}>
        <div className="max-w-3xl">
          <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Intros</h1>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
            Requests you sent, and requests sent to you. Mandate and real estate unlocks are in this list too.
          </p>
          <p className="mt-3 text-[1rem] text-ink/70">3 of 5 left this month.</p>
          {suggestionBlock()}
        </div>
      </MemberShell>
    ) : view === 'meet' ? (
      <MemberShell path="/dashboard/people/intros" sections={MEMBER_SECTIONS.people}>
        <div className="max-w-3xl">
          <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Intros</h1>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
            After someone accepts, you both see email, LinkedIn, and phone when it is set. Before that, those stay private.
          </p>
          <div className="mt-8">
            <IntroBoard
              tone="member"
              rows={[meetRow]}
              busyId={null}
              error=""
              contacts={{
                [MEET]: {
                  intro_id: MEET,
                  email: 'layla@example.com',
                  linkedin_url: '',
                  phone: '',
                  calendar_url: '',
                },
              }}
              onMeet={() => {}}
            />
          </div>
        </div>
      </MemberShell>
    ) : (
      <MemberShell path="/dashboard">
        <HomeSnapshotView
          model={homeModel}
          seatCaption="Founding seat"
          seatValue="Saudi Arabia"
          userId="huda"
          suggestionsSlot={suggestionBlock()}
        />
      </MemberShell>
    ),
  )
}
