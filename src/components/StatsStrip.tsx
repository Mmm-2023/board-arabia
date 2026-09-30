import { useEffect, useState } from 'react'
import {
  displayPlatformMoney,
  presentServerTotals,
  type DisplayTotals,
} from '../lib/platformFloors'
import { type PlatformStats } from '../lib/platformStats'
import { fetchPlatformStats, supabase } from '../lib/supabase'
import { landingTotalsItems, TOTALS_DISCLAIMER } from '../lib/landingTotals'

function shownFromStats(stats: PlatformStats | null): DisplayTotals {
  const money = displayPlatformMoney(stats)
  return {
    ...money,
    admitted: stats?.admitted ?? null,
    ksa: stats?.ksa ?? null,
    intl: stats?.intl ?? null,
  }
}

export { landingTotalsItems, seatDiamondFill, TOTALS_DISCLAIMER } from '../lib/landingTotals'

export function useLandingTotals(): DisplayTotals | null {
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

  return shown
}

export function PlatformTotalsLine({ shown }: { shown: DisplayTotals | null }) {
  const items = landingTotalsItems(shown)
  if (items.length === 0) return null
  return (
    <p className="ba-totals-line" aria-label={TOTALS_DISCLAIMER}>
      {items.map((item, index) => (
        <span key={item.label} className="ba-totals-item">
          {index > 0 ? (
            <span aria-hidden="true" className="ba-totals-dot">
              ·
            </span>
          ) : null}
          <span>{item.label}</span> <strong>{item.value}</strong>
        </span>
      ))}
    </p>
  )
}
