/** Where a Supabase recovery email may land. Both routes show the same form. */
export const RECOVERY_ROUTES = ['/auth/confirm', '/auth/reset'] as const

export type RecoveryLocation = {
  recovery: boolean
  onRecoveryRoute: boolean
  redirectTo: string | null
  tokenHash: string
  type: string
  accessToken: string
  refreshToken: string
  errorDescription: string
}

/** Read recovery markers from the query string and the URL hash. */
export function readRecoveryLocation(href: string): RecoveryLocation {
  const url = new URL(href, 'https://boardarabia.com')
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const type = (url.searchParams.get('type') || hash.get('type') || '').toLowerCase()
  const tokenHash = url.searchParams.get('token_hash') || hash.get('token_hash') || ''
  const accessToken = hash.get('access_token') || hash.get('ACCESS_TOKEN') || ''
  const refreshToken = hash.get('refresh_token') || hash.get('REFRESH_TOKEN') || ''
  const errorDescription =
    url.searchParams.get('error_description') || hash.get('error_description') || ''
  const path = url.pathname.replace(/\/$/, '') || '/'
  const onRecoveryRoute = RECOVERY_ROUTES.some((route) => path === route)
  const recovery = type === 'recovery'
  const redirectTo =
    recovery && !onRecoveryRoute ? `/auth/confirm${url.search}${url.hash}` : null
  return {
    recovery,
    onRecoveryRoute,
    redirectTo,
    tokenHash,
    type,
    accessToken,
    refreshToken,
    errorDescription,
  }
}
