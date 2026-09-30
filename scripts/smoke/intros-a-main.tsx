import { type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import type { HistoryItem } from '../../src/lib/dueDiligence'
import type { IntroRow } from '../../src/lib/memberIntros'
import { DeskIntrosQueueView } from '../../src/pages/admin/DeskIntrosQueue'
import { IntroAllowancePanel } from '../../src/pages/admin/IntroAllowancePanel'
import { DirectoryIntroAction } from '../../src/pages/dashboard/DirectoryIntroAction'
import { DueDiligenceDeskView } from '../../src/pages/dashboard/DueDiligencePage'
import { IntroBoard } from '../../src/pages/dashboard/IntroBoard'
import { AppShell } from '../../src/shell/AppShell'
import {
  MEMBER_ACCOUNT,
  MEMBER_DESTINATIONS,
  MEMBER_SECTIONS,
  STAFF_DESTINATIONS,
  STAFF_SECONDARY,
} from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import '../../src/index.css'

const params = new URLSearchParams(window.location.search)
const view = params.get('view') || 'request'

const TARGET = '22222222-2222-4222-8222-222222222222'
const ACCEPTED = '55555555-5555-4555-8555-555555555555'
const PENDING = '44444444-4444-4444-8444-444444444444'

const priorNotes: HistoryItem[] = [
  note('a1', 'job-1', 'W H O W H A T G O E S W R O N G W H A T I T C O S T S', '2026-09-20T09:00:00.000Z'),
  note('a2', 'job-1', 'W H O W H A T G O E S W R O N G W H A T I T C O S T S', '2026-09-19T09:00:00.000Z'),
  note('a3', 'job-1', 'W H O W H A T G O E S W R O N G W H A T I T C O S T S', '2026-09-18T09:00:00.000Z'),
  note('b1', 'job-2', 'ÒMade In KSAÓ', '2026-09-17T09:00:00.000Z'),
  note('b2', 'job-2', 'ÒMade In KSAÓ', '2026-09-16T09:00:00.000Z'),
  note('b3', 'job-2', 'ÒMade In KSAÓ', '2026-09-15T09:00:00.000Z'),
]

function note(id: string, jobId: string, company: string, created: string): HistoryItem & { job_id: string } {
  return {
    id,
    job_id: jobId,
    created_at: created,
    file_name: 'deck.pdf',
    company_label: company,
    publicly_consistent_pct: 40,
    not_publicly_verifiable_pct: 60,
  }
}

const pending: IntroRow = {
  id: PENDING,
  kind: 'member',
  direction: 'incoming',
  status: 'pending',
  title: 'Omar Al-Janub',
  detail: 'Chair advisor · Janub Board Practice · Abha',
  reason: 'A question on a mining board seat.',
  is_demo: false,
  subject_id: TARGET,
  created_at: '2026-09-29T09:15:00.000Z',
  ask_desk: true,
}

const accepted: IntroRow = {
  id: ACCEPTED,
  kind: 'member',
  direction: 'outgoing',
  status: 'accepted',
  title: 'Noura Al-Wahat',
  detail: 'Non-executive director · Wahat Counsel · Jeddah',
  reason: 'A board question on health.',
  is_demo: false,
  subject_id: '66666666-6666-4666-8666-666666666666',
  created_at: '2026-09-28T09:15:00.000Z',
  ask_desk: true,
  desk_status: 'queued',
}

function MemberShell({ path, sections, children }: { path: string; sections?: readonly { id: string; label: string; to: string; end: boolean }[]; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={MEMBER_ACCOUNT}
        updatedLabel="Updated 09:15"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Account"
        accountName="Member name"
        accountMark={<Avatar src={null} avatarStyle="male" size={36} alt="" />}
      >
        <div data-preview="">
          {sections ? <SectionTabs label="Sections" sections={sections} /> : null}
          <div className={sections ? 'mt-6' : ''}>{children}</div>
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

function StaffShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 09:15"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Account"
        accountName="Desk"
        accountMark={<Avatar src={null} avatarStyle="female" size={36} alt="" />}
      >
        <div data-preview="">{children}</div>
      </AppShell>
    </MemoryRouter>
  )
}

function noopSubmit(event: FormEvent) {
  event.preventDefault()
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    view === 'accepted' ? (
      <MemberShell path="/dashboard/people/intros" sections={MEMBER_SECTIONS.people}>
        <div className="max-w-3xl">
          <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Intros</h1>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
            Requests you sent, and requests sent to you. Mandate and real estate unlocks are in this list too.
          </p>
          <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/65">
            After someone accepts, you both see email, LinkedIn, and phone when it is set. Before that, those stay private.
          </p>
          <p className="mt-3 text-[1rem] text-ink/70">3 of 5 left this month.</p>
          <div className="mt-8">
            <IntroBoard
              tone="member"
              rows={[pending, accepted]}
              busyId={null}
              error=""
              onRespond={() => {}}
              contacts={{
                [ACCEPTED]: {
                  intro_id: ACCEPTED,
                  email: 'noura@example.com',
                  linkedin_url: 'https://www.linkedin.com/in/example-chair',
                  phone: '+966 50 000 0000',
                  calendar_url: 'https://calendar.example.com/example-chair',
                },
              }}
            />
          </div>
        </div>
      </MemberShell>
    ) : view === 'desk' ? (
      <StaffShell path="/admin/people/intros">
        <div className="max-w-3xl">
          <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Intros</h1>
          <div className="mt-8">
            <DeskIntrosQueueView
              rows={[
                {
                  id: ACCEPTED,
                  requester_name: 'Amina Al-Harbi',
                  target_name: 'Noura Al-Wahat',
                  reason: 'A board question on health.',
                  desk_status: 'queued',
                  desk_note: '',
                  is_demo: false,
                },
              ]}
              loadError={false}
              decideError=""
              busyId={null}
              onMark={() => {}}
              onRetry={() => {}}
            />
          </div>
        </div>
      </StaffShell>
    ) : view === 'settings' ? (
      <StaffShell path="/admin/settings">
        <div className="max-w-3xl">
          <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Settings</h1>
          <IntroAllowancePanel />
        </div>
      </StaffShell>
    ) : view === 'notes' ? (
      <MemberShell path="/dashboard/ai/due-diligence" sections={MEMBER_SECTIONS.ai}>
        <DueDiligenceDeskView
          phase="idle"
          loadState="ready"
          fileName=""
          companyUrl=""
          busy={false}
          activeJob={false}
          progress={0}
          progressLabel=""
          actionError=""
          reports={priorNotes}
          onCompanyUrl={() => {}}
          onFile={() => {}}
          onSubmit={noopSubmit}
          onRetry={() => {}}
          onReload={() => {}}
        />
      </MemberShell>
    ) : (
      <MemberShell path="/dashboard/people/directory" sections={MEMBER_SECTIONS.people}>
        <article className="max-w-3xl border border-[var(--ba-line)] bg-white px-5 py-5">
          <h1 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em]">Amina Al-Harbi</h1>
          <p className="mt-1 text-[0.95rem] text-ink/70">Non-executive director</p>
          <DirectoryIntroAction
            sample={false}
            self={false}
            status={null}
            busy={false}
            error=""
            startOpen
            quota={{ used: 2, base: 5, allowance: 5, remaining: 3 }}
            onRequest={() => {}}
          />
        </article>
      </MemberShell>
    ),
  )
}
