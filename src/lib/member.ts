import type { StoredAvatarStyle } from './avatarStyle.ts'
import type { Availability } from './profileTags.ts'

export type FoundingSeat = 'ksa' | 'intl'
export type MemberSeat = FoundingSeat | 'sponsor'

export type MemberRow = {
  user_id: string
  email: string
  seat: MemberSeat
  status: 'invited' | 'active' | 'suspended'
  must_set_password: boolean
  invites_remaining: number
  invites_granted: number
  founding_number?: number | null
  tier?: 'founding' | 'member' | null
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
  calendar_url?: string | null
  investable_capacity_usd: number | string | null
  fo_aum_usd: number | string | null
  turnover_usd: number | string | null
  capacity_currency: string | null
  include_in_public_aggregates: boolean
  capacity_verified: boolean
  avatar_path: string | null
  avatar_style?: StoredAvatarStyle | null
  availability?: Availability | null
  sector_tags?: string[]
  vision_themes?: string[]
}

export type FoundingCapacity = {
  ksa: number
  intl: number
  ksa_cap: number
  intl_cap: number
  total_cap: number
}

/** Saudi Arabia and International are founding seats. Sponsor is its own seat. */
export function seatLabel(seat: string | null | undefined) {
  if (seat === 'ksa') return 'Saudi Arabia'
  if (seat === 'intl') return 'International'
  if (seat === 'sponsor') return 'Partner'
  return 'Unknown seat'
}

export function adminMemberLine(seat: string, status: string) {
  if (seat === 'sponsor') return `Partner · ${status}`
  if (seat === 'ksa' || seat === 'intl') return `${seatLabel(seat)} · Founding Member · ${status}`
  return `${seatLabel(seat)} · ${status}`
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

