import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { assembleHome, type AssembleInput, type HomeGathering, type MandateBrief } from '../../src/lib/homeSnapshot'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY } from '../../src/shell/destinations'
import '../../src/index.css'

const NOW = Date.parse('2026-10-01T09:00:00.000Z')
const LATER = '2026-10-20T15:00:00.000Z'
const LATER_END = '2026-10-20T17:00:00.000Z'

function mandate(id: string, demo: boolean, intro: MandateBrief['intro_status']): MandateBrief {
  return {
    id,
    is_demo: demo,
    sector: demo ? 'Energy transition' : 'Health',
    deal_type: demo ? 'Growth equity' : 'Advisory',
    ticket_band: '$10-25m',
    geography: 'KSA',
    stage: 'Diligence',
    one_liner: demo
      ? 'Growth capital for a Saudi industrial services platform.'
      : 'An advisory brief for a regional care network.',
    intro_status: intro,
  }
}

function gathering(id: string, title: string, region: string, rsvp: HomeGathering['rsvp']): HomeGathering {
  return {
    id,
    title,
    region,
    startsAt: LATER,
    endsAt: LATER_END,
    status: 'published',
    host: false,
    rsvp,
  }
}

function shell(input: AssembleInput, state: string) {
  const model = assembleHome(input)
  return (
    <div data-home-state={state}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_SECONDARY}
        updatedLabel="Updated 09:00"
        roleSwitch={null}
        onSignOut={() => undefined}
        accountLabel="Member"
      >
        <HomeSnapshotView model={model} onRetry={() => undefined} />
      </AppShell>
    </div>
  )
}

const shared: AssembleInput = {
  nowMs: NOW,
  seat: 'ksa',
  name: 'Huda Al Sample',
  photoUrl: '/demo/portraits/nadira.svg',
  profileReady: true,
  mustSetPassword: false,
  invitesRemaining: 2,
  personalCapacityIncluded: true,
  attention: [],
  mandates: [],
  rooms: [],
  directory: [],
  partners: [],
  gatherings: [],
  admitted: 42,
  ksa: 26,
  intl: 16,
  money: [
    { label: 'Platform investment capability', value: '$120m' },
    { label: 'Family office AUM represented', value: '$80m' },
  ],
  activity: [],
  activityStatus: 'empty',
  loading: false,
  partialError: false,
  updatedLabel: 'Updated 09:00',
}

const populated = shell(
  {
    ...shared,
    mandates: [
      mandate('a2000001-0000-4000-8000-000000000001', false, 'pending'),
      mandate('a2000001-0000-4000-8000-000000000002', false, 'pending'),
      mandate('a2000001-0000-4000-8000-000000000003', false, null),
    ],
    rooms: [
      {
        id: 'a3000001-0000-4000-8000-000000000001',
        is_demo: false,
        name: 'Care network room',
        sector: 'Health',
        stage: 'Diligence',
      },
    ],
    directory: [
      {
        id: 'a1000001-0000-4000-8000-000000000011',
        is_demo: false,
        full_name: 'Hanan Al Sample',
        headline: 'Independent director',
        seat: 'ksa',
      },
      {
        id: 'a1000001-0000-4000-8000-000000000012',
        is_demo: false,
        full_name: 'Omar Al Sample',
        headline: 'Chair advisor',
        seat: 'intl',
      },
    ],
    partners: [
      { id: 'p1', is_demo: false, name: 'Sample Capital', monogram: 'SC' },
    ],
    gatherings: [
      gathering('a4000001-0000-4000-8000-000000000001', 'Riyadh evening', 'Riyadh', 'registered'),
      gathering('a4000001-0000-4000-8000-000000000002', 'Eastern gathering', 'Eastern Province', null),
    ],
    activity: [
      {
        id: 'e1',
        kind: 'intro',
        label: 'Intro requested',
        detail: 'Health · Advisory',
        happenedAt: '2026-09-28T14:00:00.000Z',
        href: '/dashboard/mandates',
        example: false,
      },
      {
        id: 'e2',
        kind: 'majlis',
        label: 'Majlis registration',
        detail: 'Riyadh evening · Riyadh',
        happenedAt: '2026-09-27T14:00:00.000Z',
        href: '/dashboard/majlis?event=a4000001-0000-4000-8000-000000000001',
        example: false,
      },
    ],
    activityStatus: 'ready',
  },
  'populated',
)

const demo = shell(
  {
    ...shared,
    photoUrl: null,
    admitted: 4,
    ksa: 3,
    intl: 1,
    money: [],
    personalCapacityIncluded: false,
    mandates: [
      mandate('a2000001-0000-4000-8000-000000000021', true, null),
      mandate('a2000001-0000-4000-8000-000000000022', true, null),
    ],
    rooms: [
      {
        id: 'a3000001-0000-4000-8000-000000000021',
        is_demo: true,
        name: 'Industrial services room',
        sector: 'Energy transition',
        stage: 'Diligence',
      },
    ],
    directory: [
      {
        id: 'a1000001-0000-4000-8000-000000000021',
        is_demo: true,
        full_name: 'Layla Al-Nadira',
        headline: 'Independent chair',
        seat: 'ksa',
      },
    ],
    partners: [{ id: 'p9', is_demo: true, name: 'Sample Rail', monogram: 'SR' }],
    gatherings: [],
    activity: [],
    activityStatus: 'empty',
  },
  'demo',
)

const empty = shell(
  {
    ...shared,
    seat: 'sponsor',
    name: "You're in",
    photoUrl: null,
    profileReady: false,
    invitesRemaining: 2,
    personalCapacityIncluded: null,
    attention: [
      {
        title: 'Finish your profile',
        body: "You're in. Finish profile to unlock Directory.",
        to: '/dashboard/profile',
        cta: 'Complete profile',
      },
    ],
    admitted: 0,
    ksa: 0,
    intl: 0,
    money: [],
    partners: [],
    gatherings: [],
    activityStatus: 'empty',
  },
  'empty',
)

const states: Record<string, ReturnType<typeof shell>> = {
  populated,
  demo,
  empty,
}

const state = new URLSearchParams(window.location.search).get('state') || 'populated'
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <MemoryRouter initialEntries={['/dashboard']}>{states[state] ?? populated}</MemoryRouter>
    </StrictMode>,
  )
}
