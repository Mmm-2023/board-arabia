import { readNumeric } from './capacity.ts'

/**
 * Publication thresholds for the three public money totals.
 * The same amounts live on public.demo_thresholds
 * (floor_investment_usd, floor_fo_aum_usd, floor_turnover_usd).
 * A total is shown only when the real published sum is above the threshold.
 * The threshold itself is never a displayed figure.
 * The public seat counter uses SEAT_PUBLISH_MIN and is not a money floor.
 */
export const PLATFORM_FLOOR_DEFAULTS = {
  investmentUsd: 100_000_000,
  foAumUsd: 1_000_000_000,
  turnoverUsd: 500_000_000,
} as const

/** Hide the public seat counter until the live count reaches this. */
export const SEAT_PUBLISH_MIN = 15

export const FORMING_LABEL = 'Forming'
export const FORMING_TOTALS = 'Platform totals are forming.'

export type PlatformFloorDefaults = typeof PLATFORM_FLOOR_DEFAULTS

/** Real published sum, or null when it has not passed the floor. */
export function moneyAboveFloor(real: number | null, floor: number): number | null {
  if (real == null || !Number.isFinite(real) || real <= 0) return null
  if (!Number.isFinite(floor) || floor < 0) return real
  if (real > floor) return real
  return null
}

export function displayPlatformMoney(
  real: {
    investment: number | null
    foAum: number | null
    turnover: number | null
  } | null,
  floors: PlatformFloorDefaults = PLATFORM_FLOOR_DEFAULTS,
): { investment: number | null; foAum: number | null; turnover: number | null } {
  return {
    investment: moneyAboveFloor(real?.investment ?? null, floors.investmentUsd),
    foAum: moneyAboveFloor(real?.foAum ?? null, floors.foAumUsd),
    turnover: moneyAboveFloor(real?.turnover ?? null, floors.turnoverUsd),
  }
}

export type DisplayTotals = {
  investment: number | null
  foAum: number | null
  turnover: number | null
  admitted: number | null
  ksa: number | null
  intl: number | null
}

export function seatsArePublic(admitted: number | null): admitted is number {
  return admitted != null && Number.isFinite(admitted) && admitted >= SEAT_PUBLISH_MIN
}

/**
 * Read a totals payload. Money at or below the publication threshold is withheld,
 * including a server value that is only the floor. Seat counts pass through.
 */
export function presentServerTotals(
  raw: unknown,
  floors: PlatformFloorDefaults = PLATFORM_FLOOR_DEFAULTS,
): DisplayTotals | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const investment = readNumeric(row.investment_usd)
  const foAum = readNumeric(row.fo_aum_usd)
  const turnover = readNumeric(row.turnover_usd)
  if (
    (investment != null && investment < 0) ||
    (foAum != null && foAum < 0) ||
    (turnover != null && turnover < 0)
  ) {
    return null
  }
  const admitted = readNumeric(row.founding_admitted_count)
  const ksa = readNumeric(row.founding_ksa_count)
  const intl = readNumeric(row.founding_intl_count)
  return {
    investment: moneyAboveFloor(investment, floors.investmentUsd),
    foAum: moneyAboveFloor(foAum, floors.foAumUsd),
    turnover: moneyAboveFloor(turnover, floors.turnoverUsd),
    admitted: admitted != null && admitted >= 0 ? admitted : null,
    ksa: ksa != null && ksa >= 0 ? ksa : null,
    intl: intl != null && intl >= 0 ? intl : null,
  }
}
