import { sanitizeNext } from '../../supabase/functions/_shared/staff_auth.ts'

/** In-app path after sign-in, including its query and hash. */
export function safeReturnPath(raw: string | null, fallback: string): string {
  return sanitizeNext(raw, fallback)
}

export function currentReturnPath(location: { pathname: string; search: string; hash: string }): string {
  return `${location.pathname}${location.search}${location.hash}`
}

export function isStaffReturn(path: string): boolean {
  const cut = path.search(/[?#]/)
  const bare = cut === -1 ? path : path.slice(0, cut)
  return bare === '/admin' || bare.startsWith('/admin/') || bare === '/ops' || bare.startsWith('/ops/')
}

/** Member sign-in is /login. Staff sign-in is /login/staff. The next value keeps the full destination. */
export function loginHref(destination: string, staff = false): string {
  const next = safeReturnPath(destination, staff ? '/admin' : '/dashboard')
  const base = staff ? '/login/staff' : '/login'
  return `${base}?next=${encodeURIComponent(next)}`
}
