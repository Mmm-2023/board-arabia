/** Seat allowlists for founding admission vs sponsor invite.
 * Founding capacity stays ksa|intl. Sponsor is a members seat with its own cap.
 */

export const FOUNDING_SEATS = ['ksa', 'intl'] as const
export const MEMBER_SEATS = ['ksa', 'intl', 'sponsor'] as const
/** Invited or active non-demo members for whom private.is_sponsor is true. One member counts once. */
export const SPONSOR_CAP = 3

export type FoundingSeatName = (typeof FOUNDING_SEATS)[number]
export type MemberSeatName = (typeof MEMBER_SEATS)[number]

export function isFoundingSeat(seat: unknown): seat is FoundingSeatName {
  return seat === 'ksa' || seat === 'intl'
}

export function isMemberSeat(seat: unknown): seat is MemberSeatName {
  return seat === 'ksa' || seat === 'intl' || seat === 'sponsor'
}

/** Fail closed unless that once-per-member count is under the cap. */
export function sponsorSeatAllowed(taken: number): boolean {
  return Number.isInteger(taken) && taken >= 0 && taken < SPONSOR_CAP
}
