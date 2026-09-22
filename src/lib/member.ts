export type FoundingSeat = 'ksa' | 'intl'

export type MemberRow = {
  user_id: string
  email: string
  seat: FoundingSeat
  status: 'invited' | 'active' | 'suspended'
  must_set_password: boolean
  invites_remaining: number
  invites_granted: number
}

export type ProfileRow = {
  user_id: string
  full_name: string | null
  headline: string | null
  company: string | null
  location: string | null
  linkedin_url: string | null
  bio: string | null
  phone: string | null
  investable_capacity_usd: number | string | null
  fo_aum_usd: number | string | null
  turnover_usd: number | string | null
  capacity_currency: string | null
  include_in_public_aggregates: boolean
  capacity_verified: boolean
}

export type FoundingCapacity = {
  ksa: number
  intl: number
  ksa_cap: number
  intl_cap: number
  total_cap: number
}

export function seatLabel(seat: FoundingSeat) {
  return seat === 'ksa' ? 'Saudi Arabia' : 'International'
}

export function parseCapacity(value: unknown): FoundingCapacity | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const num = (key: string) => {
    const raw = row[key]
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string' && raw.trim()) return Number(raw)
    return Number.NaN
  }
  const parsed = {
    ksa: num('ksa'),
    intl: num('intl'),
    ksa_cap: num('ksa_cap'),
    intl_cap: num('intl_cap'),
    total_cap: num('total_cap'),
  }
  if (Object.values(parsed).some((item) => !Number.isFinite(item))) return null
  return parsed
}

export function initials(name: string | null, email: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase()
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}
