import { Outlet } from 'react-router-dom'
import { STAFF_SECTIONS } from '../../shell/destinations'
import { SectionTabs } from '../../shell/SectionTabs'

export function AdminMajlisLayout() {
  return (
    <div>
      <SectionTabs label="Majlis sections" sections={STAFF_SECTIONS.majlis ?? []} />
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}
