import { readNumeric, visiblePublicUsd } from './capacity.ts'

export type PlatformStats = {
  investment: number | null
  foAum: number | null
  turnover: number | null
  admitted: number
  ksa: number
  intl: number
  contributorsInvestment: number
  contributorsFo: number
  contributorsTurnover: number
  updatedAt: string | null
}

const FOUNDING_CAP = 100

export function parsePlatformStats(row: Record<string, unknown> | null): PlatformStats | null {
  if (!row) return null
  const admitted = readNumeric(row.founding_admitted_count)
  const ksa = readNumeric(row.founding_ksa_count)
  const intl = readNumeric(row.founding_intl_count)
  if (admitted == null || ksa == null || intl == null) return null

  const contributorsInvestment = readNumeric(row.contributors_investment_n) ?? 0
  const contributorsFo = readNumeric(row.contributors_fo_n) ?? 0
  const contributorsTurnover = readNumeric(row.contributors_turnover_n) ?? 0

  return {
    investment: visiblePublicUsd(readNumeric(row.investment_capability_usd), contributorsInvestment),
    foAum: visiblePublicUsd(readNumeric(row.fo_aum_usd), contributorsFo),
    turnover: visiblePublicUsd(readNumeric(row.turnover_usd), contributorsTurnover),
    admitted,
    ksa,
    intl,
    contributorsInvestment,
    contributorsFo,
    contributorsTurnover,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

export function seatLine(stats: PlatformStats) {
  const admitted = Math.min(FOUNDING_CAP, Math.max(0, Math.round(stats.admitted)))
  return {
    admitted,
    label: `${admitted} / ${FOUNDING_CAP}`,
    split: `Saudi Arabia ${Math.max(0, Math.round(stats.ksa))} · International ${Math.max(0, Math.round(stats.intl))}`,
  }
}
