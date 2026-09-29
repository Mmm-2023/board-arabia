/**
 * Old member paths to their new homes. Search and hash are kept by RedirectKeep.
 * Live paths return null so the catch-all does not bounce a real page.
 */

const STATIC: Record<string, string> = {
  '/dashboard/mandates': '/dashboard/deals/mandates',
  '/dashboard/real-estate': '/dashboard/deals/real-estate',
  '/dashboard/rooms': '/dashboard/deals/rooms',
  '/dashboard/rooms/new': '/dashboard/deals/rooms/new',
  '/dashboard/directory': '/dashboard/people/directory',
  '/dashboard/network': '/dashboard/people/invites',
  '/dashboard/invites': '/dashboard/people/invites',
  '/dashboard/intros': '/dashboard/people/invites',
  '/dashboard/due-diligence': '/dashboard/ai/due-diligence',
  '/dashboard/events': '/dashboard/majlis',
}

const LIVE_PREFIXES = [
  '/dashboard/deals',
  '/dashboard/people',
  '/dashboard/majlis',
  '/dashboard/ai',
  '/dashboard/profile',
  '/dashboard/help',
]

export function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '')
  return pathname
}

export function isLiveMemberPath(pathname: string) {
  const path = normalizePath(pathname)
  if (path === '/dashboard') return true
  return LIVE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Pathname only. Caller copies search and hash. */
export function resolveRedirect(pathname: string): string | null {
  const path = normalizePath(pathname)
  if (!path.startsWith('/dashboard')) return null
  const mapped = STATIC[path]
  if (mapped) return mapped
  const room = /^\/dashboard\/rooms\/([^/]+)$/.exec(path)
  if (room && room[1] !== 'new') return `/dashboard/deals/rooms/${room[1]}`
  const report = /^\/dashboard\/due-diligence\/([^/]+)$/.exec(path)
  if (report) return `/dashboard/ai/due-diligence/${report[1]}`
  if (path !== '/dashboard' && !isLiveMemberPath(path)) return '/dashboard'
  return null
}

export function redirectLocation(location: { pathname: string; search: string; hash: string }) {
  const pathname = resolveRedirect(location.pathname)
  if (!pathname) return null
  return { pathname, search: location.search, hash: location.hash }
}
