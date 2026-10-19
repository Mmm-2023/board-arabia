import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { FreeMajlisPanel } from '../../src/pages/dashboard/account/FreeMajlisScreen'
import type { FreeMajlisRow } from '../../src/lib/freeMajlis'
import { AppShell } from '../../src/shell/AppShell'
import { ACCOUNT_SHEET_LINKS, LOCKED_HUBS, MEMBER_DESTINATIONS } from '../../src/shell/destinations'
import { registerCandidate } from '../../supabase/functions/_shared/candidate_flow.ts'
import './free-account.css'

const rows: FreeMajlisRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    eventId: '22222222-2222-4222-8222-222222222222',
    title: 'Capital allocation',
    startsAt: '2026-11-12T15:00:00.000Z',
    endsAt: '2026-11-12T16:00:00.000Z',
    status: 'accepted',
    joinUrl: 'https://meet.google.com/abc-defg-hij',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    eventId: '44444444-4444-4444-8444-444444444444',
    title: 'Audit committee',
    startsAt: '2026-12-03T15:00:00.000Z',
    endsAt: '2026-12-03T16:00:00.000Z',
    status: 'pending',
    joinUrl: null,
  },
]

type Screen = 'ready' | 'empty' | 'error' | 'loading'

function screenFromLocation(): Screen {
  const view = new URLSearchParams(location.search).get('view')
  if (view === 'empty' || view === 'error' || view === 'loading') return view
  return 'ready'
}

function SignupCheck() {
  const [line, setLine] = useState('Not run')

  async function run() {
    const now = new Date('2026-10-19T15:00:00.000Z')
    const base = {
      now: () => now,
      pepper: 'test-pepper',
      turnstileSecret: '',
      site: 'https://example.com',
      verifyTurnstile: async () => true,
      findCandidate: async () => null,
      findAuthUserId: async () => null,
      createAuthUser: async () => ({ userId: '11111111-1111-4111-8111-111111111111' }),
      insertCandidate: async () => ({}),
      issueCode: async () => 'ok' as const,
      voidLatestCode: async () => {},
      issueSignInLink: async () => ({ url: 'https://example.com/login' }),
      recordEvent: async () => {},
      claimInvite: async () => false,
      domainStatus: async () => 'ok' as const,
      mailboxOk: async () => true,
      consumeRegisterLimit: async () => 'ok' as const,
    }
    const form = {
      full_name: 'Ada Example',
      email: 'ada@example.com',
      role: 'chairperson',
      region: 'ksa_gcc',
      consent: true,
      form_started_at: now.getTime() - 10_000,
    }
    const fresh = await registerCandidate(form, '203.0.113.10', {
      ...base,
      emailIsMember: async () => false,
      sendMail: async () => ({ ok: true, dryRun: true }),
    })
    const existing = await registerCandidate(form, '203.0.113.10', {
      ...base,
      emailIsMember: async () => true,
      sendMail: async () => ({ ok: true, dryRun: true }),
    })
    const same = JSON.stringify(fresh.body) === JSON.stringify(existing.body) && fresh.status === existing.status
    setLine(same ? `Same reply ${fresh.status}` : 'Replies differed')
  }

  return (
    <div className="border border-[var(--ba-line)] bg-white px-5 py-5" data-signup-check="">
      <h2 className="font-display text-[1.25rem] font-semibold">Test signup</h2>
      <p className="mt-2 text-[0.98rem] text-ink/70">
        In-process check with example.com. It does not send mail. A live run is the smoke script with the live flag.
      </p>
      <button
        type="button"
        className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
        onClick={() => void run()}
      >
        Run test signup
      </button>
      <p className="mt-3 text-[1rem]" data-signup-result="">
        {line}
      </p>
    </div>
  )
}

function Page() {
  const screen = screenFromLocation()
  const state = screen === 'ready' ? 'ready' : screen
  return (
    <MemoryRouter initialEntries={['/dashboard/majlis']}>
      <AppShell
        tone="member"
        destinations={MEMBER_DESTINATIONS}
        secondary={ACCOUNT_SHEET_LINKS}
        lockedDestinationIds={LOCKED_HUBS}
        updatedLabel="Updated 18:05 AST"
        roleSwitch={null}
        onSignOut={() => {}}
        accountLabel="ada@example.com"
        accountName="Ada Example"
      >
        <FreeMajlisPanel
          state={state}
          rows={state === 'ready' ? rows : []}
          updatedLabel="Updated 18:05 AST"
          onRetry={() => {}}
        />
        <div className="mt-8 max-w-xl">
          <SignupCheck />
        </div>
      </AppShell>
    </MemoryRouter>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<Page />)
