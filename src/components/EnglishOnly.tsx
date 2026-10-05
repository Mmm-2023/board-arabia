import { useLocation, Navigate } from 'react-router-dom'
import { englishPath } from '../lib/englishPath'

/** Strips ?lang=ar on English routes. /ar prefixes use ArabicPrefixRedirect. */
export function EnglishOnlyQuery() {
  const location = useLocation()
  if (location.pathname === '/ar' || location.pathname.startsWith('/ar/')) return null
  const next = englishPath(location.pathname, location.search)
  if (!next) return null
  const search = next.search ? `?${next.search}` : ''
  return <Navigate to={`${next.pathname}${search}${location.hash}`} replace />
}

export function ArabicPrefixRedirect() {
  const location = useLocation()
  const next = englishPath(location.pathname, location.search)
  const pathname = next?.pathname || '/'
  const search = next?.search ? `?${next.search}` : ''
  return <Navigate to={`${pathname}${search}${location.hash}`} replace />
}
