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
    if (frozen || busy) return
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
    <div className="mt-4 max-w-full" data-membership-tiers={member.user_id} data-tier-phase={phase}>
      <div className="flex max-w-full flex-wrap gap-2" aria-label="Current tiers">
        {saved.map((id) => (
          <span
            key={id}
            data-tier-badge={id}
            className="inline-flex min-h-11 items-center border border-pearl/20 px-3 text-[0.68rem] font-semibold tracking-[0.08em] text-brass-bright uppercase"
          >
            {MEMBERSHIP_TIER_LABELS[id]}
          </span>
        ))}
      </div>
      <fieldset className="mt-3 max-w-full" disabled={busy}>
        <legend className="text-[0.68rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">
          Membership tiers
        </legend>
        <p className="mt-2 max-w-xl text-[0.85rem] text-stone/65">
          Founding and Member cannot both be on. Sponsor can sit with either. Founding uses a numbered seat in this region.
        </p>
        <div className="mt-3 flex max-w-full flex-wrap gap-2">
          {MEMBERSHIP_TIER_IDS.map((id) => {
            const on = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => toggle(id)}
                className={`inline-flex min-h-11 items-center border px-3 text-[0.72rem] font-semibold tracking-[0.06em] uppercase disabled:opacity-40 ${
                  on ? 'border-brass/70 text-brass-bright' : 'border-pearl/20 text-pearl/70'
                }`}
              >
                {MEMBERSHIP_TIER_LABELS[id]}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          aria-busy={busy}
          className="mt-3 inline-flex min-h-11 items-center border border-brass/60 px-3 text-[0.68rem] font-semibold tracking-[0.06em] text-brass-bright uppercase disabled:opacity-40"
        >
          {busy ? 'Saving' : 'Save'}
        </button>
      </fieldset>
      {message ? (
        <p
          className={`mt-3 max-w-xl text-[0.95rem] ${phase === 'error' ? 'text-red-300' : 'text-brass-bright'}`}
          role={phase === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
