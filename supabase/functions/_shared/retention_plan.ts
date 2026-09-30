const DAY_MS = 86_400_000

export type RetentionClass = 'keep' | 'delete_unverified' | 'delete_never_submitted' | 'delete_decided' | 'remind'

export type CandidateRetentionInput = {
  requestState: string
  createdAt: string
  emailVerifiedAt: string | null
  decidedAt: string | null
  remindedAt: string | null
  isMember: boolean
  isStaff: boolean
}

function monthsBefore(now: Date, months: number) {
  const copy = new Date(now.getTime())
  copy.setUTCMonth(copy.getUTCMonth() - months)
  return copy.getTime()
}

/**
 * Mirrors retention_sweep_plan. A member or staff login is never deleted here.
 * Unverified sign-ups go at 7 days. Confirmed accounts that never submit go at
 * 120 days, with one reminder once they pass 90 days. Declined and closed
 * requests go 12 months after the decision. A 119 day confirmed account stays.
 */
export function classifyCandidate(input: CandidateRetentionInput, now: Date): RetentionClass {
  if (input.isMember || input.isStaff) return 'keep'
  const created = Date.parse(input.createdAt)
  if (!Number.isFinite(created)) return 'keep'
  const age = now.getTime() - created
  if (input.requestState === 'open' && !input.emailVerifiedAt && age >= 7 * DAY_MS) return 'delete_unverified'
  if (input.requestState === 'open' && input.emailVerifiedAt && age >= 120 * DAY_MS) return 'delete_never_submitted'
  if (input.requestState === 'declined' || input.requestState === 'closed') {
    const decided = input.decidedAt ? Date.parse(input.decidedAt) : Number.NaN
    if (Number.isFinite(decided) && decided <= monthsBefore(now, 12)) return 'delete_decided'
    return 'keep'
  }
  if (
    input.requestState === 'open' &&
    input.emailVerifiedAt &&
    !input.remindedAt &&
    age >= 90 * DAY_MS &&
    age < 120 * DAY_MS
  ) {
    return 'remind'
  }
  return 'keep'
}

export function applicationExpired(status: string, decisionAt: string | null, now: Date, hasMember: boolean) {
  if (hasMember) return false
  if (status !== 'rejected' && status !== 'declined') return false
  const decided = decisionAt ? Date.parse(decisionAt) : Number.NaN
  return Number.isFinite(decided) && decided <= monthsBefore(now, 12)
}

export function memberAnonymiseDue(leftAt: string | null, legalHold: boolean, anonymisedAt: string | null, now: Date) {
  if (legalHold || anonymisedAt || !leftAt) return false
  const left = Date.parse(leftAt)
  return Number.isFinite(left) && left <= monthsBefore(now, 24)
}

export function consentExpired(createdAt: string, now: Date) {
  const created = Date.parse(createdAt)
  return Number.isFinite(created) && created <= monthsBefore(now, 13)
}
