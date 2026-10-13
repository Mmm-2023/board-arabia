import { MEMBERSHIP_TIER_IDS, type MembershipTierId } from './membershipTiers.ts'

/**
 * Audience labels for one digest issue.
 * The ids are the membership catalog. The words are the picker labels.
 * member is the non-founding tier. The catalog calls it Member. This picker says Basic.
 */
export const DIGEST_AUDIENCE_LABELS: Record<MembershipTierId, string> = {
  member: 'Basic',
  founding: 'Founding member',
  sponsor: 'Partner',
}

export const DIGEST_AUDIENCE_OPTIONS: readonly MembershipTierId[] = MEMBERSHIP_TIER_IDS

export function digestAudienceLabel(id: string): string {
  if (id === 'member' || id === 'founding' || id === 'sponsor') return DIGEST_AUDIENCE_LABELS[id]
  return ''
}
