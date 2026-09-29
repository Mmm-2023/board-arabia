import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { MajlisCardTitle } from '../../src/components/MajlisCardTitle'
import type { DirectoryCard } from '../../src/lib/demoRows'
import type { SponsorDesk } from '../../src/lib/sponsorDesk'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
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
        starts_at: '2026-09-27T09:27:00.000Z',
        ends_at: '2026-09-27T11:29:00.000Z',
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

function Screen() {
  if (screen === 'directory') {
    return <DirectoryBoard cards={directory} seat={{ status: 'ready', admitted: 1 }} />
  }
  if (screen === 'majlis') {
    return (
      <div className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Majlis</p>
        <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Majlis</h1>
        <article className="mt-6 border border-[var(--ba-line)] bg-white px-4 py-4">
          <MajlisCardTitle
            title="Riyadh governance salon"
            featured={false}
            presentedBy="Example House"
            description="A members gathering on board practice."
          />
          <dl className="mt-3 grid gap-2 text-[0.95rem] sm:grid-cols-2">
            <div>
              <dt className="text-[var(--ba-muted)]">Region</dt>
              <dd>Riyadh</dd>
            </div>
            <div>
              <dt className="text-[var(--ba-muted)]">When</dt>
              <dd>Sun, 27 Sept 2026, 12:27 to 14:29 Asia/Riyadh</dd>
            </div>
          </dl>
        </article>
      </div>
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
