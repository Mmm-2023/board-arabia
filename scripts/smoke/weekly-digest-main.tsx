import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { WeeklyDigestView } from '../../src/components/digest/WeeklyDigestView'
import { PrivacyPanelView } from '../../src/components/privacy/PrivacyPanelView'
import type { HomeModel } from '../../src/lib/homeSnapshot'
import type { DigestIssueModel, WeeklyDigestModel } from '../../src/lib/weeklyDigest'
import { EmailEventList } from '../../src/pages/admin/EmailPage'
import { DigestIssuePanelView } from '../../src/pages/admin/DigestIssuePanel'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, STAFF_DESTINATIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import '../../src/index.css'

import type {
  DigestNewsItem,
  DigestPartnerInsight,
} from '../../supabase/functions/_shared/weekly_digest_copy.ts'

const view = new URLSearchParams(window.location.search).get('view') || 'full'

function exampleNews(headline: string, lens: string, person: string, linkedin: string | null): DigestNewsItem {
  return {
    headline,
    sentences: [
      'Example boards are asking for a shorter note before the next meeting.',
      'The useful change is timing, not a new round.',
    ],
    boardLens: lens,
    sources: [{ label: 'example.com/review', url: 'https://example.com/review' }],
    people: [{ name: person, linkedinUrl: linkedin }],
  }
}

const partnerInsight: DigestPartnerInsight = {
  label: 'Partner content',
  sentences: [
    'A partner firm notes that boards want a shorter first meeting.',
    'The useful step is a one page brief before the room.',
  ],
  source: { label: 'example.com/partner', url: 'https://example.com/partner' },
}

const sectionsDigest: WeeklyDigestModel = {
  mailReady: false,
  opening: 'A short briefing on markets, mandates, and the week ahead.',
  issueNumber: '42',
  issueDate: '13 Oct 2026',
  readMinutes: 4,
  hiddenSections: [],
  notes: [],
  boardroom: [
    exampleNews(
      'Boards ask for a clearer capital plan',
      'Ask whether the plan still matches the mandate you approved.',
      'Example Director',
      'https://www.linkedin.com/in/example-director',
    ),
    exampleNews('Regional markets stay selective', '', 'Example Chair', null),
  ],
  deals: [
    exampleNews('A growth round stays in diligence', 'Check the buyer you can actually reach.', 'Example Director', null),
    exampleNews('Sellers with a clean story still get meetings', '', 'Example Chair', null),
  ],
  platformBullets: [
    'Introductions now show the reason on the card.',
    'Majlis dates sit on your calendar after you reply.',
  ],
  featureTip: 'Open a mandate from this briefing to read the outline first.',
  newMembers: [{ fullName: 'Example Member B', headline: 'Director', company: 'Example Company B' }],
  keyMembers: [{ fullName: 'Example Director', headline: 'Board director', company: 'Example Company A', key: true }],
  newMandates: [
    {
      sector: 'Energy',
      dealType: 'Growth equity',
      ticketBand: 'Mid band',
      geography: 'KSA',
      stage: 'Diligence',
      oneLiner: 'A clear example mandate for members.',
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
  diary: [
    {
      title: 'Example capital forum',
      when: '20 Oct 2026',
      sources: [{ label: 'example.com/diary', url: 'https://example.com/diary' }],
    },
  ],
  partnerInsight,
  introductions: [
    {
      fullName: 'Example Member C',
      headline: 'Board director',
      company: 'Example Company C',
      reason: 'Both are in the example city.',
    },
  ],
}

const full: WeeklyDigestModel = {
  mailReady: false,
  notes: [],
  newMembers: [{ fullName: 'Example Member B', headline: 'Director', company: 'Example Company B' }],
  newMandates: [
    {
      sector: 'Energy',
      dealType: 'Growth equity',
      ticketBand: 'Mid band',
      geography: 'KSA',
      oneLiner: 'A clear example mandate for members.',
    },
  ],
  upcomingEvents: [
    {
      title: 'Example gathering',
      when: '16 Oct 2026, 18:00',
      region: 'Riyadh',
      hostName: 'Example Member A',
      venueAddress: null,
    },
  ],
  introductions: [
    {
      fullName: 'Example Member C',
      headline: 'Board director',
      company: 'Example Company C',
      reason: 'Both are in the example city.',
    },
  ],
}

const empty: WeeklyDigestModel = {
  mailReady: false,
  notes: [],
  newMembers: [],
  newMandates: [],
  upcomingEvents: [],
  introductions: [],
}

const edited: WeeklyDigestModel = {
  ...full,
  newMembers: [{ fullName: 'Example Member B', headline: 'Director', company: '' }],
  upcomingEvents: [
    {
      title: 'Example gathering',
      when: '16 Oct 2026, 18:00',
      region: '',
      hostName: 'Board Arabia',
      venueAddress: null,
    },
  ],
  notes: [{ text: 'Example note for members' }],
}

const issue: DigestIssueModel = {
  sendEnabled: false,
  mailReady: false,
  status: 'draft',
  audience: ['founding'],
  source: 'issue',
  log: [{ action: 'created', createdAt: '2026-10-13T09:15:00.000Z' }],
  preview: {
    ...full,
    introductions: [
      {
        fullName: 'Example Member A',
        headline: 'Board director',
        company: 'Example Company A',
        reason: 'Example introduction for this preview.',
        example: true,
      },
    ],
  },
}

const homeModel: HomeModel = {
  identity: {
    name: 'Example Member A',
    avatarStyle: 'female',
    photoUrl: null,
    badge: 'Founding',
    founding: true,
    seatLabel: 'Saudi Arabia',
    profileNeedsWork: false,
    profileTo: '/dashboard/profile',
  },
  attention: [],
  pulse: [],
  majlis: {
    title: 'Riyadh gathering',
    body: 'Riyadh. Upcoming.',
    to: '/dashboard/majlis',
  },
  cta: null,
  profileNudge: null,
  profileMatchPending: false,
  platform: {
    fill: null,
    capacityNote: null,
    regions: [],
    regionsKnown: true,
    money: [],
    partners: [],
  },
  teasers: {
    directory: [
      {
        id: 'dir-layla',
        name: 'Example Member B',
        headline: 'Director',
        seat: 'Saudi Arabia',
        example: true,
      },
    ],
    mandates: [],
    rooms: [],
    majlis: [],
  },
  activity: [],
  activityStatus: 'empty',
  loading: false,
  partialError: false,
  updatedLabel: null,
}

function MemberShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel="Updated 12:15 AST"
        roleSwitch={null}
        onSignOut={() => undefined}
        accountLabel="Account"
        accountName="Example Member A"
      >
        <div data-preview="">{children}</div>
      </AppShell>
    </MemoryRouter>
  )
}

