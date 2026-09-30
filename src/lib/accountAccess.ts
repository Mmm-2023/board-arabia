/** Requests an open account may make. Member-private tables and RPCs are refused. */

const ALLOWED_PATHS = [
  '/rest/v1/candidates',
  '/rest/v1/platform_stats',
  '/rest/v1/rpc/list_landing_preview_deals',
  '/rest/v1/rpc/landing_platform_totals',
  '/functions/v1/register-candidate',
  '/functions/v1/verify-candidate',
  '/functions/v1/request-membership',
  '/functions/v1/delete-candidate-account',
  '/auth/v1/token',
  '/auth/v1/user',
  '/auth/v1/verify',
]

export function accountRequestAllowed(url: string) {
  let path = url
  try {
    path = new URL(url, 'https://boardarabia.com').pathname
  } catch {
    return false
  }
  return ALLOWED_PATHS.some((item) => path === item || path.startsWith(`${item}/`))
}
