import { Outlet } from 'react-router-dom'
import { STAFF_SECTIONS } from '../../shell/destinations'
import { SectionTabs } from '../../shell/SectionTabs'

export function AdminPeopleLayout() {
  return (
    <div>
      <SectionTabs label="People sections" sections={STAFF_SECTIONS.people ?? []} />
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}
