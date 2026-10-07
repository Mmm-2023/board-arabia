import { seatLabel } from './member.ts'

/** Extend with Partner by appending here and in private.membership_tier_catalog(). */
export const MEMBERSHIP_TIER_IDS = ['founding', 'member', 'sponsor'] as const

export type MembershipTierId = (typeof MEMBERSHIP_TIER_IDS)[number]

export const MEMBERSHIP_TIER_LABELS: Record<MembershipTierId, string> = {
  founding: 'Founding',
  member: 'Member',
  sponsor: 'Partner',
}

export function isMembershipTierId(value: string): value is MembershipTierId {
  return (MEMBERSHIP_TIER_IDS as readonly string[]).includes(value)
}

/** Catalog order, duplicates removed, unknown values dropped. */
export function normalizeMembershipTiers(values: readonly string[] | null | undefined): MembershipTierId[] {
  const picked = new Set<MembershipTierId>()
  for (const value of values ?? []) {
    if (isMembershipTierId(value)) picked.add(value)
  }
  return MEMBERSHIP_TIER_IDS.filter((id) => picked.has(id))
}

/** Founding and Member cannot combine. A sponsor seat cannot also hold Founding. */
export function membershipTiersInvalid(
  values: readonly string[] | null | undefined,
): 'invalid_tier' | 'invalid_combination' | 'sponsor_founding' | null {
  const raw = [...(values ?? [])]
  if (raw.length < 1) return 'invalid_tier'
  if (raw.some((value) => !isMembershipTierId(value))) return 'invalid_tier'
  const normalized = normalizeMembershipTiers(raw)
  if (normalized.includes('founding') && normalized.includes('member')) return 'invalid_combination'
  if (normalized.includes('founding') && normalized.includes('sponsor')) return 'sponsor_founding'
  return null
}

export type TierCarrier = {
  seat: string
  status?: string
  tier?: string | null
  tiers?: readonly string[] | null
  founding_number?: number | null
}

/** Prefer the tier set. Fall back to the legacy tier column and sponsor seat. */
export function membershipTiersOf(member: TierCarrier): MembershipTierId[] {
  if (member.tiers && member.tiers.length > 0) return normalizeMembershipTiers(member.tiers)
  if (member.seat === 'sponsor' && member.founding_number != null) return ['founding', 'sponsor']
  if (member.seat === 'sponsor' && member.tier === 'member') return ['member', 'sponsor']
  if (member.seat === 'sponsor') return ['sponsor']
  if (member.tier === 'member') return ['member']
  if (member.seat === 'ksa' || member.seat === 'intl') return ['founding']
  return []
}

export function peopleCardLine(member: TierCarrier & { status: string }) {
  const parts = membershipTiersOf(member).map((id) => {
    if (id === 'founding' && typeof member.founding_number === 'number') {
      return `Founding No. ${member.founding_number}`
    }
    return MEMBERSHIP_TIER_LABELS[id]
  })
  const tierText = parts.length > 0 ? parts.join(', ') : 'No tier'
  return `${seatLabel(member.seat)} · ${tierText} · ${member.status}`
}

/** Plain text for set_member_tiers and claim_founding_seat error codes. */
export function tierSaveError(message: string): string {
  const code = message.toLowerCase()
  if (code.includes('not_allowed') || code.includes('not staff')) return 'You do not have access to change tiers.'
  if (code.includes('not_found')) return 'This person is not on the list.'
  if (code.includes('invalid_combination')) return 'Founding and Member cannot be combined.'
  if (code.includes('sponsor_founding') || code.includes('cannot also hold the founding tier')) {
    return 'A partner seat cannot also hold the Founding tier.'
  }
  if (code.includes('no saved region')) {
    return 'This partner has no saved region. Set the region before removing the Partner tier.'
  }
  if (code.includes('invalid_tier')) return 'Choose a listed tier.'
  if (code.includes('seat_full')) return 'No founding seats left in that region.'
  if (code.includes('founding_numbers_full')) return 'Founding numbers are full.'
  if (code.includes('no_region')) return 'Founding needs a Saudi Arabia or International seat.'
  if (code.includes('sponsor_cap')) return 'Partner seats are full (3).'
  return 'Could not save membership tiers.'
}

export const TIER_SAVE_OK = 'Membership tiers saved.'

export const FOUNDING_REGION_CAP = 50

/** Active non-demo founding rows in one region. The person being edited is excluded. */
export function foundingRegionTaken(input: {
  rows: readonly { user_id?: string; seat: string; status?: string; is_demo?: boolean; tiers?: readonly string[] | null; tier?: string | null }[]
  seat: string
  exceptUserId?: string
}): number {
  return input.rows.filter((row) => {
    if (row.seat !== input.seat) return false
    if (row.status && row.status !== 'invited' && row.status !== 'active') return false
    if (row.is_demo) return false
    if (input.exceptUserId && row.user_id === input.exceptUserId) return false
    const tiers = row.tiers && row.tiers.length > 0 ? row.tiers : row.tier ? [row.tier] : []
    return tiers.includes('founding')
  }).length
}

export function foundingSeatAvailable(taken: number): boolean {
  return Number.isInteger(taken) && taken >= 0 && taken < FOUNDING_REGION_CAP
}
