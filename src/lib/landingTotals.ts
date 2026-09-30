import { formatPublicUsd } from './capacity.ts'
import { seatsArePublic, type DisplayTotals } from './platformFloors.ts'
import { seatLine } from './platformStats.ts'

export const TOTALS_DISCLAIMER =
  "Figures reflect the network's represented capacity. Individual amounts are never shown."

export type TotalsItem = { label: string; value: string }

const LABELS = {
  investment: 'Platform investment capability',
  foAum: 'Family office AUM represented',
  turnover: 'Business turnover capacity',
  seats: 'Founding seats admitted',
} as const

/** Numbers only. A withheld figure is omitted. An empty list means the line stays hidden. */
export function landingTotalsItems(shown: DisplayTotals | null): TotalsItem[] {
  if (!shown) return []
  const items: TotalsItem[] = []
  if (shown.investment != null) {
    items.push({ label: LABELS.investment, value: formatPublicUsd(shown.investment) })
  }
  if (shown.foAum != null) {
    items.push({ label: LABELS.foAum, value: formatPublicUsd(shown.foAum) })
  }
  if (shown.turnover != null) {
    items.push({ label: LABELS.turnover, value: formatPublicUsd(shown.turnover) })
  }
  if (seatsArePublic(shown.admitted) && shown.ksa != null && shown.intl != null) {
    const seats = seatLine({
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
    items.push({ label: LABELS.seats, value: seats.label })
  }
  return items
}

/** Outlines only unless the public seat count is a live number. */
export function seatDiamondFill(shown: DisplayTotals | null): { ksa: number; intl: number } {
  if (!shown || !seatsArePublic(shown.admitted) || shown.ksa == null || shown.intl == null) {
    return { ksa: 0, intl: 0 }
  }
  return {
    ksa: Math.max(0, Math.min(50, Math.round(shown.ksa))),
    intl: Math.max(0, Math.min(50, Math.round(shown.intl))),
  }
}
