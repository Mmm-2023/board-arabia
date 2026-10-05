/** Weekly peer invite refill. Pure rules. No secrets and no database. */

export const INVITE_WEEKLY_REFILL_SECRET = 'INVITE_WEEKLY_REFILL_SECRET'
export const INVITE_WEEKLY_REFILL_HEADER = 'x-invite-weekly-refill'
export const WEEKLY_INVITE_CAP = 2

export type InviteWalletRow = {
  seat: string
  remaining: number
  granted: number
}

/**
 * Next remaining balance for one member.
 * Sponsors stay put. Flag off changes nothing. Others restore to 2 and never go above 2.
 */
export function nextWeeklyInviteRemaining(row: InviteWalletRow, releaseFlagOn: boolean): number {
  if (row.seat === 'sponsor') return row.remaining
  if (row.seat !== 'ksa' && row.seat !== 'intl') return row.remaining
  if (!releaseFlagOn) return row.remaining
  const cap = Math.min(WEEKLY_INVITE_CAP, Math.max(0, Math.floor(row.granted)))
  const current = Math.floor(row.remaining)
  if (current >= cap) return current
  return cap
}

export function refillAuthorized(secret: string, header: string): boolean {
  const left = secret.trim()
  const right = header.trim()
  if (!left || !right) return false
  return safeEqual(left, right)
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}
