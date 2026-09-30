import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BrandLockup } from './BrandLockup'
import { MEMBER_LOGIN, NAV_LINKS } from '../content/marketing'
import { trackApplyClick, trackLoginClick } from '../lib/tracking/browser'

export function Nav({
  ctaTo = '/apply',
  ctaLabel = 'Apply for consideration',
  onMenuChange,
}: {
  ctaTo?: string
  ctaLabel?: string
  onMenuChange?: (open: boolean) => void
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

  useEffect(() => {
    onMenuChange?.(open)
  }, [open, onMenuChange])

  const darkNav = !isHome || scrolled || open
  const linkClass = darkNav ? 'ba-nav-link is-light' : 'ba-nav-link is-dark'

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 ${darkNav ? 'ba-header-solid' : 'ba-header-clear ba-on-dark'}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 md:h-20 md:px-10">
        <BrandLockup to="/" tone={darkNav ? 'on-light' : 'on-dark'} subline={false} />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((item) => {
            const active = location.pathname === item.to
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`${linkClass}${active ? ' is-active' : ''}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to={MEMBER_LOGIN}
            className={darkNav ? 'ba-login is-light' : 'ba-login is-dark'}
            onClick={() => trackLoginClick('header')}
          >
            Log in
          </Link>
          <Link
            to={ctaTo}
            className="ba-primary ba-header-apply"
            onClick={() => {
              if (ctaTo === '/apply') trackApplyClick('header', ctaLabel)
            }}
          >
            {ctaLabel}
          </Link>
          <button
            type="button"
            className={`ba-menu ${darkNav ? 'is-light' : 'is-dark'}`}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpenPath(open ? null : location.pathname)}
          >
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
            <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
              {open ? (
                <path d="M2 2 L18 12 M18 2 L2 12" stroke="currentColor" strokeWidth="1.4" fill="none" />
              ) : (
                <path d="M0 1.2 H20 M0 7 H20 M0 12.8 H20" stroke="currentColor" strokeWidth="1.4" fill="none" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-ink/8 bg-pearl lg:hidden">
          <ul className="mx-auto flex max-w-7xl flex-col px-5 py-2 md:px-10">
            {NAV_LINKS.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="ba-menu-link">
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <Link
                to={ctaTo}
                className="ba-primary ba-menu-apply"
                onClick={() => {
                  if (ctaTo === '/apply') trackApplyClick('menu', ctaLabel)
                }}
              >
                {ctaLabel}
              </Link>
            </li>
            <li className="pt-2 pb-3">
              <Link
                to={MEMBER_LOGIN}
                className="ba-secondary ba-menu-login"
                onClick={() => trackLoginClick('menu')}
              >
                Log in
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}
