import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import { assembleHome } from '../../src/lib/homeSnapshot'
import { buildNeedsYou } from '../../src/lib/homeNeeds'
import { profileCompleteness } from '../../src/lib/profileCompleteness'
import type { DirectoryCard } from '../../src/lib/demoRows'
import type { MemberRow, ProfileRow } from '../../src/lib/member'
import type { MandateCardModel } from '../../src/lib/mandateRedaction'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY, MEMBER_SECTIONS } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import { MemberContext, type MemberRoom } from '../../src/pages/dashboard/context'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
import { HelpPage } from '../../src/pages/dashboard/HelpPage'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { IntroBoard } from '../../src/pages/dashboard/IntroBoard'
import { IntroSuggestions } from '../../src/pages/dashboard/IntroSuggestions'
import { MandatesBoard } from '../../src/pages/dashboard/MandatesBoard'
import { ProfileCompletenessPrompt } from '../../src/pages/dashboard/ProfileCompletenessPrompt'
import { ProfilePage } from '../../src/pages/dashboard/ProfilePage'
import './home.css'

const userId = 'example-member'
const email = 'member@example.com'

const member: MemberRow = {
  user_id: userId,
  email,
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
  city_key: 'riyadh',
}

const room: MemberRoom = {
  userId,
  email,
  staffRole: null,
  member,
  profile,
  reload: async () => {},
}

const directoryCard: DirectoryCard = {
  id: 'a1000001-0000-4000-8000-000000000011',
  is_demo: true,
  full_name: 'Example Member',
  headline: 'Chair',
  company: 'Example House',
  location: 'Riyadh',
  city_key: 'riyadh',
  sector: 'Energy transition',
  sectors: ['Energy transition'],
  vision_themes: [],
  availability: null,
  seat: 'intl',
  preferred_partner: false,
  portrait_asset: null,
  avatar_path: null,
  avatar_style: 'male',
  membership_status: 'active',
}

const mandate: MandateCardModel = {
  id: 'a2000001-0000-4000-8000-000000000001',
  is_demo: true,
  sector: 'Energy transition',
  deal_type: 'Growth equity',
  ticket_band: 'On request',
  geography: 'KSA',
  stage: 'Diligence',
  one_liner: 'Growth capital for an industrial services platform.',
  unlocked: false,
  intro_status: null,
}

const homeModel = assembleHome({
  nowMs: Date.parse('2026-10-30T09:00:00.000Z'),
  seat: 'intl',
  name: 'Example Member',
  photoUrl: null,
  avatarStyle: 'male',
  profileReady: true,
  mustSetPassword: false,
  invitesRemaining: 2,
  personalCapacityIncluded: false,
  attention: [],
  mandates: [
    {
      id: mandate.id,
      is_demo: true,
      sector: mandate.sector,
      deal_type: mandate.deal_type,
      ticket_band: mandate.ticket_band,
      geography: mandate.geography,
      stage: mandate.stage,
      one_liner: mandate.one_liner,
      intro_status: null,
    },
  ],
  rooms: [],
  directory: [],
  partners: [],
  gatherings: [],
  admitted: null,
  ksa: null,
  intl: null,
  money: [],
  activity: [],
  activityStatus: 'empty',
  loading: false,
  partialError: false,
  updatedLabel: null,
})

const paths = {
  home: '/dashboard',
  directory: '/dashboard/people/directory',
  profile: '/dashboard/profile',
  intros: '/dashboard/people/intros',
  help: '/dashboard/help',
  mandates: '/dashboard/deals/mandates',
} as const

type ViewName = keyof typeof paths

function viewName(): ViewName {
  const value = new URLSearchParams(window.location.search).get('view')
  if (value && value in paths) return value as ViewName
  return 'home'
}

function Screen({ name }: { name: ViewName }) {
  if (name === 'home') {
    return (
      <HomeSnapshotView
        model={homeModel}
        seatCaption="Founding seat"
        seatValue="International"
        userId={userId}
        needsYou={buildNeedsYou({
          twoStepOff: true,
          invites: [],
          suggestionCount: 0,
          attention: [],
        })}
        profileCard={
          <ProfileCompletenessPrompt
            userId={userId}
            staff={false}
            status="ready"
            rows={profileCompleteness({
              photo: true,
              name: 'Example Member',
              title: 'Chair',
              organisation: 'Example House',
              city: 'Riyadh',
              sectorCount: 0,
              availabilitySet: false,
            })}
          />
        }
      />
    )
  }
  if (name === 'directory') {
    return (
      <>
        <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
        <div className="mt-6">
          <DirectoryBoard cards={[directoryCard]} seat={{ status: 'ready', admitted: 1 }} />
        </div>
      </>
    )
  }
  if (name === 'profile') return <ProfilePage />
  if (name === 'intros') {
    return (
      <>
        <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
        <div className="mt-6 max-w-3xl">
          <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Intros</h1>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
            Requests you sent, and requests sent to you. Mandate and real estate unlocks are in this list too.
          </p>
          <IntroSuggestions
            rows={[]}
            quota={{ used: 0, base: 5, allowance: 5, remaining: 5 }}
            introStatus={() => null}
            busyId={null}
            errorId={null}
            error=""
            showEmpty
            emptyMode="needs_tags"
            onRequest={() => {}}
          />
          <div className="mt-8">
            <IntroBoard tone="member" rows={[]} busyId={null} error="" />
          </div>
        </div>
      </>
    )
  }
  if (name === 'help') return <HelpPage />
  return (
    <>
      <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
      <div className="mt-6 max-w-3xl" data-phone-body="">
        <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Mandates</h1>
        <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/60">
          Sector, deal type, size band, geography, and stage stay visible. Company, exact price, contacts, and the
          confidential note stay locked until you request an intro and our admin team approves it for you.
        </p>
        <div className="mt-8">
          <MandatesBoard mandates={[mandate]} />
        </div>
      </div>
    </>
  )
}

const name = viewName()
const root = document.getElementById('root')
if (!root) throw new Error('missing root')

createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={[paths[name]]}>
      <MemberContext.Provider value={room}>
        <AppShell
          tone="member"
          destinations={MEMBER_DESTINATIONS}
          secondary={MEMBER_SECONDARY}
          updatedLabel={null}
          roleSwitch={null}
          onSignOut={() => {}}
          accountLabel="Member"
          accountName="Example Member"
          accountMark={<Avatar src={null} avatarStyle="male" size={36} alt="" />}
        >
          <Screen name={name} />
        </AppShell>
      </MemberContext.Provider>
    </MemoryRouter>
  </StrictMode>,
)
