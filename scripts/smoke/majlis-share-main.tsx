import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import type { MajlisEventRow } from '../../src/lib/supabase'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { MajlisPage } from '../../src/pages/dashboard/MajlisPage'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY, MEMBER_SECTIONS } from '../../src/shell/destinations'
import { MEMBER_VIEWS } from '../../src/shell/viewCopy'
import { SectionTabs } from '../../src/shell/SectionTabs'
import './smoke.css'

const USER = '22222222-2222-4222-8222-222222222222'
const HOST = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-10-30T09:00:00.000Z')
const FUTURE = '00000000-0000-4000-8000-0000000000a1'
const SECOND = '00000000-0000-4000-8000-0000000000a2'
const PAST = '00000000-0000-4000-8000-0000000000a3'

const profile: ProfileRow = {
  user_id: USER,
  full_name: 'Example Member',
  headline: 'Director',
  company: 'Example Holdings',
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
}

const member: MemberRow = {
  user_id: USER,
  email: 'member@example.com',
  seat: 'ksa',
  status: 'active',
  must_set_password: false,
  invites_remaining: 0,
  invites_granted: 0,
}

const room: MemberRoom = {
  userId: USER,
  email: 'member@example.com',
  staffRole: null,
  member,
  profile,
  reload: async () => {},
}

function event(over: Partial<MajlisEventRow>): MajlisEventRow {
  return {
    id: FUTURE,
    host_member_id: HOST,
    title: 'Capital evening',
    description: 'A private conversation for members.',
    region: 'Riyadh',
    focus_tags: ['Governance'],
    starts_at: '2026-11-20T15:00:00.000Z',
    ends_at: '2026-11-20T17:00:00.000Z',
    timezone: 'Asia/Riyadh',
    capacity: 24,
    venue_name: 'Virtual',
    venue_address: null,
    venue_visibility: 'members_on_rsvp',
    status: 'published',
    rejection_feedback: null,
    admin_note: null,
    approved_at: '2026-10-01T09:00:00.000Z',
    created_at: '2026-10-01T09:00:00.000Z',
    map_lat: null,
    map_lng: null,
    rsvp_opens_at: '2026-10-01T09:00:00.000Z',
    founding_priority_ends_at: null,
    featured: false,
    sponsor_label: null,
    cancelled_at: null,
    cancel_reason: null,
    registered_count: 4,
    waitlist_count: 0,
    my_rsvp_status: 'registered',
    my_waitlist_position: null,
    host_full_name: 'Example Host',
    maybe_count: null,
    format: 'virtual',
    meet_url: null,
    meet_sync_status: null,
    meet_sync_detail: null,
    meet_fallback_url: null,
    ...over,
  }
}

const shot = new URLSearchParams(window.location.search).get('shot') || 'attending'
const mode = shot === 'copied' || shot === 'error' ? 'attending' : shot
const past = mode === 'attended'
const shareCards = mode === 'attending' || mode === 'attended' || mode === 'dismissed' || mode === 'waitlist'

function eventsFor(name: string): MajlisEventRow[] {
  if (name === 'empty' || name === 'loading' || name === 'page-error') return []
  if (name === 'attended') {
    return [
      event({
        id: PAST,
        title: 'Capital evening',
        starts_at: '2026-10-01T15:00:00.000Z',
        ends_at: '2026-10-01T17:00:00.000Z',
      }),
    ]
  }
  if (name === 'dismissed') {
    return [
      event({ id: FUTURE, title: 'Capital evening' }),
      event({ id: SECOND, title: 'Governance salon', starts_at: '2026-11-21T15:00:00.000Z', ends_at: '2026-11-21T17:00:00.000Z' }),
    ]
  }
  if (name === 'waitlist') return [event({ my_rsvp_status: 'waitlist', my_waitlist_position: 2 })]
  return [event({ id: FUTURE, title: 'Capital evening' })]
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <MemberContext.Provider value={room}>
      <MemoryRouter initialEntries={[past ? '/dashboard/majlis/past' : '/dashboard/majlis']}>
        <div data-shot={shot}>
          <AppShell
            tone="member"
            destinations={MEMBER_DESTINATIONS}
            secondary={MEMBER_SECONDARY}
            updatedLabel="Updated 16:25"
            roleSwitch={null}
            onSignOut={() => {}}
            accountLabel="Member"
            accountName="Example Member"
          >
            <SectionTabs label="Majlis sections" sections={MEMBER_SECTIONS.majlis ?? []} />
            <div className="mt-6">
              <MajlisPage
                preview={{
                  events: eventsFor(mode),
                  nowMs: NOW,
                  shareCards,
                  hold: mode === 'loading',
                  pageError: mode === 'page-error' ? MEMBER_VIEWS.majlis.error : undefined,
                }}
              />
            </div>
          </AppShell>
        </div>
      </MemoryRouter>
    </MemberContext.Provider>,
  )
}
