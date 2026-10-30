import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import type { MajlisEventRow } from '../../src/lib/supabase'
import { AI_TOOL_FLAG_DEFAULTS } from '../../supabase/functions/_shared/ai_tools'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import { CardSkeleton, EmptyState, ErrorBanner } from '../../src/shell/ViewState'
import { MEMBER_VIEWS } from '../../src/shell/viewCopy'
import { AiToolsHome } from '../../src/pages/dashboard/AiToolsHome'
import { AiToolsLayout } from '../../src/pages/dashboard/AiToolsLayout'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { DealsLayout } from '../../src/pages/dashboard/DealsLayout'
import { MajlisLayout } from '../../src/pages/dashboard/MajlisLayout'
import { MajlisPage } from '../../src/pages/dashboard/MajlisPage'
import { RealEstateBoard } from '../../src/pages/dashboard/RealEstateBoard'
import './smoke.css'

const userId = 'a1000001-0000-4000-8000-000000000001'

const member: MemberRow = {
  user_id: userId,
  email: 'member@example.com',
  seat: 'intl',
  status: 'active',
  must_set_password: false,
  invites_remaining: 2,
  invites_granted: 2,
  founding_number: 1,
  tier: 'founding',
}

const profile: ProfileRow = {
  user_id: userId,
  full_name: 'Example Member',
  headline: 'Chair',
  company: 'Example House',
  location: 'Riyadh',
  linkedin_url: null,
  bio: null,
  phone: null,
  investable_capacity_usd: null,
  fo_aum_usd: null,
  turnover_usd: null,
  capacity_currency: null,
  include_in_public_aggregates: false,
  capacity_verified: false,
  avatar_path: null,
  avatar_style: 'male',
}

const room: MemberRoom = {
  userId,
  email: 'member@example.com',
  staffRole: null,
  member,
  profile,
  reload: async () => {},
}

const event: MajlisEventRow = {
  id: '10000000-0000-4000-8000-0000000000a1',
  host_member_id: userId,
  title: 'Example gathering',
  description: 'A private gathering for members.',
  region: 'Riyadh',
  focus_tags: ['Governance'],
  starts_at: '2099-01-02T10:00:00.000Z',
  ends_at: '2099-01-02T12:00:00.000Z',
  timezone: 'Asia/Riyadh',
  capacity: 12,
  venue_name: 'Example venue',
  venue_address: null,
  venue_visibility: 'members_on_rsvp',
  status: 'published',
  rejection_feedback: null,
  admin_note: null,
  approved_at: '2099-01-01T00:00:00.000Z',
  created_at: '2099-01-01T00:00:00.000Z',
  map_lat: null,
  map_lng: null,
  rsvp_opens_at: '2099-01-01T00:00:00.000Z',
  founding_priority_ends_at: null,
  featured: false,
  sponsor_label: null,
  cancelled_at: null,
  cancel_reason: null,
  registered_count: 1,
  waitlist_count: 0,
  my_rsvp_status: null,
  my_waitlist_position: null,
  host_avatar_style: 'male',
  host_avatar_path: null,
  host_full_name: 'Example Member',
}

type ScreenName = 'deals' | 'ai' | 'real-estate' | 'majlis'
type StateName = 'ready' | 'loading' | 'empty' | 'error'

function query(name: string, fallback: string) {
  return new URLSearchParams(window.location.search).get(name) || fallback
}

function screenName(): ScreenName {
  const value = query('screen', 'deals')
  if (value === 'ai' || value === 'real-estate' || value === 'majlis') return value
  return 'deals'
}

function stateName(): StateName {
  const value = query('state', 'ready')
  if (value === 'loading' || value === 'empty' || value === 'error') return value
  return 'ready'
}

const flags = {
  ...AI_TOOL_FLAG_DEFAULTS,
  cfo_check: true,
  deal_readiness: true,
}

function DealsBody({ state }: { state: StateName }) {
  const copy = MEMBER_VIEWS.mandates
  return (
    <div className="max-w-3xl" data-up2-screen="deals">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Mandates</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/70">
        Capital briefs published by our admin team.
      </p>
      {state === 'loading' ? (
        <div className="mt-6">
          <CardSkeleton tone="member" label="Loading mandates" />
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="mt-6">
          <ErrorBanner tone="member" message={copy.error} retryLabel={copy.retry} onRetry={() => {}} />
        </div>
      ) : null}
      {state === 'empty' ? (
        <div className="mt-6">
          <EmptyState tone="member" message={copy.empty} />
        </div>
      ) : null}
    </div>
  )
}

function AiBody({ state }: { state: StateName }) {
  const live = state === 'empty' ? { ...AI_TOOL_FLAG_DEFAULTS } : flags
  return (
    <div data-up2-screen="ai">
      <AiToolsHome
        preview={{
          flags: state === 'loading' || state === 'error' ? null : state === 'empty' ? { ...AI_TOOL_FLAG_DEFAULTS } : live,
          flagsError: state === 'error',
          reports: state === 'loading' ? null : [],
          reportsError: false,
        }}
      />
    </div>
  )
}

function RealEstateScreen({ state }: { state: StateName }) {
  const status = state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'
  return (
    <div data-up2-screen="real-estate">
      <RealEstateBoard
        status={status}
        cards={[]}
        busyId={null}
        requestError={false}
        onRetry={() => {}}
        onRequest={() => {}}
      />
    </div>
  )
}

function pathFor(screen: ScreenName) {
  if (screen === 'ai') return '/dashboard/ai'
  if (screen === 'real-estate') return '/dashboard/deals/real-estate'
  if (screen === 'majlis') return '/dashboard/majlis'
  return '/dashboard/deals/mandates'
}

const screen = screenName()
const state = stateName()
const majlisEvents = state === 'empty' ? [] : [event]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[pathFor(screen)]}>
      <MemberContext.Provider value={room}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel={null}
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel="Example Member"
          accountName="Example Member"
        >
          <Routes>
            <Route path="/dashboard/deals" element={<DealsLayout />}>
              <Route path="mandates" element={<DealsBody state={state} />} />
              <Route path="real-estate" element={<RealEstateScreen state={state} />} />
            </Route>
            <Route path="/dashboard/ai" element={<AiToolsLayout />}>
              <Route index element={<AiBody state={state} />} />
            </Route>
            <Route path="/dashboard/majlis" element={<MajlisLayout />}>
              <Route
                index
                element={
                  <MajlisPage
                    preview={{
                      events: majlisEvents,
                      ...(state === 'loading' ? { loading: true } : {}),
                      ...(state === 'error' ? { error: true } : {}),
                    }}
                  />
                }
              />
            </Route>
          </Routes>
        </AppShell>
      </MemberContext.Provider>
    </MemoryRouter>
  </StrictMode>,
)
