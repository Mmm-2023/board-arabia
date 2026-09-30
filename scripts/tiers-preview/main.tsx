import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import '../../src/index.css'
import { TIER_SAVE_OK, peopleCardLine, tierSaveError } from '../../src/lib/membershipTiers'
import { MembershipTiersControl, type TierShot } from '../../src/pages/admin/MembershipTiersControl'

const member = {
  user_id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  seat: 'ksa' as const,
  status: 'active' as const,
  tier: 'founding' as const,
  tiers: ['founding'],
  founding_number: 7,
}

const shots: Record<string, TierShot> = {
  before: { saved: ['founding'], selected: ['founding'], phase: 'idle' },
  after: {
    saved: ['founding', 'sponsor'],
    selected: ['founding', 'sponsor'],
    phase: 'saved',
    message: TIER_SAVE_OK,
  },
  saving: { saved: ['founding'], selected: ['founding', 'sponsor'], phase: 'saving' },
  error: {
    saved: ['founding'],
    selected: ['founding', 'member'],
    phase: 'error',
    message: tierSaveError('invalid_combination'),
  },
}

const state = new URLSearchParams(window.location.search).get('state') || 'before'
const shot = shots[state] ?? shots.before
const line = peopleCardLine({ ...member, status: 'active', tiers: shot.saved })

function Card() {
  useEffect(() => {
    const card = document.querySelector('[data-people-card]')
    const root = document.documentElement
    if (!card) return
    root.dataset.cardOverflow = card.scrollWidth > card.clientWidth ? 'yes' : 'no'
    root.dataset.pageOverflow = root.scrollWidth > window.innerWidth ? 'yes' : 'no'
  }, [])

  return (
    <div className="min-h-dvh bg-ink p-4 text-pearl">
      <article
        data-people-card
        className="mx-auto w-full max-w-5xl border border-pearl/10 py-4 ps-5 pe-16"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.95rem] break-words text-stone/85">{member.email}</p>
            <p className="mt-1 text-[0.8rem] break-words text-pearl/45">{line}</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 items-center border border-pearl/20 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-pearl/70 uppercase"
          >
            Suspend
          </button>
        </div>
        <MembershipTiersControl member={member} onSave={async () => ({})} shot={shot} />
      </article>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(
  <StrictMode>
    <MemoryRouter>
      <Card />
    </MemoryRouter>
  </StrictMode>,
)
