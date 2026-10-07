/**
 * Old member paths to their new homes. Search and hash are kept by RedirectKeep.
 * A path with no mapping returns null so the shell can show page not found.
 */

const STATIC: Record<string, string> = {
  '/dashboard/mandates': '/dashboard/deals/mandates',
  '/dashboard/real-estate': '/dashboard/deals/real-estate',
  '/dashboard/rooms': '/dashboard/deals/rooms',
  '/dashboard/rooms/new': '/dashboard/deals/rooms/new',
  '/dashboard/directory': '/dashboard/people/directory',
  '/dashboard/network': '/dashboard/people/invites',
  '/dashboard/invites': '/dashboard/people/invites',
  '/dashboard/intros': '/dashboard/people/intros',
  '/dashboard/due-diligence': '/dashboard/ai/due-diligence',
  '/dashboard/events': '/dashboard/majlis',
  '/dashboard/sponsorship': '/dashboard/partnership',
}

export function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '')
  return pathname
}

/** Pathname only. Caller copies search and hash. Unknown paths return null. */
export function resolveRedirect(pathname: string): string | null {
  const path = normalizePath(pathname)
  if (!path.startsWith('/dashboard')) return null
  const mapped = STATIC[path]
  if (mapped) return mapped
  const room = /^\/dashboard\/rooms\/([^/]+)$/.exec(path)
  if (room && room[1] !== 'new') return `/dashboard/deals/rooms/${room[1]}`
  const report = /^\/dashboard\/due-diligence\/([^/]+)$/.exec(path)
  if (report) return `/dashboard/ai/due-diligence/${report[1]}`
  return null
}

export function redirectLocation(location: { pathname: string; search: string; hash: string }) {
  const pathname = resolveRedirect(location.pathname)
  if (!pathname) return null
  return { pathname, search: location.search, hash: location.hash }
}
