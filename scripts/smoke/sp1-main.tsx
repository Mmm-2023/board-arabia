import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { DryRunInvite } from '../../src/lib/supabase'
import type { SponsorDesk } from '../../src/lib/sponsorDesk'
import { SponsorInvitePanel } from '../../src/pages/admin/SponsorInvitePanel'
import { SponsorWelcome } from '../../src/pages/dashboard/SponsorWelcome'
import { DISMISS_SAVE_ERROR, SponsorWelcomeDismissFrame } from '../../src/pages/dashboard/SponsorWelcomeGate'
import { SponsorshipView } from '../../src/pages/dashboard/SponsorshipView'
import '../../src/index.css'

const screen = new URLSearchParams(window.location.search).get('screen') || 'welcome-package'

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
  majlis: { entitled: 1, used: 0, events: [] },
  intros: { approved: 0, pending: 0, declined: 0 },
  credits: {
    intro_entitled: 2,
    intro_used: 1,
    intro_base: 5,
    intro_allowance: 7,
    room_entitled: 0,
    room_used: 0,
  },
}

const dryRun: DryRunInvite = {
  confirmUrl: null,
  loginUrl: 'https://boardarabia.com/login',
  otp: null,
  tempPassword: null,
}

const root = document.getElementById('root')
if (!root) throw new Error('missing root')

createRoot(root).render(
  <StrictMode>
    <main className={screen === 'handover' ? 'min-h-screen bg-ink px-4 py-6 text-pearl' : 'min-h-screen bg-[var(--ba-porcelain)] px-4 py-6 text-ink'}>
      {screen === 'welcome-empty' ? <SponsorWelcome allowances={null} onDismiss={() => {}} /> : null}
      {screen === 'welcome-package' ? (
        <SponsorWelcome
          allowances={{ majlis_slots: 1, intro_credits: 2, room_credits: 0, monthly_base: 5 }}
          onDismiss={() => {}}
        />
      ) : null}
      {screen === 'welcome-error' ? (
        <SponsorWelcomeDismissFrame saving={false} error={DISMISS_SAVE_ERROR}>
          <SponsorWelcome
            allowances={{ majlis_slots: 1, intro_credits: 2, room_credits: 0, monthly_base: 5 }}
            onDismiss={() => {}}
          />
        </SponsorWelcomeDismissFrame>
      ) : null}
      {screen === 'credits' ? <SponsorshipView desk={desk} /> : null}
      {screen === 'handover' ? (
        <SponsorInvitePanel
          members={[{ user_id: 'example-seat', email: 'sponsor@example.com', seat: 'sponsor', status: 'invited' }]}
          firmByUser={{ 'example-seat': 'Example House' }}
          capKnown
          countError={false}
          submitting={false}
          open={false}
          firm=""
          email=""
          error=""
          success=""
          dryRunInvite={dryRun}
          onOpen={() => {}}
          onCancel={() => {}}
          onFirm={() => {}}
          onEmail={() => {}}
          onSubmit={() => {}}
          loadHandovers={false}
          initialHanded={{ 'example-seat': 'recorded' }}
        />
      ) : null}
    </main>
  </StrictMode>,
)
