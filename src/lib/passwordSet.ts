/**
 * members.must_set_password starts true and was cleared only by the profile
 * password form. A password sign-in leaves the column true, so Home and
 * Profile keep asking. A session whose AMR includes password already proved
 * the password exists.
 */

export function amrIncludesPassword(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false
  return amr.some((entry) => {
    if (typeof entry === 'string') return entry === 'password'
    if (!entry || typeof entry !== 'object') return false
    return (entry as { method?: unknown }).method === 'password'
  })
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/** True when this session authenticated with a password. Invite and magic-link sessions stay false. */
export function sessionHasPassword(accessToken: string | null | undefined, amr?: unknown): boolean {
  if (amrIncludesPassword(amr)) return true
  if (!accessToken) return false
  return amrIncludesPassword(decodeJwtPayload(accessToken)?.amr)
}

/** Column true means "still needs a password". A password session overrides that. */
export function stillMustSetPassword(
  column: boolean,
  accessToken: string | null | undefined,
  amr?: unknown,
): boolean {
  if (!column) return false
  return !sessionHasPassword(accessToken, amr)
}
