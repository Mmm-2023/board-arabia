import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { BrandLockup } from '../components/BrandLockup'
import type { Destination, SecondaryLink, ShellTone } from './destinations'
import { dealsBadgeLabel, phoneDestinations, shellSectionTitle } from './destinations'
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
  accountName = '',
  accountMark = null,
  renderAccountMark,
  dealsBadge = 0,
  lockedDestinationIds = [],
  headerChip = null,
  children,
  initialMoreOpen = false,
  initialAccountOpen = false,
}: {
  tone: ShellTone
  destinations: readonly Destination[]
  secondary: readonly SecondaryLink[]
  updatedLabel: string | null
  roleSwitch: RoleSwitch | null
  onSignOut: () => void
  accountLabel: string
  accountName?: string
  accountMark?: ReactNode
  /** Fresh mark for each chrome slot, so the sheet can show the same photo as the header. */
  renderAccountMark?: (size: number) => ReactNode
  dealsBadge?: number
  /** Hubs that stay visible and show a lock. Home is never in this list. */
  lockedDestinationIds?: readonly string[]
  headerChip?: string | null
  children: ReactNode
  initialMoreOpen?: boolean
  initialAccountOpen?: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const desktop = useMinWidth(1024)
  const member = tone === 'member'
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [morePath, setMorePath] = useState(location.pathname)
  const [moreOpen, setMoreOpen] = useState(initialMoreOpen)
  const [accountOpen, setAccountOpen] = useState(initialAccountOpen)
  const accountButton = useRef<HTMLButtonElement>(null)
  const accountPanel = useRef<HTMLDivElement>(null)
  const accountTitleId = useId()
  if (location.pathname !== morePath) {
    setMorePath(location.pathname)
    setMoreOpen(false)
    setAccountOpen(false)
  }
  const showLabels = member || desktop || hovered || pinned
  const title = shellSectionTitle(location.pathname, destinations, secondary)
  const styles = tone === 'staff' ? staffTheme : memberTheme
  const home = destinations[0]?.to ?? '/'
  const phone = phoneDestinations(destinations)
  const tabItems = member ? destinations : phone.tabs
  const secondaryActive = secondary.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  )
  const moreDestinationActive = phone.more.some(
    (item) => (item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)),
  )
  const accountRoute =
    location.pathname === '/dashboard/profile' ||
    location.pathname.startsWith('/dashboard/profile/') ||
    location.pathname === '/dashboard/help' ||
    location.pathname.startsWith('/dashboard/help/') ||
    location.pathname === '/dashboard/sponsorship' ||
    location.pathname.startsWith('/dashboard/sponsorship/')
  const moreCurrent = moreOpen || secondaryActive || moreDestinationActive
  const displayName = accountName.trim() || accountLabel
  const lockedHubs = new Set(lockedDestinationIds)
  function destinationAria(item: Destination) {
    if (lockedHubs.has(item.id)) return `${item.label}, locked`
    if (item.id === 'deals' && dealsBadge > 0) return dealsBadgeLabel(dealsBadge)
    return undefined
  }

  useEffect(() => {
    if (!moreOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  useEffect(() => {
    if (!accountOpen) return
    const panel = accountPanel.current
    const button = accountButton.current
    const previousOverflow = document.body.style.overflow
    if (!desktop) document.body.style.overflow = 'hidden'
    const focusables = () =>
      panel
        ? [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter(
            (node) => node.tabIndex !== -1,
          )
        : []
    focusables()[0]?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setAccountOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
      button?.focus()
    }
  }, [accountOpen, desktop])

  function retap(event: { preventDefault: () => void }, item: Destination, isActive: boolean) {
    if (!isActive) return
    event.preventDefault()
    navigate(item.to)
    requestAnimationFrame(() => {
      document.querySelector('.shell-main')?.scrollTo({ top: 0 })
    })
  }

  function closeAccount() {
    setAccountOpen(false)
  }

  function markAt(size: number) {
    return renderAccountMark ? renderAccountMark(size) : accountMark
  }

  const accountRows = (
    <ul>
      {secondary.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-11 w-full items-center px-3 text-[0.95rem] ${
                isActive ? styles.navActive : styles.navIdle
              }`
            }
            onClick={closeAccount}
          >
            {item.label}
          </NavLink>
        </li>
      ))}
      {roleSwitch ? (
        <li>
          <Link
            to={roleSwitch.to}
            className={`flex min-h-11 w-full items-center px-3 text-[0.95rem] ${styles.navIdle}`}
            onClick={closeAccount}
          >
            {roleSwitch.label}
          </Link>
        </li>
      ) : null}
    </ul>
  )

  return (
    <div className={`shell-root min-h-dvh ${member ? 'shell-tone-member' : 'shell-tone-staff'} ${styles.page}`}>
      <div className="shell-frame flex min-h-dvh w-full">
        <aside
          aria-label="Primary"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`relative hidden min-h-dvh shrink-0 flex-col self-stretch border-r md:flex ${styles.sidebarBorder} ${styles.sidebar} ${
            member || hovered || pinned ? 'w-64' : 'w-[4.75rem] lg:w-64'
          } transition-[width] duration-200 motion-reduce:transition-none`}
        >
          <div className="shell-safe-y shell-safe-left flex h-full min-h-0 w-full flex-col overflow-y-auto">
            <div className="flex items-center justify-between gap-2 px-3 py-4">
              <span className={member || hovered || pinned ? '' : 'max-lg:hidden'}>
                <BrandLockup to={home} tone="on-dark" />
              </span>
              {member || hovered || pinned ? null : (
                <span className="lg:hidden">
                  <BrandLockup to={home} tone="on-dark" markOnly />
                </span>
              )}
              {member ? null : (
                <button
                  type="button"
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden ${styles.muted}`}
                  aria-expanded={pinned || hovered}
                  aria-label={pinned ? 'Collapse navigation' : 'Expand navigation'}
                  onClick={() => setPinned((value) => !value)}
                >
                  <span aria-hidden="true">{pinned ? '«' : '»'}</span>
                </button>
              )}
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
                      data-locked={lockedHubs.has(item.id) ? 'true' : undefined}
                      aria-label={destinationAria(item)}
                      onClick={(event) => retap(event, item, event.currentTarget.getAttribute('aria-current') === 'page')}
                      className={({ isActive }) =>
                        `flex min-h-11 items-center gap-3 px-3 text-[0.95rem] ${
                          isActive ? styles.sidebarActive : styles.sidebarIdle
                        }`
                      }
                    >
                      <span className="relative inline-flex shrink-0">
                        <DestinationIcon id={item.id} />
                        {lockedHubs.has(item.id) ? <LockMark /> : null}
                      </span>
                      <span className={`${member || hovered || pinned ? '' : 'max-lg:sr-only'} truncate`}>{item.label}</span>
                      {item.id === 'deals' ? <CountBadge count={dealsBadge} place="sidebar" /> : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            {member ? (
              <div className={`mt-auto border-t px-3 py-4 ${styles.border}`}>
                <div className="flex items-center gap-3 px-2">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--ba-indigo)] text-[0.75rem] text-[var(--ba-porcelain)]">
                    {markAt(36)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[0.95rem] text-[var(--ba-porcelain)]">{displayName}</span>
                    <span className="block text-[0.8125rem] text-[var(--ba-lavender-mist)]">Account</span>
                  </span>
                </div>
                <ul className="mt-2">
                  {secondary.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        data-nav="account"
                        className={({ isActive }) =>
                          `flex min-h-11 items-center px-3 text-[0.95rem] ${
                            isActive ? styles.sidebarActive : styles.sidebarIdle
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
                {roleSwitch ? (
                  <Link
                    to={roleSwitch.to}
                    className={`flex min-h-11 items-center px-3 text-[0.95rem] ${styles.sidebarIdle}`}
                  >
                    {roleSwitch.label}
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={onSignOut}
                  data-nav="sign-out"
                  className={`flex min-h-11 w-full items-center px-3 text-left text-[0.95rem] ${styles.sidebarIdle}`}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className={`border-t px-3 py-4 ${styles.border}`}>
                {secondary.length > 0 && (
                  <ul className={`mb-3 space-y-1 ${showLabels ? '' : 'max-lg:hidden'}`}>
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
            )}
          </div>
        </aside>

        <div className="shell-column flex min-w-0 flex-1 flex-col">
          <header className={`shell-safe-top shell-safe-x sticky top-0 z-30 border-b backdrop-blur ${styles.header}`}>
            <div className="flex min-h-14 items-center justify-between gap-3 px-2 py-1 md:px-6 md:py-2">
              {member ? (
                <p className="min-w-0 truncate font-display text-[1.15rem] font-semibold tracking-[-0.02em]">
                  {title}
                </p>
              ) : (
                <>
                  <div className="min-w-0 md:hidden">
                    <BrandLockup to={home} tone={tone === 'staff' ? 'on-dark' : 'on-light'} />
                  </div>
                  <p className="hidden min-w-0 font-display text-[1.15rem] font-semibold tracking-[-0.02em] md:block">
                    {title}
                  </p>
                </>
              )}
              <div className="flex shrink-0 items-center justify-end gap-2">
                {!member && updatedLabel ? (
                  <p className={`hidden px-1 text-[0.75rem] md:block ${styles.muted}`}>{updatedLabel}</p>
                ) : null}
                {!member && roleSwitch ? (
                  <Link
                    to={roleSwitch.to}
                    className={`hidden min-h-11 items-center px-2 text-[0.75rem] font-semibold tracking-[0.06em] uppercase md:inline-flex ${styles.switch}`}
                  >
                    {roleSwitch.label}
                  </Link>
                ) : null}
                {!member ? (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className={`hidden min-h-11 items-center px-2 text-[0.75rem] font-semibold tracking-[0.06em] uppercase md:inline-flex ${styles.signOut}`}
                  >
                    Sign out
                  </button>
                ) : null}
                {member && headerChip ? (
                  <p className="hidden text-[0.75rem] font-semibold text-[var(--ba-indigo)] lg:block">{headerChip}</p>
                ) : null}
                {member ? (
                  <button
                    ref={accountButton}
                    type="button"
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full ps-2 pe-1 ${
                      accountRoute ? 'ring-2 ring-[var(--ba-indigo)]' : ''
                    }`}
                    aria-label="Account"
                    aria-expanded={accountOpen}
                    aria-controls="shell-account"
                    onClick={() => setAccountOpen((value) => !value)}
                  >
                    <span className="hidden text-[0.8125rem] font-semibold text-[var(--ba-indigo)] lg:inline">
                      Account
                    </span>
                    <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--ba-indigo)] text-[0.75rem] text-[var(--ba-porcelain)]">
                      {markAt(36)}
                    </span>
                  </button>
                ) : (
                  accountMark
                )}
              </div>
            </div>
          </header>
          <main className="shell-main min-h-0 flex-1">{children}</main>
        </div>
      </div>

      <nav
        aria-label="Primary"
        className={`shell-tab-bar shell-safe-bottom shell-safe-x fixed inset-x-0 bottom-0 z-40 h-14 border-t md:hidden ${styles.tabBar}`}
      >
        <ul className={`grid min-h-14 ${member ? 'grid-cols-5' : 'grid-cols-5 shell-staff-tabs'}`}>
          {tabItems.map((item) => (
            <li key={item.to} className="min-w-0">
              <NavLink
                to={item.to}
                end={item.end}
                data-nav="primary"
                data-destination={item.label}
                data-locked={lockedHubs.has(item.id) ? 'true' : undefined}
                aria-label={destinationAria(item)}
                onClick={(event) => retap(event, item, event.currentTarget.getAttribute('aria-current') === 'page')}
                className={({ isActive }) =>
                  `flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-center text-[12px] leading-none whitespace-nowrap ${
                    isActive ? 'font-bold text-[var(--ba-indigo)]' : styles.tabIdle
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`relative inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        isActive ? 'bg-[var(--ba-lavender-mist)]' : ''
                      }`}
                    >
                      <DestinationIcon id={item.id} className="h-6 w-6 shrink-0" />
                      {lockedHubs.has(item.id) ? <LockMark /> : null}
                      {item.id === 'deals' ? <CountBadge count={dealsBadge} place="tab" /> : null}
                    </span>
                    <span className="shell-tab-label">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          {member ? null : (
            <li className="min-w-0">
              <button
                type="button"
                data-nav="more"
                data-more-current={moreCurrent ? 'true' : 'false'}
                className={`flex min-h-11 min-w-11 w-full flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-center text-[0.65rem] leading-tight ${
                  moreCurrent ? styles.tabActive : styles.tabIdle
                }`}
                aria-expanded={moreOpen}
                aria-controls="shell-more"
                aria-label="More"
                onClick={() => setMoreOpen((value) => !value)}
              >
                <MoreIcon />
                <span>More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {!member && moreOpen ? (
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
            className={`shell-tab-bar shell-safe-bottom absolute inset-x-0 bottom-0 max-h-[min(32rem,85dvh)] overflow-y-auto border-t px-4 pt-4 ${styles.border} ${styles.page}`}
          >
            <div className="flex items-start justify-between gap-3 px-3 pb-2">
              <div className="min-w-0">
                <p className="font-display text-[1.15rem] font-semibold tracking-[-0.02em]">More</p>
                {updatedLabel ? <p className={`mt-1 text-[0.75rem] ${styles.muted}`}>{updatedLabel}</p> : null}
              </div>
              <button
                type="button"
                className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-3 text-[0.95rem] font-semibold ${styles.switch}`}
                aria-label="Close more"
                onClick={() => setMoreOpen(false)}
              >
                Close
              </button>
            </div>
            <ul>
              {phone.more.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    data-nav="more-destination"
                    data-destination={item.label}
                    className={({ isActive }) =>
                      `flex min-h-11 w-full items-center px-3 py-2 text-[1rem] leading-snug ${
                        isActive ? styles.navActive : styles.navIdle
                      }`
                    }
                    onClick={() => setMoreOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              {secondary.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    data-nav="secondary"
                    className={({ isActive }) =>
                      `flex min-h-11 w-full items-center px-3 py-2 text-[1rem] leading-snug ${
                        isActive ? styles.navActive : styles.navIdle
                      }`
                    }
                    onClick={() => setMoreOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              {roleSwitch ? (
                <li>
                  <Link
                    to={roleSwitch.to}
                    className={`flex min-h-11 w-full items-center px-3 text-[1rem] ${styles.navIdle}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    {roleSwitch.label}
                  </Link>
                </li>
              ) : null}
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
      ) : null}

      {member && accountOpen ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-ink/45 lg:bg-transparent"
            onClick={closeAccount}
          />
          <div
            ref={accountPanel}
            id="shell-account"
            role="dialog"
            aria-modal="true"
            aria-labelledby={accountTitleId}
            className={`account-sheet shell-safe-bottom absolute inset-x-0 bottom-0 max-h-[min(32rem,85dvh)] overflow-y-auto border-t px-4 pt-4 pb-4 lg:inset-x-auto lg:end-4 lg:top-16 lg:bottom-auto lg:w-80 lg:border ${styles.border} ${styles.page}`}
          >
            <div className="flex items-start justify-between gap-3 px-3 pb-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--ba-lavender-mist)] text-[0.85rem] text-[var(--ba-indigo)]">
                  {markAt(44)}
                </span>
                <div className="min-w-0">
                  <p id={accountTitleId} className="truncate font-display text-[1.15rem] font-semibold tracking-[-0.02em]">
                    {displayName}
                  </p>
                  <p className="text-[0.8125rem] text-[var(--ba-muted)]">Account</p>
                </div>
              </div>
              <button
                type="button"
                className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-3 text-[0.95rem] font-semibold ${styles.switch}`}
                aria-label="Close"
                onClick={closeAccount}
              >
                Close
              </button>
            </div>
            {accountRows}
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
      ) : null}
    </div>
  )
}

function CountBadge({ count, place }: { count: number; place: 'tab' | 'sidebar' }) {
  if (count <= 0) return null
  const text = count > 9 ? '9+' : String(count)
  const position = place === 'tab' ? 'absolute -top-1 end-0' : 'relative ms-auto shrink-0'
  return (
    <span
      data-chip=""
      data-deals-badge={place}
      className={`${position} inline-flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--ba-indigo)] px-1 text-[12px] leading-none font-semibold text-white ring-2 ring-white`}
    >
      {text}
    </span>
  )
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </svg>
  )
}

function LockMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="absolute -end-1 -bottom-0.5 h-3 w-3">
      <rect x="3.2" y="7" width="9.6" height="6.2" rx="1" fill="currentColor" />
      <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
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
