import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { WeeklyDigestView } from '../../src/components/digest/WeeklyDigestView'
import { assembleHome, type AssembleInput } from '../../src/lib/homeSnapshot'
import { buildNeedsYou, digestPreviewLines } from '../../src/lib/homeNeeds'
import type { WeeklyDigestModel } from '../../src/lib/weeklyDigest'
import { DailyMarketBriefCard } from '../../src/pages/dashboard/DailyMarketBriefCard'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { IntroSuggestions } from '../../src/pages/dashboard/IntroSuggestions'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, MEMBER_SECTIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import '../../src/index.css'

const digest: WeeklyDigestModel = {
  mailReady: false,
  newMembers: [{ fullName: 'Example Member', headline: 'Director', company: 'Example Co' }],
  newMandates: [
    {
      sector: 'Health',
      dealType: 'Advisory',
      ticketBand: 'Mid band',
      geography: 'KSA',
      oneLiner: 'An advisory brief for a regional care network.',
    },
  ],
  upcomingEvents: [
    {
      title: 'Example gathering',
      when: '16 Oct 2026, 18:00',
      region: 'Riyadh',
      hostName: 'Board Arabia',
      venueAddress: null,
    },
  ],
  introductions: [],
  notes: [],
}

const input: AssembleInput = {
  nowMs: Date.parse('2026-10-13T09:00:00.000Z'),
  seat: 'ksa',
  name: 'Example Member',
  photoUrl: null,
  profileReady: true,
  mustSetPassword: false,
  invitesRemaining: 0,
  personalCapacityIncluded: false,
  attention: [],
  mandates: [],
  rooms: [],
  directory: [],
  partners: [
    {
      id: 'p-live',
      is_demo: false,
      is_partner: true,
      name: 'Example Capital',
      monogram: 'EC',
      blurb: 'One line for a fixture partner.',
    },
  ],
  gatherings: [],
  admitted: 12,
  ksa: 8,
  intl: 4,
  money: [],
  activity: [
    {
      id: 'e1',
      kind: 'intro',
      label: 'Intro requested',
      detail: 'Health · Advisory',
      happenedAt: '2026-10-12T09:00:00.000Z',
      href: '/dashboard/deals/mandates',
      example: false,
    },
  ],
  activityStatus: 'ready',
  loading: false,
  partialError: false,
  updatedLabel: null,
}

const needsYou = buildNeedsYou({
  twoStepOff: true,
  profileGaps: 2,
  invites: [{ id: 'a3000001-0000-4000-8000-000000000001', name: 'Care network room' }],
  suggestionCount: 2,
  attention: [],
})

function Shell({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => undefined}
        accountLabel="member@example.com"
        accountName="Example Member"
      >
        {children}
      </AppShell>
    </MemoryRouter>
  )
}

function screen() {
  const view = new URLSearchParams(window.location.search).get('view') || 'home'
  if (view === 'digest') {
    return (
      <Shell path="/dashboard/digest">
        <div className="max-w-3xl" data-destination="digest">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Home</p>
          <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">This week</h1>
          <div className="mt-6">
            <WeeklyDigestView digest={digest} />
          </div>
        </div>
      </Shell>
    )
  }
  if (view === 'deals') {
    return (
      <Shell path="/dashboard/deals/mandates">
        <div data-destination="deals">
          <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
          <h1 className="mt-6 font-display text-[2rem] font-semibold tracking-[-0.03em]">Mandates</h1>
          <p className="mt-3 max-w-xl text-[1rem] text-ink/70">
            Sector, deal type, and stage stay visible. Locked details stay locked until an intro is approved.
          </p>
        </div>
      </Shell>
    )
  }
  if (view === 'intros') {
    return (
      <Shell path="/dashboard/people/intros">
        <div data-destination="intros">
          <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
          <h1 className="mt-6 font-display text-[2rem] font-semibold tracking-[-0.03em]">Intros</h1>
          <IntroSuggestions
            rows={[
              {
                id: 'a1000001-0000-4000-8000-000000000011',
                suggested_id: 'a1000001-0000-4000-8000-000000000012',
                full_name: 'Example Member B',
                headline: 'Director',
                company: 'Example Co',
                location: 'Riyadh',
                reason: 'Shared sector.',
                avatar_path: null,
              },
            ]}
            quota={null}
            introStatus={() => null}
            busyId={null}
            errorId={null}
            error=""
            portrait={() => null}
            onRequest={() => undefined}
          />
        </div>
      </Shell>
    )
  }
  if (view === 'rooms') {
    return (
      <Shell path="/dashboard/deals/rooms">
        <div data-destination="rooms">
          <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
          <h1 className="mt-6 font-display text-[2rem] font-semibold tracking-[-0.03em]">Deal rooms</h1>
          <p className="mt-3 text-[1rem] text-ink/70">Care network room</p>
        </div>
      </Shell>
    )
  }
  if (view === 'room') {
    return (
      <Shell path="/dashboard/deals/rooms/a3000001-0000-4000-8000-000000000001">
        <div data-destination="room">
          <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Care network room</h1>
          <p className="mt-3 text-[1rem] text-ink/70">You're invited to this deal room.</p>
        </div>
      </Shell>
    )
  }
  if (view === 'profile') {
    return (
      <Shell path="/dashboard/profile">
        <div data-destination="profile" id="profile-tags">
          <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Your details</h1>
          <p className="mt-3 text-[1rem] text-ink/70">Sector, themes, and location.</p>
        </div>
      </Shell>
    )
  }
  if (view === 'two-step') {
    return (
      <Shell path="/dashboard/two-step">
        <div data-destination="two-step">
          <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Two-step sign-in</h1>
          <p className="mt-3 text-[1rem] text-ink/70">Turn on two-step sign-in to protect your account.</p>
        </div>
      </Shell>
    )
  }
  return (
    <Shell path="/dashboard">
      <HomeSnapshotView
        model={assembleHome(input)}
        seatCaption="Founding seat"
        seatValue="Saudi Arabia"
        userId="example-member"
        needsYou={needsYou}
        weekLines={digestPreviewLines(digest)}
        digestNotice={
          new URLSearchParams(window.location.search).get('notice') === '1'
            ? { title: "This week's update is ready", href: '/dashboard/digest' }
            : null
        }
        dailyBriefSlot={
          <DailyMarketBriefCard
            brief={{
              briefDate: '2026-10-13',
              generatedAt: '2026-10-13T06:00:00.000Z',
              items: [
                {
                  group: 'deals',
                  summary: 'Example holding agrees a sample joint venture.',
                  outlet: 'Saudi Press Agency',
                  url: 'https://www.spa.gov.sa/w/example-deal',
                  dated: '2026-10-13',
                },
              ],
            }}
          />
        }
      />
    </Shell>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      {screen()}
    </StrictMode>,
  )
}
