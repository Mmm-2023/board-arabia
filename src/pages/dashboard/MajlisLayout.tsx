import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { MEMBER_SECTIONS } from '../../shell/destinations'
import { SectionTabs } from '../../shell/SectionTabs'
import { majlisCalendarOn, majlisCalendarParams } from './majlisCalendarQuery'
import { MajlisViewSwitch } from './MajlisViewSwitch'

export function MajlisLayout() {
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const past = pathname.replace(/\/+$/, '').endsWith('/past')
  const calendar = majlisCalendarOn(params)
  return (
    <div className="min-w-0 max-w-full">
      <div className="flex max-w-full flex-nowrap items-center justify-between gap-2" data-majlis-nav="">
        <SectionTabs label="Majlis sections" sections={MEMBER_SECTIONS.majlis ?? []} />
        {past ? null : (
          <MajlisViewSwitch
            calendar={calendar}
            onChange={(next) => {
              setParams(majlisCalendarParams(params, next), { replace: true })
            }}
          />
        )}
      </div>
      <div className="mt-6 min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
