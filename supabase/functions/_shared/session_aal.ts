/** Assurance level from a token Auth has already accepted.
 * Call this only after getUser (or the same local checks that accepted the token).
 * The claim is not a secret. Do not log the token.
 */

export const MFA_REQUIRED = 'mfa_required'

export function aalFromVerifiedToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length < 2 || parts[1].length === 0) return null
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const payload = JSON.parse(json) as { aal?: unknown }
    return typeof payload.aal === 'string' && payload.aal.length > 0 ? payload.aal : null
  } catch {
    return null
  }
}

export function isAal2(aal: string | null | undefined): boolean {
  return aal === 'aal2'
}
