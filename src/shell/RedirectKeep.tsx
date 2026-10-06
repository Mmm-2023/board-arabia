import { Navigate, useLocation } from 'react-router-dom'
import { redirectLocation } from './redirects'
import { ShellNotFound } from './ShellNotFound'

/** Legacy member paths keep params, search, and hash. Anything else is page not found. */
export function RedirectKeep() {
  const location = useLocation()
  const next = redirectLocation(location)
  if (!next) return <ShellNotFound homeTo="/dashboard" />
  return <Navigate to={next} replace />
}
