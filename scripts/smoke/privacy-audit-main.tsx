import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPanelView } from '../../src/components/privacy/PrivacyPanelView'
import { StaffAccessLogView } from '../../src/pages/admin/StaffAccessLogPage'
import { DirectoryBoard } from '../../src/pages/dashboard/DirectoryBoard'
import { IntroBoard } from '../../src/pages/dashboard/IntroBoard'
import { LeaveBoardArabiaPage } from '../../src/pages/dashboard/LeaveBoardArabia'
import { RegisterScreen } from '../../src/pages/apply/RegisterScreen'
import { deckHintText } from '../../src/lib/dueDiligenceCopy'
import type { DirectoryCard } from '../../src/lib/demoRows'
import type { IntroRow } from '../../src/lib/memberIntros'
import '../../src/index.css'

const view = new URLSearchParams(window.location.search).get('view') || 'privacy-visible'

const cards: DirectoryCard[] = [
  {
    id: 'visible-member',
    is_demo: false,
    full_name: 'Visible Member',
    headline: 'Director',
    company: 'Example Co',
    location: 'Jeddah',
    sector: 'Industry',
    sectors: ['Industry'],
    vision_themes: [],
    availability: null,
    seat: 'ksa',
    preferred_partner: false,
    portrait_asset: null,
    avatar_path: null,
    avatar_style: 'man-shemagh',
    membership_status: 'active',
  },
  {
    id: 'other-member',
    is_demo: false,
    full_name: 'Other Member',
    headline: 'Director',
    company: 'Example Co',
    location: 'London',
    sector: 'Industry',
    sectors: ['Industry'],
    vision_themes: [],
    availability: null,
    seat: 'intl',
    preferred_partner: false,
    portrait_asset: null,
    avatar_path: null,
    avatar_style: 'woman-hijab-black',
    membership_status: 'active',
  },
]

const intro: IntroRow = {
  id: 'intro-row',
  kind: 'member',
  direction: 'incoming',
  status: 'pending',
  title: 'Visible Member',
  detail: '',
  reason: 'A short reason.',
  is_demo: false,
  subject_id: 'visible-member',
  created_at: '2026-10-06T12:00:00.000Z',
  ask_desk: true,
  avatar_style: 'male',
}

function privacy(hidden: boolean, downloadState: 'idle' | 'ready') {
  return (
    <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
      <PrivacyPanelView
        hidden={hidden}
        showSponsors={false}
        twoStepOn={hidden}
        analyticsOn={false}
        privacyContact={null}
        downloadState={downloadState}
        onHidden={() => undefined}
        onShowSponsors={() => undefined}
        onDownload={() => undefined}
      />
    </div>
  )
}

function hint(on: boolean) {
  return (
    <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Due diligence</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold">Pitch deck</h1>
      <p className="mt-4 text-[0.92rem] leading-relaxed text-[var(--ba-muted)]" data-dd-hint={on ? 'on' : 'off'}>
        {deckHintText(on)}
      </p>
    </div>
  )
}

const root = document.getElementById('root')
if (root) {
  const node = (() => {
    if (view === 'privacy-hidden') return privacy(true, 'idle')
    if (view === 'download') return privacy(false, 'ready')
    if (view === 'directory') {
      return (
        <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
          <DirectoryBoard cards={cards} seat={{ status: 'ready', admitted: 2 }} selfId="other-member" />
        </div>
      )
    }
    if (view === 'audit') {
      return (
        <div className="min-h-dvh bg-ink px-5 py-8 text-pearl">
          <StaffAccessLogView
            rows={[
              { objectLabel: 'Membership request', action: 'read', at: '6 Oct 2026, 15:00', actor: 'Example Admin, Admin' },
              { objectLabel: 'Shared due diligence report', action: 'read', at: '6 Oct 2026, 15:02', actor: 'Example Admin, Admin' },
            ]}
            filtered
            error=""
            onFilter={() => undefined}
          />
        </div>
      )
    }
    if (view === 'hint-off') return hint(false)
    if (view === 'hint-on') return hint(true)
    if (view === 'register') {
      return (
        <RegisterScreen
          invite={{ kind: 'none' }}
          submitting={false}
          error=""
          security="preview"
          onSubmit={() => undefined}
          onFocus={() => undefined}
          nav={null}
          footer={null}
        />
      )
    }
    if (view === 'leave') {
      return (
        <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
          <LeaveBoardArabiaPage />
        </div>
      )
    }
    if (view === 'intro') {
      return (
        <div className="min-h-dvh bg-pearl px-5 py-8 text-ink">
          <h1 className="font-display text-[2rem] font-semibold">Intros</h1>
          <div className="mt-6">
            <IntroBoard tone="member" rows={[intro]} busyId={null} error="" onRespond={() => undefined} />
          </div>
        </div>
      )
    }
    return privacy(false, 'idle')
  })()
  createRoot(root).render(<MemoryRouter>{node}</MemoryRouter>)
}
