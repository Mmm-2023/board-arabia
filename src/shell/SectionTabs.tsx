import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { SectionLink } from './destinations'
import { nextSectionTabIndex } from './sectionTabKeys'

export function SectionTabs({
  label,
  sections,
  fit,
}: {
  label: string
  sections: readonly SectionLink[]
  /** Deals only. One row when the labels fit, otherwise a two by two grid. */
  fit?: 'auto'
}) {
  if (sections.length < 2) return null
  return <SectionTabBar label={label} sections={sections} fit={fit} />
}

function SectionTabBar({
  label,
  sections,
  fit,
}: {
  label: string
  sections: readonly SectionLink[]
  fit?: 'auto'
}) {
  const location = useLocation()
  const scroller = useRef<HTMLElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [pack, setPack] = useState<'row' | 'grid'>('row')
  const grid = fit === 'auto' && pack === 'grid'

  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const measure = () => {
      if (fit === 'auto') {
        const available = root.parentElement?.clientWidth ?? root.clientWidth
        const probe = root.cloneNode(true) as HTMLElement
        probe.style.position = 'absolute'
        probe.style.visibility = 'hidden'
        probe.style.pointerEvents = 'none'
        probe.style.display = 'flex'
        probe.style.flexWrap = 'nowrap'
        probe.style.width = 'max-content'
        probe.style.maxWidth = 'none'
        document.body.appendChild(probe)
        const needs = probe.scrollWidth
        probe.remove()
        const next = needs > available + 1 ? 'grid' : 'row'
        setPack((current) => (current === next ? current : next))
      }
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
    void document.fonts?.ready.then(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    if (root.parentElement) observer.observe(root.parentElement)
    return () => observer.disconnect()
  }, [location.pathname, sections, fit])

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
    <div
      className={`section-tabs relative max-w-full md:me-8 ${fit === 'auto' ? 'overflow-x-clip md:overflow-visible' : ''}`}
      data-section-tabs=""
      data-deals-tabs={fit === 'auto' ? '' : undefined}
      data-tab-pack={fit === 'auto' ? pack : undefined}
    >
      <nav
        ref={scroller}
        aria-label={label}
        className={
          grid
            ? 'grid w-full grid-cols-2 gap-x-1 gap-y-2 rounded-3xl bg-[var(--ba-lavender-mist)] p-1'
            : `flex w-fit min-w-0 max-w-full gap-x-1 gap-y-2 rounded-3xl bg-[var(--ba-lavender-mist)] p-1 ${
                fit === 'auto' ? 'flex-nowrap' : 'flex-wrap'
              }`
        }
        onKeyDown={onKeyDown}
      >
        {sections.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `section-tab inline-flex min-h-11 min-w-11 shrink-0 items-center rounded-full px-3 text-[1rem] font-semibold whitespace-nowrap ${
                grid ? 'justify-center' : ''
              } ${isActive ? 'bg-[var(--ba-indigo)] text-white' : 'text-[var(--ba-ink)] hover:bg-white'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      {overflow && !grid ? (
        <div aria-hidden="true" className="section-tabs-fade pointer-events-none absolute inset-y-0 end-0 w-8" />
      ) : null}
    </div>
  )
}
