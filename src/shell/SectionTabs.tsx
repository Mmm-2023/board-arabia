import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { SectionLink } from './destinations'
import { nextSectionTabIndex } from './sectionTabKeys'

export function SectionTabs({
  label,
  sections,
}: {
  label: string
  sections: readonly SectionLink[]
}) {
  if (sections.length < 2) return null
  return <SectionTabBar label={label} sections={sections} />
}

function SectionTabBar({
  label,
  sections,
}: {
  label: string
  sections: readonly SectionLink[]
}) {
  const location = useLocation()
  const scroller = useRef<HTMLElement>(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const measure = () => {
      const overflows = root.scrollWidth > root.clientWidth + 1
      setOverflow(overflows)
      const active = root.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active) return
      const fade = overflows ? 32 : 0
      const left = active.offsetLeft
      const right = left + active.offsetWidth
      const viewLeft = root.scrollLeft
      const viewRight = viewLeft + root.clientWidth - fade
      if (left < viewLeft) root.scrollLeft = Math.max(0, left - 8)
      else if (right > viewRight) root.scrollLeft = right - root.clientWidth + fade
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [location.pathname, sections])

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a[href]')]
    const index = links.findIndex((link) => link === document.activeElement)
    if (index < 0) return
    const next = nextSectionTabIndex(event.key, index, links.length)
    if (next == null) return
    event.preventDefault()
    links[next]?.focus()
  }

  return (
    <div className="section-tabs relative max-w-full md:me-8" data-section-tabs="">
      <nav
        ref={scroller}
        aria-label={label}
        className="flex w-max max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--ba-lavender-mist)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={onKeyDown}
      >
        {sections.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `section-tab inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[0.875rem] font-semibold whitespace-nowrap ${
                isActive ? 'bg-[var(--ba-indigo)] text-white' : 'text-[var(--ba-ink)] hover:bg-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      {overflow ? (
        <div aria-hidden="true" className="section-tabs-fade pointer-events-none absolute inset-y-0 end-0 w-8" />
      ) : null}
    </div>
  )
}
