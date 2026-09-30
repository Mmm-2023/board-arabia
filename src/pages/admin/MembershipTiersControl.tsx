import { useState } from 'react'
import {
  MEMBERSHIP_TIER_IDS,
  MEMBERSHIP_TIER_LABELS,
  TIER_SAVE_OK,
  membershipTiersInvalid,
  membershipTiersOf,
  tierSaveError,
  type MembershipTierId,
  type TierCarrier,
} from '../../lib/membershipTiers'

export type TierShot = {
  saved: MembershipTierId[]
  selected: MembershipTierId[]
  phase: 'idle' | 'saving' | 'saved' | 'error'
  message?: string
}

function sameTiers(left: readonly MembershipTierId[], right: readonly MembershipTierId[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function badgeLabel(id: MembershipTierId, foundingNumber: number | null | undefined) {
  if (id === 'founding' && typeof foundingNumber === 'number') return `Founding No. ${foundingNumber}`
  return MEMBERSHIP_TIER_LABELS[id]
}

export function MembershipTiersControl({
  member,
  onSave,
  shot,
}: {
  member: TierCarrier & { user_id: string }
  onSave: (tiers: MembershipTierId[]) => Promise<{ error?: string }>
  shot?: TierShot
}) {
  const initial = membershipTiersOf(member)
  const [saved, setSaved] = useState<MembershipTierId[]>(shot?.saved ?? initial)
  const [selected, setSelected] = useState<MembershipTierId[]>(shot?.selected ?? shot?.saved ?? initial)
  const [phase, setPhase] = useState<TierShot['phase']>(shot?.phase ?? 'idle')
  const [message, setMessage] = useState(shot?.message ?? '')
  const frozen = Boolean(shot)
  const busy = phase === 'saving'
  const dirty = !sameTiers(selected, saved)

  function toggle(id: MembershipTierId) {
    if (frozen || busy) return
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      return MEMBERSHIP_TIER_IDS.filter((item) => next.includes(item))
    })
    if (phase !== 'idle') {
      setPhase('idle')
      setMessage('')
    }
  }

  async function save() {
    if (frozen || busy || !dirty) return
    const invalid = membershipTiersInvalid(selected)
    if (invalid) {
      setPhase('error')
      setMessage(tierSaveError(invalid))
      return
    }
    setPhase('saving')
    setMessage('')
    const result = await onSave(selected)
    if (result.error) {
      setPhase('error')
      setMessage(tierSaveError(result.error))
      return
    }
    setSaved(selected)
    setPhase('saved')
    setMessage(TIER_SAVE_OK)
  }

  return (
    <div className="mt-3 max-w-full" data-membership-tiers={member.user_id} data-tier-phase={phase}>
      <div className="flex max-w-full flex-wrap gap-1.5" aria-label="Current tiers">
        {saved.map((id) => (
          <span
            key={id}
            data-tier-badge={id}
            className="inline-flex items-center rounded-full bg-[var(--ba-lavender-mist)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--ba-ink)]"
          >
            {badgeLabel(id, member.founding_number)}
          </span>
        ))}
      </div>
      <div className="mt-3 max-w-full">
        <p className="text-[0.95rem] font-semibold text-pearl">Membership tiers</p>
        <p className="mt-1 max-w-xl text-[0.9rem] leading-snug text-stone/80">
          Founding and Member cannot both be on. Sponsor can sit with either. Founding uses a numbered seat in this region.
        </p>
        <div
          className="tier-chip-track mt-2 flex max-w-full flex-wrap items-center gap-2 md:gap-1 md:rounded-full md:bg-[var(--ba-lavender-mist)] md:p-1"
          role="group"
          aria-label="Membership tiers"
        >
          {MEMBERSHIP_TIER_IDS.map((id) => {
            const on = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={busy}
                onClick={() => toggle(id)}
                className={`tier-chip inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.875rem] font-semibold whitespace-nowrap ${
                  on
                    ? 'bg-[var(--ba-indigo)] text-white'
                    : 'bg-[var(--ba-lavender-mist)] text-[var(--ba-ink)] hover:bg-white md:bg-transparent'
                } ${busy ? 'pointer-events-none' : ''}`}
              >
                {on ? (
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                ) : null}
                {MEMBERSHIP_TIER_LABELS[id]}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex max-w-full flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || busy}
            aria-busy={busy}
            className="ba-primary inline-flex min-h-11 items-center px-4 text-[0.875rem] font-semibold disabled:opacity-40"
          >
            {busy ? 'Saving' : 'Save'}
          </button>
          {message ? (
            <p
              className={`min-w-0 text-[0.95rem] ${phase === 'error' ? 'text-red-300' : 'text-pearl'}`}
              role={phase === 'error' ? 'alert' : 'status'}
            >
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
