import { Outlet } from 'react-router-dom'
import { SectionTabs } from '../../shell/SectionTabs'
import { peopleSections } from './peopleSections'

export function AdminPeopleLayout() {
  return (
    <div>
      <SectionTabs label="People sections" sections={peopleSections()} />
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}
