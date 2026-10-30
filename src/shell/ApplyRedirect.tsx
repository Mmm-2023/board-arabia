import { Navigate, useLocation } from 'react-router-dom'
import { applyRedirectTarget } from './applyRedirectTarget'

/** /register, /apply/verify, /book, and /verify land on Apply. */
export function ApplyRedirect() {
  const location = useLocation()
  return <Navigate to={applyRedirectTarget(location)} replace />
}
