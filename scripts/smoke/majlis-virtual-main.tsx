import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import type { MajlisEventRow } from '../../src/lib/supabase'
import { AdminMajlisPage } from '../../src/pages/admin/MajlisPage'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { MajlisPage } from '../../src/pages/dashboard/MajlisPage'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY, MEMBER_SECTIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import './smoke.css'

const USER = '22222222-2222-4222-8222-222222222222'
const EVENT = '20000000-0000-4000-8000-000000000010'
const MEET = `https://meet.google.com/${'abc-defg-hij'}`

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
    id: EVENT,
    host_member_id: null,
    title: 'Chairs circle',
    description: 'A private conversation for members in Riyadh.',
    region: 'Riyadh',
    focus_tags: ['Governance'],
    starts_at: '2026-11-20T15:00:00.000Z',
    ends_at: '2026-11-20T16:30:00.000Z',
    timezone: 'Asia/Riyadh',
    capacity: 24,
    venue_name: 'Google Meet',
    venue_address: null,
    venue_visibility: 'members_on_rsvp',
    status: 'published',
    rejection_feedback: null,
    admin_note: null,
    approved_at: '2026-10-19T12:00:00.000Z',
    created_at: '2026-10-19T12:00:00.000Z',
    map_lat: 24.7136,
    map_lng: 46.6753,
    rsvp_opens_at: '2026-10-19T12:00:00.000Z',
    founding_priority_ends_at: '2026-10-21T12:00:00.000Z',
    featured: false,
    sponsor_label: null,
    cancelled_at: null,
    cancel_reason: null,
    registered_count: 4,
    waitlist_count: 0,
    my_rsvp_status: null,
    my_waitlist_position: null,
    host_full_name: null,
    maybe_count: null,
    format: 'virtual',
    meet_url: null,
    meet_sync_status: null,
    meet_sync_detail: null,
    meet_fallback_url: null,
    ...over,
  }
}

function MemberShot({ registered }: { registered: boolean }) {
  return (
    <MemberContext.Provider value={room}>
      <MemoryRouter initialEntries={['/dashboard/majlis']}>
        <div data-shot={registered ? 'member-after' : 'member-before'}>
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
                  events: [
                    event({
                      my_rsvp_status: registered ? 'registered' : null,
                      meet_url: registered ? MEET : null,
                    }),
                  ],
                }}
              />
            </div>
          </AppShell>
        </div>
      </MemoryRouter>
    </MemberContext.Provider>
  )
}

function StaffShot() {
  return (
    <MemoryRouter initialEntries={['/admin/majlis']}>
      <div data-shot="staff-create">
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
          <AdminMajlisPage preview={{ events: [] }} />
        </AppShell>
      </div>
    </MemoryRouter>
  )
}

const shot = new URLSearchParams(window.location.search).get('shot') || 'staff-create'
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    shot === 'member-before' ? <MemberShot registered={false} /> : shot === 'member-after' ? <MemberShot registered /> : <StaffShot />,
  )
}
