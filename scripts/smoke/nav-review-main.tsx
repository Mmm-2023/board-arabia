import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { assembleHome } from '../../src/lib/homeSnapshot'
import { CreateRoomForm } from '../../src/pages/dashboard/CreateRoomForm'
import { HomeSnapshotView } from '../../src/pages/dashboard/HomeSnapshotView'
import { InvitesPanel, type SentInvite } from '../../src/pages/dashboard/InvitesPanel'
import { AppShell } from '../../src/shell/AppShell'
import { MEMBER_ACCOUNT, MEMBER_DESTINATIONS, MEMBER_SECTIONS } from '../../src/shell/destinations'
import { RedirectKeep } from '../../src/shell/RedirectKeep'
import { SectionTabs } from '../../src/shell/SectionTabs'
import '../../src/index.css'

const params = new URLSearchParams(window.location.search)
const view = params.get('view') || 'home'

const sent: SentInvite[] = [
  {
    id: '1',
    token: 'example-token',
    channel: 'whatsapp',
    status: 'pending',
    recipient_email: null,
    recipient_phone: null,
    created_at: '2026-09-25T13:33:18.000Z',
    expires_at: '2026-10-25T13:33:18.000Z',
  },
]

function Shell({
  path,
  accountOpen = false,
  badge = 0,
  children,
}: {
  path: string
  accountOpen?: boolean
  badge?: number
  children: ReactNode
}) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel={null}
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="member@example.com"
        accountName="Member name"
        dealsBadge={badge}
        initialAccountOpen={accountOpen}
        accountMark={<span aria-hidden="true">MN</span>}
      >
        {children}
      </AppShell>
    </MemoryRouter>
  )
}

function homeModel(password: boolean, example: boolean) {
  return assembleHome({
    nowMs: Date.parse('2026-09-29T12:00:00Z'),
    seat: 'intl',
    name: 'Member name',
    photoUrl: null,
    profileReady: true,
    mustSetPassword: password,
    invitesRemaining: 1,
    personalCapacityIncluded: false,
    attention: password
      ? [
          {
            title: 'Set your password',
            body: 'Set a password before you leave this session so your invite link is not the only way back in.',
            to: '/dashboard/profile#password',
            cta: 'Set password',
          },
        ]
      : [
          {
            title: 'Review a mandate',
            body: 'One brief is waiting for you.',
            to: '/dashboard/deals/mandates',
            cta: 'Open mandates',
          },
        ],
    mandates: example
      ? [
          {
            id: 'm1',
            is_demo: true,
            sector: 'Energy',
            deal_type: 'Growth',
            ticket_band: '$10-25m',
            geography: 'KSA',
            stage: 'Diligence',
            one_liner: 'A sample brief.',
            intro_status: 'pending',
          },
        ]
      : [],
    rooms: [],
    directory: [],
    partners: [],
    gatherings: [],
    admitted: 12,
    ksa: 6,
    intl: 6,
    money: [],
    activity: [],
    activityStatus: 'empty',
    loading: false,
    partialError: false,
    updatedLabel: 'Updated 09:00',
  })
}

function Page({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-3xl" data-preview="page">
      <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">{title}</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/70">{body}</p>
    </div>
  )
}

function HomeBody({ password = false, example = false }: { password?: boolean; example?: boolean }) {
  return (
    <HomeSnapshotView
      model={homeModel(password, example)}
      userId={example ? 'example-member' : 'member-name'}
      figuresAsOf="Figures as of 29 Sep 2026"
      seatValue="International"
    />
  )
}

function InvitesBody() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  return (
    <div data-preview="invites">
      <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">Invites</h1>
      <div className="mt-6">
        <InvitesPanel
          embedded
          remaining={1}
          inviterName="Member name"
          email={email}
          phone={phone}
          busy={null}
          note=""
          error=""
          sent={sent}
          listError=""
          loadingList={false}
          onEmailChange={setEmail}
          onPhoneChange={setPhone}
          onEmail={(event) => event.preventDefault()}
          onWhatsApp={(event) => event.preventDefault()}
          onRetry={() => {}}
        />
      </div>
    </div>
  )
}

