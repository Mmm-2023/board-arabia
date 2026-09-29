import { useEffect, useState } from 'react'
import { formatPublicUsd } from '../lib/capacity'
import {
  displayPlatformMoney,
  FORMING_LABEL,
  presentServerTotals,
  seatsArePublic,
  type DisplayTotals,
} from '../lib/platformFloors'
import { seatLine, type PlatformStats } from '../lib/platformStats'
import { fetchPlatformStats, supabase } from '../lib/supabase'
import { Eyebrow } from './Type'

const EARLY = 'Building the Founding 100'
const DISCLAIMER =
  "Figures reflect the network's represented capacity. Individual amounts are never shown."

function shownFromStats(stats: PlatformStats | null): DisplayTotals {
  const money = displayPlatformMoney(stats)
  return {
    ...money,
    admitted: stats?.admitted ?? null,
    ksa: stats?.ksa ?? null,
    intl: stats?.intl ?? null,
  }
}

export function StatsStrip() {
  const [shown, setShown] = useState<DisplayTotals | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const real = await fetchPlatformStats()
      if (!cancelled && real) {
        setShown(shownFromStats(real))
        return
      }
      const { data, error } = await supabase.rpc('landing_platform_totals')
      if (!cancelled && !error) {
        const parsed = presentServerTotals(data)
        if (parsed) {
          setShown(parsed)
          return
        }
      }
      if (!cancelled) setShown(shownFromStats(null))
    }
    void load()
    const channel = supabase
      .channel('platform-stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_stats' },
        () => {
          void load()
        },
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [])

  const seats =
    shown && seatsArePublic(shown.admitted) && shown.ksa != null && shown.intl != null
      ? seatLine({
          investment: null,
          foAum: null,
          turnover: null,
          admitted: shown.admitted,
          ksa: shown.ksa,
          intl: shown.intl,
          contributorsInvestment: 0,
          contributorsFo: 0,
          contributorsTurnover: 0,
          updatedAt: null,
        })
      : null
  const title = shown && (shown.admitted ?? 0) >= 100 ? 'Founding 100' : EARLY

  return (
    <section
      id="totals"
      aria-labelledby="totals-heading"
      className="border-b border-ink/10 bg-stone"
    >
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-16">
        <Eyebrow>Platform totals</Eyebrow>
        <p
          id="totals-heading"
          className="max-w-3xl font-display text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink"
        >
          {title}
        </p>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyStat
            label="Platform investment capability"
            amount={shown?.investment ?? null}
          />
          <MoneyStat label="Family office AUM represented" amount={shown?.foAum ?? null} />
          <MoneyStat label="Business turnover capacity" amount={shown?.turnover ?? null} />
          <li className="border-t border-ink/15 pt-5">
            <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/45 uppercase">
              Founding seats admitted
            </p>
            {seats ? (
              <>
                <p className="mt-4 font-display text-[clamp(2.2rem,4vw,3.2rem)] font-extrabold leading-none tracking-[-0.04em] text-ink">
                  <CountUp value={seats.admitted} format={(value) => `${Math.round(value)} / 100`} />
                </p>
                <p className="mt-3 text-[0.92rem] leading-relaxed text-ink/55">{seats.split}</p>
              </>
            ) : (
              <p className="mt-4 font-serif text-[1.65rem] italic leading-tight text-ink/45">
                {FORMING_LABEL}
              </p>
            )}
          </li>
        </ul>
        <p className="mt-8 max-w-3xl text-[0.95rem] leading-relaxed text-ink/55">{DISCLAIMER}</p>
      </div>
    </section>
  )
}

function MoneyStat({ label, amount }: { label: string; amount: number | null }) {
  return (
    <li className="border-t border-ink/15 pt-5">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/45 uppercase">
        {label}
      </p>
      {amount == null ? (
        <p className="mt-4 font-serif text-[1.65rem] italic leading-tight text-ink/45">
          {FORMING_LABEL}
        </p>
      ) : (
        <p className="mt-4 font-display text-[clamp(2.2rem,4vw,3.2rem)] font-extrabold leading-none tracking-[-0.04em] text-ink">
          <CountUp value={amount} format={formatPublicUsd} />
        </p>
      )}
    </li>
  )
}

function CountUp({
  value,
  format,
}: {
  value: number
  format: (value: number) => string
}) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || value === 0) {
      const frame = requestAnimationFrame(() => setShown(value))
      return () => cancelAnimationFrame(frame)
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 800)
      const eased = 1 - (1 - progress) ** 3
      setShown(value * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <span>{format(shown)}</span>
}
