import { Navigate, useLocation } from 'react-router-dom'

/** Old /admin/intros bookmarks open People, Intros. Search and hash stay. */
export function adminIntrosTarget(location: { search: string; hash: string }) {
  return {
    pathname: '/admin/people/intros',
    search: location.search,
    hash: location.hash,
  }
}

export function AdminIntrosRedirect() {
  const location = useLocation()
  return <Navigate to={adminIntrosTarget(location)} replace />
}
