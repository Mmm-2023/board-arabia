/**
 * English only. Drops /ar prefixes and ?lang=ar so a stale link
 * opens the same English page.
 */
export function englishPath(pathname: string, search: string): { pathname: string; search: string } | null {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  const dropLang = params.get('lang') === 'ar'
  const prefixed = pathname === '/ar' || pathname.startsWith('/ar/')
  if (!dropLang && !prefixed) return null
  if (dropLang) params.delete('lang')
  const nextPath = prefixed ? pathname.replace(/^\/ar(?=\/|$)/, '') || '/' : pathname
  return { pathname: nextPath, search: params.toString() }
}
