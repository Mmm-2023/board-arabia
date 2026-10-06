import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { slashlessPath } from './trailingSlash'

/** Strip a trailing slash before child routes render. The path stays on this origin. */
export function TrailingSlash() {
  const { pathname, search, hash } = useLocation()
  const next = slashlessPath(pathname)
  if (next) return <Navigate to={{ pathname: next, search, hash }} replace />
  return <Outlet />
}
