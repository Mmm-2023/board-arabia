import { Outlet } from 'react-router-dom'
import { MEMBER_SECTIONS } from '../../shell/destinations'
import { SectionTabs } from '../../shell/SectionTabs'

export function AiToolsLayout() {
  return (
    <div>
      <SectionTabs label="AI tools sections" sections={MEMBER_SECTIONS.ai ?? []} />
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}
