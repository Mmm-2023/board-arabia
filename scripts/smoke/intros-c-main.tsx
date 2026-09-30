import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Avatar } from '../../src/components/Avatar'
import type { IntroRow } from '../../src/lib/memberIntros'
import { DeskIntrosQueueView } from '../../src/pages/admin/DeskIntrosQueue'
import { IntroFunnelView } from '../../src/pages/admin/IntroFunnel'
import { IntroBoard } from '../../src/pages/dashboard/IntroBoard'
import { AppShell } from '../../src/shell/AppShell'
import { STAFF_DESTINATIONS, STAFF_SECTIONS, STAFF_SECONDARY } from '../../src/shell/destinations'
import { SectionTabs } from '../../src/shell/SectionTabs'
import '../../src/index.css'

const params = new URLSearchParams(window.location.search)
const view = params.get('view') || 'funnel'

const ACCEPTED = '55555555-5555-4555-8555-555555555555'
const OPEN = '66666666-6666-4666-8666-666666666666'
const UPDATED = new Date('2026-09-30T11:50:00.000Z')

const counts = { requested: 12, accepted: 7, met: 0, deal_started: 3 }

const tagged: IntroRow = {
  id: ACCEPTED,
  kind: 'member',
  direction: 'outgoing',
  status: 'accepted',
  title: 'Noura Al-Wahat',
  detail: 'Non-executive director',
  reason: 'A board question on health.',
  is_demo: false,
  subject_id: '77777777-7777-4777-8777-777777777777',
  created_at: '2026-09-28T09:15:00.000Z',
  requester_name: 'Amina Al-Harbi',
  target_name: 'Noura Al-Wahat',
}

const open: IntroRow = {
  ...tagged,
  id: OPEN,
  title: 'Omar Al-Janub',
  detail: 'Chair advisor',
  reason: 'A question on a mining board seat.',
  requester_name: 'Amina Al-Harbi',
  target_name: 'Omar Al-Janub',
  subject_id: '88888888-8888-4888-8888-888888888888',
  created_at: '2026-09-18T09:15:00.000Z',
}

function StaffShell({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/admin/people/intros']}>
      <AppShell
        tone="staff"
        destinations={STAFF_DESTINATIONS}
        secondary={STAFF_SECONDARY}
        updatedLabel="Updated 14:50"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="Account"
        accountName="Desk"
        accountMark={<Avatar src={null} avatarStyle="female" size={36} alt="" />}
      >
        <div data-preview="">
          <SectionTabs label="People sections" sections={STAFF_SECTIONS.people ?? []} />
          <div className="mt-6 max-w-3xl min-w-0">{children}</div>
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

function Funnel({ range = 'month' as const, customFrom = '', customTo = '' }) {
  return (
    <IntroFunnelView
      range={range}
      customFrom={customFrom}
      customTo={customTo}
      counts={counts}
      loading={false}
      error=""
      denied={false}
      updatedAt={UPDATED}
      onRange={() => {}}
      onCustomFrom={() => {}}
      onCustomTo={() => {}}
      onApplyCustom={() => {}}
      onRetry={() => {}}
      audience="staff"
    />
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StaffShell>
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em] text-pearl">Intros</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] text-pearl/70">
        Every intro request and its status. Members accept or decline a warm introduction. Mandate and real estate unlocks are still approved here.
      </p>
      <div className="mt-8">
        {view === 'filter' ? <Funnel range="custom" customFrom="2026-09-01" customTo="2026-09-30" /> : <Funnel />}
      </div>
      {view === 'deal' ? null : (
        <div className="mt-8">
          <DeskIntrosQueueView
            rows={[
              {
                id: OPEN,
                requester_name: 'Amina Al-Harbi',
                target_name: 'Omar Al-Janub',
                reason: 'A question on a mining board seat.',
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
      )}
      {view === 'filter' ? null : (
        <div className="mt-8">
          <IntroBoard
            tone="staff"
            rows={[tagged, open]}
            busyId={null}
            error=""
            onDeal={() => {}}
            dealStartedAt={{ [ACCEPTED]: '2026-09-21T09:00:00.000Z' }}
          />
        </div>
      )}
    </StaffShell>,
  )
}
