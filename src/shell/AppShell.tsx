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
}: {
  tone: ShellTone
  destinations: readonly Destination[]
  secondary: readonly SecondaryLink[]
  updatedLabel: string | null
  roleSwitch: RoleSwitch | null
  onSignOut: () => void
  accountLabel: string
  children: ReactNode
}) {
  const location = useLocation()
  const desktop = useMinWidth(1024)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [morePath, setMorePath] = useState(location.pathname)
  const [moreOpen, setMoreOpen] = useState(false)
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
          className={`shell-safe-y shell-safe-left sticky top-0 hidden h-dvh shrink-0 flex-col border-r md:flex ${styles.border} ${styles.page} ${
            showLabels ? 'w-64' : 'w-[4.75rem]'
          } transition-[width] duration-200 motion-reduce:transition-none`}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-4">
            <Link to={home} className="min-w-0 px-1">
              <p className="font-display text-[1.02rem] font-bold tracking-[-0.02em]">
                {showLabels ? 'Board Arabia' : 'BA'}
              </p>
              {showLabels && (
                <p className={`mt-1 text-[0.68rem] font-semibold tracking-[0.14em] uppercase ${styles.muted}`}>
                  {tone === 'staff' ? 'Staff' : 'Member'}
                </p>
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
                        isActive ? styles.navActive : styles.navIdle
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
                          isActive ? styles.navActive : styles.navIdle
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
              <p className={`truncate px-3 text-[0.82rem] ${styles.muted}`}>{accountLabel}</p>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className={`shell-safe-top shell-safe-x sticky top-0 z-30 border-b backdrop-blur ${styles.header}`}>
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 md:px-6">
              <p className="min-w-0 font-display text-[1.15rem] font-semibold tracking-[-0.02em]">
                {title}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {secondary.length > 0 && (
                  <button
                    type="button"
                    className={`inline-flex min-h-11 items-center px-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase md:hidden ${styles.switch}`}
                    aria-expanded={moreOpen}
                    aria-controls="shell-more"
                    onClick={() => setMoreOpen((value) => !value)}
                  >
                    More
                  </button>
                )}
                {updatedLabel && (
                  <p className={`px-1 text-[0.75rem] ${styles.muted}`}>{updatedLabel}</p>
                )}
                {roleSwitch && (
                  <Link
                    to={roleSwitch.to}
                    className={`inline-flex min-h-11 items-center px-2 text-[0.75rem] font-semibold tracking-[0.06em] uppercase ${styles.switch}`}
                  >
                    {roleSwitch.label}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  className={`inline-flex min-h-11 items-center px-2 text-[0.75rem] font-semibold tracking-[0.06em] uppercase ${styles.signOut}`}
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>
          <main className="shell-main shell-safe-x px-4 md:px-8">{children}</main>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className={`shell-safe-bottom shell-safe-x fixed inset-x-0 bottom-0 z-40 border-t md:hidden ${styles.header}`}
      >
        <ul className="grid grid-cols-5">
          {destinations.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                data-nav="primary"
                data-destination={item.label}
                className={({ isActive }) =>
                  `flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-[0.68rem] leading-tight ${
                    isActive ? styles.navActive : styles.navIdle
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
            className={`shell-safe-bottom absolute inset-x-0 bottom-0 border-t px-4 pt-4 pb-4 ${styles.border} ${styles.page}`}
          >
            <ul className="space-y-1">
              {secondary.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    data-nav="secondary"
                    className={({ isActive }) =>
                      `flex min-h-11 items-center px-3 text-[1rem] ${
                        isActive ? styles.navActive : styles.navIdle
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            {accountLabel && (
              <p className={`mt-3 px-3 text-[0.85rem] ${styles.muted}`}>{accountLabel}</p>
            )}
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
  header: 'border-ink/10 bg-pearl/95',
  muted: 'text-ink/45',
  navIdle: 'text-ink/70 hover:bg-ink/5 hover:text-ink',
  navActive: 'bg-ink text-pearl',
  border: 'border-ink/10',
  signOut: 'text-ink/55 hover:text-ink',
  switch: 'text-brass hover:text-ink',
}

const staffTheme = {
  page: 'bg-ink text-pearl',
  header: 'border-pearl/10 bg-ink/95',
  muted: 'text-pearl/45',
  navIdle: 'text-pearl/70 hover:bg-pearl/10 hover:text-pearl',
  navActive: 'bg-pearl text-ink',
  border: 'border-pearl/10',
  signOut: 'text-pearl/60 hover:text-pearl',
  switch: 'text-brass-bright hover:text-pearl',
}
