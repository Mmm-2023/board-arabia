import { NavLink } from 'react-router-dom'
import type { SectionLink } from './destinations'

export function SectionTabs({
  label,
  sections,
}: {
  label: string
  sections: readonly SectionLink[]
}) {
  if (sections.length < 2) return null
  return (
    <div className="relative -mx-1">
      <nav
        aria-label={label}
        className="flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-[0.8125rem] whitespace-nowrap ${
                isActive
                  ? 'border-[var(--ba-indigo)] font-semibold text-[var(--ba-ink)]'
                  : 'border-transparent text-[var(--ba-muted)]'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-pearl to-transparent"
      />
    </div>
  )
}
