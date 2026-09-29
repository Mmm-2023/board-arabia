import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { MEMBER_SECTIONS, lastDealsSection, rememberDealsSection } from '../../shell/destinations'
import { SectionTabs } from '../../shell/SectionTabs'

export function DealsLayout() {
  const location = useLocation()
  useEffect(() => {
    rememberDealsSection(location.pathname)
  }, [location.pathname])
  return (
    <div>
      <SectionTabs label="Deals sections" sections={MEMBER_SECTIONS.deals ?? []} />
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}

export function DealsIndexRedirect() {
  const location = useLocation()
  return (
    <Navigate
      to={{ pathname: lastDealsSection(), search: location.search, hash: location.hash }}
      replace
    />
  )
}
