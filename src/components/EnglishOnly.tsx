import { useLocation, Navigate } from 'react-router-dom'
import { englishPath } from '../lib/englishPath'

/** Drops ?lang=ar. Pages serves /ar as a bare English stub, not a React route. */
export function EnglishOnlyQuery() {
  const location = useLocation()
  const next = englishPath(location.pathname, location.search)
  if (!next) return null
  const search = next.search ? `?${next.search}` : ''
  return <Navigate to={`${next.pathname}${search}${location.hash}`} replace />
}
