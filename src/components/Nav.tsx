import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BrandLockup } from './BrandLockup'
import { MEMBER_LOGIN, NAV_LINKS } from '../content/marketing'

export function Nav({
  ctaTo = '/apply',
  ctaLabel = 'Apply for consideration',
}: {
  ctaTo?: string
  ctaLabel?: string
}) {
  const [scrolled, setScrolled] = useState(false)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const location = useLocation()
  const isHome = location.pathname === '/' || location.pathname === ''
  const open = openPath === location.pathname

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPath(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const darkNav = !isHome || scrolled || open
  const linkClass = darkNav
    ? 'text-ink/60 hover:text-ink'
    : 'text-pearl/70 hover:text-pearl'

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        darkNav
          ? 'border-b border-ink/8 bg-pearl/90 backdrop-blur-md'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 md:h-20 md:px-10">
        <BrandLockup to="/" tone={darkNav ? 'on-light' : 'on-dark'} />

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((item) => {
            const active = location.pathname === item.to
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`text-[0.78rem] font-medium tracking-[0.06em] uppercase transition-colors ${
                  active ? (darkNav ? 'text-ink' : 'text-pearl') : linkClass
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            to={MEMBER_LOGIN}
            className={`text-[0.72rem] font-semibold tracking-[0.06em] uppercase transition-colors sm:text-[0.78rem] ${
              darkNav ? 'text-ink hover:text-ink/70' : 'text-pearl hover:text-pearl/80'
            }`}
          >
            Log in
          </Link>
          <Link
            to={ctaTo}
            className={`hidden text-[0.72rem] font-semibold tracking-[0.04em] uppercase transition-all sm:inline sm:text-[0.78rem] ${
              darkNav
                ? 'border-b border-brass pb-0.5 text-ink'
                : 'border-b border-pearl/45 pb-0.5 text-pearl hover:border-pearl'
            }`}
          >
            {ctaLabel}
          </Link>
          <button
            type="button"
            className={`inline-flex h-10 w-10 items-center justify-center lg:hidden ${
              darkNav ? 'text-ink' : 'text-pearl'
            }`}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpenPath(open ? null : location.pathname)}
          >
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
            <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden>
              {open ? (
                <path
                  d="M2 2 L18 12 M18 2 L2 12"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                />
              ) : (
                <path
                  d="M0 1.2 H20 M0 7 H20 M0 12.8 H20"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-ink/8 bg-pearl lg:hidden"
        >
          <ul className="mx-auto flex max-w-7xl flex-col px-5 py-4 md:px-10">
            {NAV_LINKS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="block py-3 font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                to="/about"
                className="block py-3 font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink"
              >
                About
              </Link>
            </li>
            <li>
              <Link
                to={MEMBER_LOGIN}
                className="block py-3 font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-ink"
              >
                Log in
              </Link>
            </li>
            <li className="pt-2">
              <Link
                to={ctaTo}
                className="ba-primary inline-flex px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase"
              >
                {ctaLabel}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}
