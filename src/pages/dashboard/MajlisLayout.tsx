import { Outlet } from 'react-router-dom'
import { MEMBER_SECTIONS } from '../../shell/destinations'
import { SectionTabs } from '../../shell/SectionTabs'

export function MajlisLayout() {
  return (
    <div className="min-w-0 max-w-full">
      <SectionTabs label="Majlis sections" sections={MEMBER_SECTIONS.majlis ?? []} />
      <div className="mt-6 min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
