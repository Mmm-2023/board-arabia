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

const view = new URLSearchParams(window.location.search).get('view') || 'full'

const full: WeeklyDigestModel = {
  mailReady: false,
  newMembers: [{ fullName: 'Layla Al Diriyah', headline: 'Director', company: 'Diriyah Works' }],
  newMandates: [
    {
      sector: 'Energy',
      dealType: 'Growth equity',
      ticketBand: 'Mid band',
      geography: 'KSA',
      oneLiner: 'A clear regional mandate for members.',
    },
  ],
  upcomingEvents: [
    {
      title: 'Riyadh gathering',
      when: '16 Oct 2026, 18:00',
      region: 'Riyadh',
      hostName: 'Huda Al Harbi',
      venueAddress: null,
    },
  ],
  introductions: [
    {
      fullName: 'Noura Al Wahat',
      headline: 'Board director',
      company: 'Wahat Counsel',
      reason: 'Both are in Riyadh.',
    },
  ],
}

const empty: WeeklyDigestModel = {
  mailReady: false,
  newMembers: [],
  newMandates: [],
  upcomingEvents: [],
  introductions: [],
}

const issue: DigestIssueModel = {
  sendEnabled: false,
  mailReady: false,
  status: 'draft',
  source: 'issue',
  log: [{ action: 'created', createdAt: '2026-10-13T09:15:00.000Z' }],
  preview: {
    ...full,
    introductions: [
      {
        fullName: 'Preview member',
        headline: 'Board director',
        company: 'Preview Works',
        reason: 'A sample introduction for this preview.',
      },
    ],
  },
}

const homeModel: HomeModel = {
  identity: {
    name: 'Huda Al Harbi',
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
        name: 'Layla Al Diriyah',
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
        accountName="Huda Al Harbi"
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
  if (view === 'empty') return digestPage(empty)
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
  if (view === 'admin') {
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
              model={issue}
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
  if (view === 'home') {
    return (
      <MemberShell path="/dashboard">
        <HomeSnapshotView model={homeModel} seatCaption="Founding seat" seatValue="Saudi Arabia" userId="huda-tap" />
      </MemberShell>
    )
  }
  return digestPage(full)
}

const root = document.getElementById('root')
if (root) createRoot(root).render(screen())
