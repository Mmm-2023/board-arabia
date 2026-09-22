import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchFoundingCapacity } from '../../lib/supabase'
import { initials, seatLabel, type FoundingCapacity } from '../../lib/member'
import { useNoIndex } from '../../lib/usePageTitle'
import { useMember } from './context'

export function DashboardHome() {
  const { member, profile, email } = useMember()
  const [capacity, setCapacity] = useState<FoundingCapacity | null>(null)
  const [capacityError, setCapacityError] = useState('')
  const name = profile?.full_name?.trim() || 'Founding member'
  useNoIndex('Home | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchFoundingCapacity().then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setCapacityError(result.error)
        return
      }
      setCapacity(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filled = capacity ? capacity.ksa + capacity.intl : null
  const remain = capacity ? Math.max(capacity.total_cap - (filled ?? 0), 0) : null

  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
        Home
      </p>
      <h1 className="mt-3 font-display text-[2.4rem] font-bold tracking-[-0.04em] text-balance md:text-[3rem]">
        {name}
      </h1>
      <p className="mt-3 font-serif text-[1.35rem] text-ink/70 italic">
        {seatLabel(member.seat)} seat
      </p>
      {profile?.headline && (
        <p className="mt-2 text-[1rem] text-ink/55">{profile.headline}</p>
      )}

      {member.must_set_password && (
        <p className="mt-6 border border-brass/50 bg-white/60 px-4 py-3 text-[0.95rem] text-ink/75">
          Set a password before you leave this session.{' '}
          <Link to="/dashboard/profile#password" className="border-b border-brass text-ink">
            Profile
          </Link>
        </p>
      )}

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <article
          aria-label="Founding badge placeholder"
          className="flex min-h-64 flex-col justify-between border border-brass/50 bg-ink px-6 py-6 text-pearl"
        >
          <div className="flex items-start justify-between gap-4">
            <p className="text-[0.68rem] font-semibold tracking-[0.16em] text-brass-bright uppercase">
              Founding member
            </p>
            <p className="text-[0.68rem] tracking-[0.12em] text-pearl/45 uppercase">
              Placeholder
            </p>
          </div>
          <p className="font-display text-[3.4rem] leading-none font-bold tracking-[-0.04em]">
            {initials(profile?.full_name ?? null, email)}
          </p>
          <div>
            <p className="font-display text-[1.2rem] font-semibold tracking-[-0.02em]">
              {name}
            </p>
            <p className="mt-1 text-[0.92rem] text-pearl/65">{seatLabel(member.seat)}</p>
            <p className="mt-4 font-serif text-[1rem] text-pearl/50 italic">
              The mark is not issued from this page.
            </p>
          </div>
        </article>

        <section className="border border-ink/10 bg-white/50 px-6 py-6">
          <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
            Founding hundred
          </h2>
          {capacity ? (
            <div className="mt-5 space-y-5">
              <Meter
                label="Saudi Arabia"
                value={capacity.ksa}
                cap={capacity.ksa_cap}
                own={member.seat === 'ksa'}
              />
              <Meter
                label="International"
                value={capacity.intl}
                cap={capacity.intl_cap}
                own={member.seat === 'intl'}
              />
              <p className="text-[0.98rem] leading-relaxed text-ink/65">
                {remain} {remain === 1 ? 'place remains' : 'places remain'} of {capacity.total_cap}.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-[0.95rem] text-ink/50">
              {capacityError || 'Loading capacity…'}
            </p>
          )}
        </section>
      </div>

      <section className="mt-4 border border-ink/10 px-6 py-6">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
          Next majlis
        </h2>
        <p className="mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink/65">
          Quarterly dates are circulated to members. Nothing is scheduled in this shell.
        </p>
        <Link
          to="/dashboard/events"
          className="mt-4 inline-block text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
        >
          Events
        </Link>
      </section>
    </div>
  )
}

function Meter({
  label,
  value,
  cap,
  own,
}: {
  label: string
  value: number
  cap: number
  own: boolean
}) {
  const width = cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.95rem] text-ink">
          {label}
          {own ? ' · your seat' : ''}
        </p>
        <p className="font-display text-[1.05rem] font-semibold tracking-[-0.02em]">
          {value}
          <span className="text-ink/35"> / {cap}</span>
        </p>
      </div>
      <div className="mt-2 h-px w-full bg-ink/10">
        <div className="h-px bg-brass" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
