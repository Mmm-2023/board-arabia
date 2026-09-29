import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { DirectoryCard } from '../../src/lib/demoRows'
import type { SponsorDesk } from '../../src/lib/sponsorDesk'
import type { MajlisEventRow } from '../../src/lib/supabase'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
import { MajlisPage } from '../../src/pages/dashboard/MajlisPage'
import { SponsorshipView } from '../../src/pages/dashboard/SponsorshipView'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, memberAccountLinks } from '../../src/shell/destinations'
import './home.css'

const screen = new URLSearchParams(window.location.search).get('screen') || 'desk'
const path =
  screen === 'directory' ? '/dashboard/people/directory' : screen === 'majlis' ? '/dashboard/majlis' : '/dashboard/sponsorship'

const desk: SponsorDesk = {
  package: {
    slug: 'placeholder_a',
    name: 'Placeholder package A',
    price_label: 'Placeholder',
    is_placeholder: true,
    majlis_slots: 1,
    intro_credits: 2,
    room_credits: 0,
  },
  category: { slug: 'real_estate', name: 'Real estate' },
  majlis: {
    entitled: 1,
    used: 1,
    events: [
      {
        id: '10000000-0000-4000-8000-0000000000aa',
        title: 'Riyadh governance salon',
        starts_at: '2026-10-15T09:00:00.000Z',
        ends_at: '2026-10-15T12:00:00.000Z',
        region: 'Riyadh',
        presented_by: 'Example House',
        status: 'published',
      },
    ],
  },
  intros: { approved: 1, pending: 1, declined: 0 },
  credits: { intro_entitled: 2, intro_used: 1, room_entitled: 0, room_used: 0 },
}

const directory: DirectoryCard[] = [
  {
    id: '10000000-0000-4000-8000-0000000000bb',
    is_demo: false,
    full_name: 'Amal Al-Bayt',
    headline: 'Preferred partner',
    company: 'Example House',
    location: 'Riyadh',
    sector: 'Energy transition',
    sectors: ['Energy transition'],
    vision_themes: [],
    availability: null,
    seat: 'sponsor',
    preferred_partner: true,
    portrait_asset: null,
    avatar_path: null,
  },
  {
    id: 'a1000001-0000-4000-8000-000000000001',
    is_demo: true,
    full_name: 'Layla Al-Nadira',
    headline: 'Independent chair',
    company: 'Nadira Family Office',
    location: 'Riyadh',
    sector: 'Energy transition',
    sectors: ['Energy transition'],
    vision_themes: ['Renewable energy'],
    availability: 'open',
    seat: 'ksa',
    preferred_partner: false,
    portrait_asset: '/demo/portraits/nadira.svg',
    avatar_path: null,
  },
]

function majlisEvent(partial: Pick<MajlisEventRow, 'id' | 'title' | 'starts_at' | 'ends_at' | 'sponsor_label'>): MajlisEventRow {
  return {
    id: partial.id,
    host_member_id: '10000000-0000-4000-8000-000000000099',
    title: partial.title,
    description: 'A members gathering on board practice.',
    region: 'Riyadh',
    focus_tags: ['Governance'],
    starts_at: partial.starts_at,
    ends_at: partial.ends_at,
    timezone: 'Asia/Riyadh',
    capacity: 12,
    venue_name: 'Example House',
    venue_address: null,
    venue_visibility: 'members_on_rsvp',
    status: 'published',
    rejection_feedback: null,
    admin_note: null,
    approved_at: '2026-09-01T09:00:00.000Z',
    created_at: '2026-09-01T09:00:00.000Z',
    map_lat: null,
    map_lng: null,
    rsvp_opens_at: null,
    founding_priority_ends_at: null,
    featured: false,
    sponsor_label: partial.sponsor_label,
    cancelled_at: null,
    cancel_reason: null,
    registered_count: 0,
    waitlist_count: 0,
    my_rsvp_status: null,
    my_waitlist_position: null,
  }
}

const majlisPreview = {
  events: [
    majlisEvent({
      id: '10000000-0000-4000-8000-0000000000aa',
      title: 'Riyadh governance salon',
      starts_at: '2026-10-15T09:00:00.000Z',
      ends_at: '2026-10-15T12:00:00.000Z',
      sponsor_label: 'Example House',
    }),
    majlisEvent({
      id: '10000000-0000-4000-8000-0000000000ab',
      title: 'Riyadh evening salon',
      starts_at: '2026-09-20T09:00:00.000Z',
      ends_at: '2026-09-20T12:00:00.000Z',
      sponsor_label: null,
    }),
    majlisEvent({
      id: '10000000-0000-4000-8000-0000000000ac',
      title: 'test majlis',
      starts_at: '2026-10-20T09:00:00.000Z',
      ends_at: '2026-10-20T12:00:00.000Z',
      sponsor_label: null,
    }),
  ],
}

const memberRoom: MemberRoom = {
  userId: '10000000-0000-4000-8000-000000000001',
  email: '',
  staffRole: null,
  member: {
    user_id: '10000000-0000-4000-8000-000000000001',
    email: '',
    seat: 'ksa',
    status: 'active',
    must_set_password: false,
    invites_remaining: 2,
    invites_granted: 2,
  },
  profile: null,
  reload: async () => {},
}

function Screen() {
  if (screen === 'directory') {
    return <DirectoryBoard cards={directory} seat={{ status: 'ready', admitted: 1 }} />
  }
  if (screen === 'majlis') {
    return (
      <MemberContext.Provider value={memberRoom}>
        <MajlisPage preview={majlisPreview} />
      </MemberContext.Provider>
    )
  }
  return <SponsorshipView desk={desk} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={screen === 'desk' ? memberAccountLinks('sponsor') : MEMBER_ACCOUNT}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel=""
        accountName="Amal Al-Bayt"
      >
        <Screen />
      </AppShell>
    </MemoryRouter>
  </StrictMode>,
)
