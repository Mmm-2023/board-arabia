import { Navigate, useLocation } from 'react-router-dom'
import { redirectLocation } from './redirects'

/** React Router Navigate does not fill :params. This keeps params, search, and hash. */
export function RedirectKeep() {
  const location = useLocation()
  const next = redirectLocation(location)
  return <Navigate to={next ?? { pathname: '/dashboard', search: location.search, hash: location.hash }} replace />
}