function frame() {
  if (view === 'home') {
    return (
      <Shell path="/dashboard">
        <HomeBody />
      </Shell>
    )
  }
  if (view === 'home-password') {
    return (
      <Shell path="/dashboard">
        <HomeBody password />
      </Shell>
    )
  }
  if (view === 'home-example') {
    return (
      <Shell path="/dashboard">
        <HomeBody example />
      </Shell>
    )
  }
  if (view === 'deals-mandates') {
    return (
      <Shell path="/dashboard/deals/mandates" badge={2}>
        <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
        <div className="mt-6">
          <Page title="Mandates" body="Sector, deal type, and stage stay visible. Locked details stay locked until an intro is approved." />
        </div>
      </Shell>
    )
  }
  if (view === 'deals-real-estate') {
    return (
      <Shell path="/dashboard/deals/real-estate">
        <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
        <div className="mt-6">
          <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">Real estate</h1>
          <div role="tablist" aria-label="Real estate" className="mt-6 inline-flex gap-2">
            <button type="button" role="tab" aria-selected="true" className="min-h-11 rounded-full bg-[var(--ba-lavender-mist)] px-4 text-[0.8125rem] font-semibold">
              Opportunities
            </button>
            <button type="button" role="tab" aria-selected="false" className="min-h-11 rounded-full border border-[var(--ba-line)] bg-white px-4 text-[0.8125rem] font-semibold">
              Partners
            </button>
          </div>
        </div>
      </Shell>
    )
  }
  if (view === 'deals-rooms') {
    return (
      <Shell path="/dashboard/deals/rooms" badge={1}>
        <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
        <div className="mt-6">
          <Page title="Deal rooms" body="Rooms you open or join. Admin rooms stay in the list below." />
        </div>
      </Shell>
    )
  }
  if (view === 'rooms-new') {
    return (
      <Shell path="/dashboard/deals/rooms/new">
        <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
        <div className="mt-6">
          <CreateRoomForm
            name=""
            purpose=""
            subjectKind="none"
            mandateId=""
            reOpportunityId=""
            mandates={[{ id: 'm1', label: 'Logistics: A sample mandate.' }]}
            opportunities={[{ id: 'o1', label: 'Riyadh: A sample opportunity.' }]}
            mandatesNote={null}
            opportunitiesNote={null}
            busy={false}
            error=""
            onName={() => {}}
            onPurpose={() => {}}
            onSubjectKind={() => {}}
            onMandateId={() => {}}
            onReOpportunityId={() => {}}
            onSubmit={() => {}}
          />
        </div>
      </Shell>
    )
  }
  if (view === 'people-directory') {
    return (
      <Shell path="/dashboard/people/directory">
        <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
        <div className="mt-6">
          <Page title="Directory" body="Admitted members. Cards marked Example are samples and step aside once enough real members are here." />
        </div>
      </Shell>
    )
  }
  if (view === 'people-invites') {
    return (
      <Shell path="/dashboard/people/invites">
        <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
        <div className="mt-6">
          <InvitesBody />
        </div>
      </Shell>
    )
  }
  if (view === 'majlis') {
    return (
      <Shell path="/dashboard/majlis">
        <Page title="Majlis" body="Apply to host, then follow the status under Your applications. Published gatherings are listed below." />
      </Shell>
    )
  }
  if (view === 'ai') {
    return (
      <Shell path="/dashboard/ai">
        <Page title="AI tools" body="Public source review of a pitch deck. Not legal advice." />
      </Shell>
    )
  }
  if (view === 'account') {
    return (
      <Shell path="/dashboard" accountOpen>
        <HomeBody />
      </Shell>
    )
  }
  if (view === 'profile') {
    return (
      <Shell path="/dashboard/profile">
        <div data-preview="profile">
          <h1 className="font-display text-[2rem] font-bold tracking-[-0.03em]">Your details</h1>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/70">
            Admitted members see your directory card. Keep these details current.
          </p>
          <p className="mt-2 text-[0.92rem] text-ink/50">member@example.com</p>
        </div>
      </Shell>
    )
  }
  return (
    <MemoryRouter initialEntries={['/dashboard/network?from=old#sent']}>
      <Routes>
        <Route path="/dashboard/network" element={<RedirectKeep />} />
        <Route path="/dashboard/people/invites" element={<RedirectProof />} />
      </Routes>
    </MemoryRouter>
  )
}

function RedirectProof() {
  const location = useLocation()
  return (
    <AppShell
      tone="member"
      destinations={MEMBER_DESTINATIONS}
      secondary={MEMBER_ACCOUNT}
      updatedLabel={null}
      roleSwitch={null}
      onSignOut={() => {}}
      accountLabel="member@example.com"
      accountName="Member name"
      accountMark={<span aria-hidden="true">MN</span>}
    >
      <p data-redirect-proof="">
        {location.pathname}
        {location.search}
        {location.hash}
      </p>
      <div className="mt-4">
        <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
      </div>
      <div className="mt-6">
        <InvitesBody />
      </div>
    </AppShell>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(<div data-preview={view}>{frame()}</div>)
