import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import type { Destination, SecondaryLink, ShellTone } from './destinations'
import { shellSectionTitle } from './destinations'
import { DestinationIcon } from './icons'

type RoleSwitch = { label: string; to: string }

export function AppShell({
  tone,
  destinations,
  secondary,
  updatedLabel,
  roleSwitch,
  onSignOut,
  accountLabel,
  children,
  initialMoreOpen = false,
}: {
  tone: ShellTone
  destinations: readonly Destination[]
  secondary: readonly SecondaryLink[]
  updatedLabel: string | null
  roleSwitch: RoleSwitch | null
  onSignOut: () => void
  accountLabel: string
  children: ReactNode
  initialMoreOpen?: boolean
}) {
  const location = useLocation()
  const desktop = useMinWidth(1024)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [morePath, setMorePath] = useState(location.pathname)
  const [moreOpen, setMoreOpen] = useState(initialMoreOpen)
  if (location.pathname !== morePath) {
    setMorePath(location.pathname)
    setMoreOpen(false)
  }
  const showLabels = desktop || hovered || pinned
  const title = shellSectionTitle(location.pathname, destinations, secondary)
  const styles = tone === 'staff' ? staffTheme : memberTheme
  const home = destinations[0]?.to ?? '/'

  useEffect(() => {
    if (!moreOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  return (
    <div className={`min-h-dvh ${styles.page}`}>
      <div className="flex min-h-dvh">
        <aside
          aria-label="Primary"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`shell-safe-y shell-safe-left sticky top-0 hidden h-dvh shrink-0 flex-col border-r md:flex ${styles.sidebarBorder} ${styles.sidebar} ${
            showLabels ? 'w-64' : 'w-[4.75rem]'
          } transition-[width] duration-200 motion-reduce:transition-none`}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-4">
            <Link to={home} aria-label="Board Arabia" className="flex min-w-0 items-center gap-2 px-1">
              <img
                src={`${import.meta.env.BASE_URL}favicon.svg`}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0"
              />
              {showLabels && (
                <span className="min-w-0">
                  <p className="truncate font-display text-[1.02rem] font-bold tracking-[-0.02em]">
                    Board Arabia
                  </p>
                  <p className="mt-1 text-[0.68rem] font-semibold tracking-[0.14em] text-[var(--ba-lavender-mist)] uppercase">
                    {tone === 'staff' ? 'Staff' : 'Member'}
                  </p>
                </span>
              )}
            </Link>
            <button
              type="button"
              className={`inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden ${styles.muted}`}
              aria-expanded={pinned || hovered}
              aria-label={pinned ? 'Collapse navigation' : 'Expand navigation'}
              onClick={() => setPinned((value) => !value)}
            >
              <span aria-hidden="true">{pinned ? '«' : '»'}</span>
            </button>
          </div>
          <nav className="flex-1 px-2">
            <ul className="space-y-1">
              {destinations.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    data-nav="primary"
                    data-destination={item.label}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-3 px-3 text-[0.95rem] ${
                        isActive ? styles.sidebarActive : styles.sidebarIdle
                      }`
                    }
                  >
                    <DestinationIcon id={item.id} />
                    <span className={showLabels ? 'truncate' : 'sr-only'}>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className={`border-t px-3 py-4 ${styles.border}`}>
            {showLabels && secondary.length > 0 && (
              <ul className="mb-3 space-y-1">
                {secondary.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      data-nav="secondary"
                      className={({ isActive }) =>
                        `flex min-h-11 items-center px-3 text-[0.92rem] ${
                          isActive ? styles.sidebarActive : styles.sidebarIdle
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
            {accountLabel && showLabels && (
              <p className="truncate px-3 text-[0.82rem] text-[var(--ba-lavender-mist)]">{accountLabel}</p>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className={`shell-safe-top shell-safe-x sticky top-0 z-30 border-b backdrop-blur ${styles.header}`}>
            <div className="flex min-h-14 items-center justify-between gap-3 px-2 py-1 md:px-6 md:py-2">
              <Link
                to={home}
                aria-label="Board Arabia"
                className="flex min-w-0 items-center gap-2 px-2 py-1 md:hidden"
              >
                <img
                  src={`${import.meta.env.BASE_URL}favicon.svg`}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0"
                />
                <span className="truncate font-display text-[0.95rem] font-bold tracking-[-0.02em]">
                  Board Arabia
                </span>
              </Link>
              <p className="hidden min-w-0 font-display text-[1.15rem] font-semibold tracking-[-0.02em] md:block">
                {title}
              </p>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-[0.95rem] font-semibold md:hidden ${styles.switch}`}
                  aria-expanded={moreOpen}
                  aria-controls="shell-more"
                  aria-label="More"
                  onClick={() => setMoreOpen((value) => !value)}
                >
                  More
                </button>
                {updatedLabel && (
                  <p className={`hidden px-1 text-[0.75rem] md:block ${styles.muted}`}>{updatedLabel}</p>
                )}
                {roleSwitch && (
                  <Link
                    to={roleSwitch.to}
                    className={`hidden min-h-11 items-center px-2 text-[0.75rem] font-semibold tracking-[0.06em] uppercase md:inline-flex ${styles.switch}`}
                  >
                    {roleSwitch.label}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  className={`hidden min-h-11 items-center px-2 text-[0.75rem] font-semibold tracking-[0.06em] uppercase md:inline-flex ${styles.signOut}`}
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>
          <main className="shell-main">{children}</main>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className={`shell-tab-bar shell-safe-bottom shell-safe-x fixed inset-x-0 bottom-0 z-40 border-t md:hidden ${styles.tabBar}`}
      >
        <ul className="grid min-h-[var(--ba-tab-bar-height,56px)] grid-cols-5">
          {destinations.map((item) => (
            <li key={item.to} className="min-w-0">
              <NavLink
                to={item.to}
                end={item.end}
                data-nav="primary"
                data-destination={item.label}
                className={({ isActive }) =>
                  `flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center text-[0.68rem] leading-tight ${
                    isActive ? styles.tabActive : styles.tabIdle
                  }`
                }
              >
                <DestinationIcon id={item.id} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close more"
            className="absolute inset-0 bg-ink/45"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="shell-more"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className={`shell-tab-bar shell-safe-bottom absolute inset-x-0 bottom-0 border-t px-4 pt-4 ${styles.border} ${styles.page}`}
          >
            <div className="px-3 pb-2">
              <p className="font-display text-[1.15rem] font-semibold tracking-[-0.02em]">More</p>
              {updatedLabel && <p className={`mt-1 text-[0.75rem] ${styles.muted}`}>{updatedLabel}</p>}
            </div>
            <ul>
              {secondary.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    data-nav="secondary"
                    className={({ isActive }) =>
                      `flex min-h-11 w-full items-center px-3 text-[1rem] ${
                        isActive ? styles.navActive : styles.navIdle
                      }`
                    }
                    onClick={() => setMoreOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              {roleSwitch && (
                <li>
                  <Link
                    to={roleSwitch.to}
                    className={`flex min-h-11 w-full items-center px-3 text-[1rem] ${styles.navIdle}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    {roleSwitch.label}
                  </Link>
                </li>
              )}
            </ul>
            <div className={`my-2 border-t ${styles.border}`} role="separator" />
            <button
              type="button"
              onClick={onSignOut}
              data-nav="sign-out"
              className={`flex min-h-11 w-full items-center px-3 text-left text-[1rem] ${styles.signOut}`}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function useMinWidth(px: number) {
  const query = `(min-width: ${px}px)`
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}

const memberTheme = {
  page: 'bg-pearl text-ink',
  header: 'border-[var(--ba-line)] bg-pearl/95',
  muted: 'text-[var(--ba-muted)]',
  navIdle: 'text-ink/70 hover:bg-[var(--ba-lavender-mist)] hover:text-ink',
  navActive: 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]',
  border: 'border-[var(--ba-line)]',
  signOut: 'text-[var(--ba-muted)] hover:text-ink',
  switch: 'text-[var(--ba-indigo)] hover:text-ink',
  sidebar: 'bg-[var(--ba-indigo-deep)] text-[var(--ba-lavender-mist)]',
  sidebarBorder: 'border-white/10',
  sidebarIdle: 'text-[var(--ba-lavender-mist)] hover:bg-white/10',
  sidebarActive: 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]',
  tabBar: 'border-[var(--ba-line)] bg-white',
  tabIdle: 'text-[var(--ba-muted)]',
  tabActive: 'text-[var(--ba-indigo)]',
}

const staffTheme = {
  page: 'bg-ink text-pearl',
  header: 'border-white/10 bg-ink/95',
  muted: 'text-pearl/55',
  navIdle: 'text-pearl/70 hover:bg-white/10 hover:text-pearl',
  navActive: 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]',
  border: 'border-white/10',
  signOut: 'text-pearl/70 hover:text-pearl',
  switch: 'text-[var(--ba-lavender)] hover:text-pearl',
  sidebar: 'bg-[var(--ba-indigo-deep)] text-[var(--ba-lavender-mist)]',
  sidebarBorder: 'border-white/10',
  sidebarIdle: 'text-[var(--ba-lavender-mist)] hover:bg-white/10',
  sidebarActive: 'bg-[var(--ba-indigo)] text-[var(--ba-porcelain)]',
  tabBar: 'border-[var(--ba-line)] bg-white',
  tabIdle: 'text-[var(--ba-muted)]',
  tabActive: 'text-[var(--ba-indigo)]',
}
