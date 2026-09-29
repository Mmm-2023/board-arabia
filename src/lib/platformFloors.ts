import { readNumeric } from './capacity.ts'

/**
 * Quiet display floors for the three public money totals.
 * The live switch is public.demo_thresholds
 * (floor_investment_usd, floor_fo_aum_usd, floor_turnover_usd).
 * These defaults must match that migration.
 * landing_platform_totals applies them on the server.
 * The client applies the same rule only when that RPC is not available yet.
 * Founding seats are never floored.
 */
export const PLATFORM_FLOOR_DEFAULTS = {
  investmentUsd: 100_000_000,
  foAumUsd: 1_000_000_000,
  turnoverUsd: 500_000_000,
} as const

export type PlatformFloorDefaults = typeof PLATFORM_FLOOR_DEFAULTS

/** Display is max(published, floor). Null, non-finite, or negative published counts as 0. */
export function quietFloorUsd(real: number | null, floor: number): number {
  const published = real == null || !Number.isFinite(real) || real < 0 ? 0 : real
  if (!Number.isFinite(floor) || floor < 0) return published
  return Math.max(published, floor)
}

export function displayPlatformMoney(
  real: {
    investment: number | null
    foAum: number | null
    turnover: number | null
  } | null,
  floors: PlatformFloorDefaults = PLATFORM_FLOOR_DEFAULTS,
): { investment: number; foAum: number; turnover: number } {
  return {
    investment: quietFloorUsd(real?.investment ?? null, floors.investmentUsd),
    foAum: quietFloorUsd(real?.foAum ?? null, floors.foAumUsd),
    turnover: quietFloorUsd(real?.turnover ?? null, floors.turnoverUsd),
  }
}

export type DisplayTotals = {
  investment: number
  foAum: number
  turnover: number
  admitted: number | null
  ksa: number | null
  intl: number | null
}

/**
 * Totals already combined on the server. Do not apply the floor again.
 * Seat counts pass through, including null when the stats row is missing.
 */
export function presentServerTotals(raw: unknown): DisplayTotals | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const investment = readNumeric(row.investment_usd)
  const foAum = readNumeric(row.fo_aum_usd)
  const turnover = readNumeric(row.turnover_usd)
  if (investment == null || foAum == null || turnover == null) return null
  if (investment < 0 || foAum < 0 || turnover < 0) return null
  const admitted = readNumeric(row.founding_admitted_count)
  const ksa = readNumeric(row.founding_ksa_count)
  const intl = readNumeric(row.founding_intl_count)
  return {
    investment,
    foAum,
    turnover,
    admitted: admitted != null && admitted >= 0 ? admitted : null,
    ksa: ksa != null && ksa >= 0 ? ksa : null,
    intl: intl != null && intl >= 0 ? intl : null,
  }
}