function digestPage(model: WeeklyDigestModel) {
  return (
    <MemberShell path="/dashboard/digest">
      <div className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Home</p>
        <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">This week</h1>
        <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-ink/70">
          New members, new mandates, upcoming Majlis, and your introductions.
        </p>
        <div className="mt-6">
          <WeeklyDigestView digest={model} />
        </div>
      </div>
    </MemberShell>
  )
}

function screen() {
  if (view === 'sections') {
    return (
      <MemberShell path="/dashboard/digest">
        <div className="max-w-3xl">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Home</p>
          <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">This week</h1>
          <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-ink/70">The weekly briefing for members.</p>
          <div className="mt-6">
            <WeeklyDigestView digest={sectionsDigest} />
          </div>
        </div>
      </MemberShell>
    )
  }
  if (view === 'sections-admin') {
    return (
      <MemoryRouter initialEntries={['/admin/email']}>
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 12:15 AST"
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Account"
          accountName="Admin"
        >
          <div className="max-w-3xl" data-preview="">
            <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Email</h1>
            <DigestIssuePanelView
              model={{ ...issue, status: 'draft', preview: sectionsDigest, audience: ['founding'] }}
              state="ready"
              draft={sectionsDigest}
              audience={['founding']}
              sources={{
                members: [{ fullName: 'Example Member C', headline: 'Director', company: 'Example Company C' }],
                mandates: sectionsDigest.newMandates,
                events: sectionsDigest.upcomingEvents,
              }}
              onDraftChange={() => undefined}
              onPrepare={() => undefined}
              onApprove={() => undefined}
              onWithdraw={() => undefined}
              onRetry={() => undefined}
              onSave={() => undefined}
            />
          </div>
        </AppShell>
      </MemoryRouter>
    )
  }
  if (view === 'empty' || view === 'out-of-tier') return digestPage(empty)
  if (view === 'in-tier') return digestPage(full)
  if (view === 'privacy') {
    return (
      <MemberShell path="/dashboard/privacy">
        <PrivacyPanelView
          hidden={false}
          showSponsors={false}
          twoStepOn={false}
          analyticsOn={false}
          privacyContact={null}
          downloadState="idle"
          digestOptIn={false}
          onHidden={() => undefined}
          onShowSponsors={() => undefined}
          onDownload={() => undefined}
          onDigestOptIn={() => undefined}
        />
      </MemberShell>
    )
  }
  if (view === 'edit' || view === 'audience' || view === 'blocked') {
    const picked = view === 'blocked' ? [] : view === 'audience' ? ['founding', 'sponsor'] : ['founding']
    const draft = view === 'blocked' ? full : edited
    return (
      <MemoryRouter initialEntries={['/admin/email']}>
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 12:15 AST"
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Account"
          accountName="Admin"
        >
          <div className="max-w-3xl" data-preview="">
            <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Email</h1>
            <DigestIssuePanelView
              model={{ ...issue, status: 'draft', preview: draft, audience: picked }}
              state="ready"
              draft={draft}
              audience={picked}
              sources={{
                members: [{ fullName: 'Example Member C', headline: 'Director', company: 'Example Company C' }],
                mandates: [
                  {
                    sector: 'Energy',
                    dealType: 'Growth equity',
                    ticketBand: 'Mid band',
                    geography: 'KSA',
                    oneLiner: 'A clear example mandate for members.',
                  },
                ],
                events: edited.upcomingEvents,
              }}
              onDraftChange={() => undefined}
              onPrepare={() => undefined}
              onApprove={() => undefined}
              onWithdraw={() => undefined}
              onRetry={() => undefined}
            />
          </div>
        </AppShell>
      </MemoryRouter>
    )
  }
  if (view === 'prepare' || view === 'preview' || view === 'approved' || view === 'withdrawn' || view === 'admin') {
    const status = view === 'prepare' ? null : view === 'approved' ? 'approved' : view === 'withdrawn' ? 'withdrawn' : 'draft'
    const log =
      status === null
        ? []
        : status === 'draft'
          ? [{ action: 'created' as const, createdAt: '2026-10-13T09:15:00.000Z' }]
          : status === 'approved'
            ? [
                { action: 'created' as const, createdAt: '2026-10-13T09:15:00.000Z' },
                { action: 'approved' as const, createdAt: '2026-10-13T09:20:00.000Z' },
              ]
            : [
                { action: 'created' as const, createdAt: '2026-10-13T09:15:00.000Z' },
                { action: 'approved' as const, createdAt: '2026-10-13T09:20:00.000Z' },
                { action: 'withdrawn' as const, createdAt: '2026-10-13T09:25:00.000Z' },
              ]
    return (
      <MemoryRouter initialEntries={['/admin/email']}>
        <AppShell
          tone="staff"
          destinations={STAFF_DESTINATIONS}
          secondary={STAFF_SECONDARY}
          updatedLabel="Updated 12:15 AST"
          roleSwitch={null}
          onSignOut={() => undefined}
          accountLabel="Account"
          accountName="Admin"
        >
          <div className="max-w-3xl" data-preview="">
            <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Email</h1>
            <p className="mt-2 text-[0.95rem] text-stone/65">Date, subject, and status.</p>
            <EmailEventList
              events={[
                {
                  id: 'event-1',
                  created_at: '2026-09-22T11:49:44.000Z',
                  kind: 'desk_note',
                  recipient: 'member@example.com',
                  subject: 'Application received',
                  status: 'sent',
                  detail: 'A short note for the member.',
                },
              ]}
            />
            <DigestIssuePanelView
              model={{ ...issue, status, log, source: status ? 'issue' : 'live' }}
              state="ready"
              onPrepare={() => undefined}
              onApprove={() => undefined}
              onWithdraw={() => undefined}
              onRetry={() => undefined}
            />
          </div>
        </AppShell>
      </MemoryRouter>
    )
  }
  if (view === 'home' || view === 'notice') {
    return (
      <MemberShell path="/dashboard">
        <HomeSnapshotView
          model={homeModel}
          seatCaption="Founding seat"
          seatValue="Saudi Arabia"
          userId="example-a"
          digestNotice={
            view === 'notice' ? { title: "This week's update is ready", href: '/dashboard/digest' } : null
          }
        />
      </MemberShell>
    )
  }
  return digestPage(full)
}

const root = document.getElementById('root')
if (root) createRoot(root).render(screen())
