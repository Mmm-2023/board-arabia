/** Public money stays hidden until this many verified, opted-in contributors. */
export const MIN_PUBLIC_CONTRIBUTORS = 5

/** Below this count, published money is rounded to the nearest $5m. At and above, $1m. */
export const COARSE_ROUND_BELOW = 10

const USD_CAP = 1_000_000_000_000

const OTHER_CURRENCY =
  /\b(SAR|AED|EUR|GBP|QAR|KWD|BHD|OMR|CHF|CNY|JPY|INR|EGP|TRY|RUB)\b|€|£/

export type CapacityPayload = {
  investable_capacity_usd: number | null
  fo_aum_usd: number | null
  turnover_usd: number | null
  include_in_public_aggregates: boolean
  capacity_verified: boolean
}

export function readNumeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Blank is null. Anything else must be a non-negative USD amount within the cap. */
export function parseUsdInput(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim().replace(/[$,\s]/g, '')
  if (!trimmed) return null
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'invalid'
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0 || amount > USD_CAP) return 'invalid'
  return amount
}

export function amountToInput(value: unknown): string {
  const amount = readNumeric(value)
  if (amount == null) return ''
  return String(amount)
}

/**
 * Suggest a USD figure only when the written text already says USD or $.
 * Other currencies stay blank so Admit does not invent a conversion.
 */
export function suggestUsd(text: string | null | undefined): number | null {
  if (!text) return null
  const raw = text.trim()
  if (!raw) return null
  const hasUsd = /(\bUSD\b|US\$|\$)/i.test(raw)
  if (!hasUsd || OTHER_CURRENCY.test(raw)) return null
  const match = raw.match(/(\d[\d,]*(?:\.\d+)?)(?:\s*(billion|bn|million|mn|m|b)\b)?/i)
  if (!match) return null
  const base = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return null
  const unit = (match[2] || '').toLowerCase()
  let amount = base
  if (unit === 'billion' || unit === 'bn' || unit === 'b') amount = base * 1_000_000_000
  else if (unit === 'million' || unit === 'mn' || unit === 'm') amount = base * 1_000_000
  if (amount < 0 || amount > USD_CAP) return null
  return amount
}

/** Mirrors private.round_public_usd. The database is the publisher; this is for tests. */
export function roundPublicUsd(amount: number | null, contributors: number): number | null {
  if (contributors < MIN_PUBLIC_CONTRIBUTORS || amount == null || !Number.isFinite(amount)) {
    return null
  }
  const step = contributors < COARSE_ROUND_BELOW ? 5_000_000 : 1_000_000
  return Math.round(amount / step) * step
}

/** Client gate. A money figure with fewer than 5 contributors is not shown. */
export function visiblePublicUsd(amount: number | null, contributors: number): number | null {
  if (contributors < MIN_PUBLIC_CONTRIBUTORS) return null
  if (amount == null || !Number.isFinite(amount) || amount < 0) return null
  return amount
}

export function formatPublicUsd(amount: number): string {
  const abs = Math.abs(amount)
  if (abs >= 1_000_000_000) {
    const billions = Math.round((abs / 1_000_000_000) * 10) / 10
    const text = Number.isInteger(billions) ? String(billions) : billions.toFixed(1)
    return `$${text}bn`
  }
  const millions = Math.round(abs / 1_000_000)
  return `$${millions.toLocaleString('en-US')}m`
}

export function formatPrivateUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export type CapacityDraft = {
  investable: string
  foAum: string
  turnover: string
  include: boolean
  verified: boolean
}

export function draftFromApplication(app: {
  investable_capacity_usd: unknown
  include_in_public_aggregates?: boolean | null
  fo_aum: string | null
  turnover: string
}): CapacityDraft {
  return {
    investable: amountToInput(app.investable_capacity_usd),
    foAum: amountToInput(suggestUsd(app.fo_aum)),
    turnover: amountToInput(suggestUsd(app.turnover)),
    include: app.include_in_public_aggregates !== false,
    verified: false,
  }
}

export function draftFromProfile(
  profile: {
    investable_capacity_usd: unknown
    fo_aum_usd: unknown
    turnover_usd: unknown
    include_in_public_aggregates?: boolean | null
    capacity_verified?: boolean | null
  } | null,
): CapacityDraft {
  if (!profile) {
    return { investable: '', foAum: '', turnover: '', include: true, verified: false }
  }
  return {
    investable: amountToInput(profile.investable_capacity_usd),
    foAum: amountToInput(profile.fo_aum_usd),
    turnover: amountToInput(profile.turnover_usd),
    include: profile.include_in_public_aggregates !== false,
    verified: Boolean(profile.capacity_verified),
  }
}

export function usdSuggestionNote(turnover: string, foAum: string | null) {
  if (suggestUsd(turnover) != null || suggestUsd(foAum) != null) {
    return 'A USD figure from the written application is prefilled. Confirm it before you admit. Other currencies are left blank.'
  }
  return 'Enter US dollars. If the written figure is in another currency, leave the number blank. Blank figures are not counted.'
}

export function parseCapacityPayload(input: {
  investable: string
  foAum: string
  turnover: string
  include: boolean
  verified: boolean
}): { error: string } | CapacityPayload {
  const investable = parseUsdInput(input.investable)
  const foAum = parseUsdInput(input.foAum)
  const turnover = parseUsdInput(input.turnover)
  if (investable === 'invalid' || foAum === 'invalid' || turnover === 'invalid') {
    return { error: 'Capacity amounts must be USD numbers from 0 to 1 trillion, or blank.' }
  }
  return {
    investable_capacity_usd: investable,
    fo_aum_usd: foAum,
    turnover_usd: turnover,
    include_in_public_aggregates: input.include,
    capacity_verified: input.verified,
  }
}
