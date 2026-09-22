import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

export function Nav({
  ctaTo = '/apply',
  ctaLabel = 'Apply for review',
}: {
  ctaTo?: string
  ctaLabel?: string
}) {
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/' || location.pathname === ''

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const darkNav = !isHome || scrolled
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
        <Link
          to="/"
          className={`font-display shrink-0 text-[1.05rem] font-bold tracking-[-0.02em] transition-colors ${
            darkNav ? 'text-ink' : 'text-pearl'
          }`}
        >
          Board Arabia
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {isHome &&
            [
              ['About', '#about'],
              ['Process', '#process'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className={`text-[0.78rem] font-medium tracking-[0.06em] uppercase transition-colors ${linkClass}`}
              >
                {label}
              </a>
            ))}
        </nav>
        <Link
          to={ctaTo}
          className={`text-[0.72rem] font-semibold tracking-[0.04em] uppercase transition-all sm:text-[0.78rem] ${
            darkNav
              ? 'border-b border-brass pb-0.5 text-ink'
              : 'border-b border-pearl/45 pb-0.5 text-pearl hover:border-pearl'
          }`}
        >
          {ctaLabel}
        </Link>
      </div>
    </header>
  )
}
