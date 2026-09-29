import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { MEMBER_SECTIONS } from '../../shell/destinations'
import { SectionTabs } from '../../shell/SectionTabs'

export function PeopleLayout() {
  return (
    <div>
      <SectionTabs label="People sections" sections={MEMBER_SECTIONS.people ?? []} />
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}

export function PeopleIndexRedirect() {
  const location = useLocation()
  return (
    <Navigate
      to={{ pathname: '/dashboard/people/directory', search: location.search, hash: location.hash }}
      replace
    />
  )
}
