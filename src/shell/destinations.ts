export type ShellTone = 'member' | 'staff'

export type Destination = {
  id: string
  label: string
  to: string
  end: boolean
}

export type SecondaryLink = {
  id: string
  label: string
  to: string
}

export type SectionLink = {
  id: string
  label: string
  to: string
  /** Detail routes under this section keep the section active. */
  end: boolean
}

/** Locked member hubs. Sidebar and bottom tabs use this order. */
export const MEMBER_DESTINATIONS: readonly Destination[] = [
  { id: 'home', label: 'Home', to: '/dashboard', end: true },
  { id: 'deals', label: 'Deals', to: '/dashboard/deals', end: false },
  { id: 'people', label: 'People', to: '/dashboard/people', end: false },
  { id: 'majlis', label: 'Majlis', to: '/dashboard/majlis', end: false },
  { id: 'ai', label: 'AI tools', to: '/dashboard/ai', end: false },
]

/** Locked staff primaries. Sidebar and bottom tabs use this order. */
export const STAFF_DESTINATIONS: readonly Destination[] = [
  { id: 'home', label: 'Home', to: '/admin', end: true },
  { id: 'applications', label: 'Applications', to: '/admin/applications', end: false },
  { id: 'review', label: 'Review', to: '/admin/review', end: false },
  { id: 'people', label: 'People', to: '/admin/people', end: false },
  { id: 'capacity', label: 'Capacity', to: '/admin/capacity', end: false },
  { id: 'settings', label: 'Settings', to: '/admin/settings', end: false },
]

/** Section links under a hub. Hidden in the UI when a hub has one section. */
export const MEMBER_SECTIONS: Readonly<Record<string, readonly SectionLink[]>> = {
  deals: [
    { id: 'mandates', label: 'Mandates', to: '/dashboard/deals/mandates', end: true },
    { id: 'real-estate', label: 'Real estate', to: '/dashboard/deals/real-estate', end: true },
    { id: 'deal-rooms', label: 'Deal rooms', to: '/dashboard/deals/rooms', end: false },
  ],
  people: [
    { id: 'directory', label: 'Directory', to: '/dashboard/people/directory', end: true },
    { id: 'intros', label: 'Intros', to: '/dashboard/people/intros', end: true },
    { id: 'invites', label: 'Invites', to: '/dashboard/people/invites', end: true },
  ],
  ai: [
    { id: 'tools', label: 'Tools', to: '/dashboard/ai', end: true },
    { id: 'due-diligence', label: 'Due diligence', to: '/dashboard/ai/due-diligence', end: false },
  ],
}

/** Account links. Not tabs. Sponsorship is added only for a sponsor seat. */
export const MEMBER_ACCOUNT: readonly SecondaryLink[] = [
  { id: 'profile', label: 'Profile', to: '/dashboard/profile' },
  { id: 'help', label: 'Help', to: '/dashboard/help' },
]

/** Open account sheet. Membership is a row, not a sixth tab. */
export const ACCOUNT_SHEET_LINKS: readonly SecondaryLink[] = [
  { id: 'profile', label: 'Profile', to: '/dashboard/profile' },
  { id: 'membership', label: 'Membership', to: '/dashboard/membership' },
  { id: 'help', label: 'Help', to: '/dashboard/help' },
  { id: 'delete', label: 'Delete account', to: '/dashboard/account/delete' },
]

export const LOCKED_HUBS = ['deals', 'people', 'majlis', 'ai'] as const

export function memberAccountLinks(seat: string | null | undefined): readonly SecondaryLink[] {
  if (seat !== 'sponsor') return MEMBER_ACCOUNT
  return [{ id: 'sponsorship', label: 'Sponsorship', to: '/dashboard/sponsorship' }, ...MEMBER_ACCOUNT]
}

/** Older previews still import this name. It is the account list, not a More sheet. */
export const MEMBER_SECONDARY = MEMBER_ACCOUNT

export const STAFF_SECONDARY: readonly SecondaryLink[] = [
  { id: 'marketing', label: 'Marketing', to: '/admin/marketing' },
  { id: 'majlis', label: 'Majlis', to: '/admin/majlis' },
  { id: 'mandates', label: 'Mandates', to: '/admin/mandates' },
  { id: 'rooms', label: 'Rooms', to: '/admin/rooms' },
  { id: 'email', label: 'Email', to: '/admin/email' },
]

/** Staff hub sections. Review queue state chips are not in this list. */
export const STAFF_SECTIONS: Readonly<Record<string, readonly SectionLink[]>> = {
  people: [
    { id: 'people', label: 'People', to: '/admin/people', end: true },
    { id: 'intros', label: 'Intros', to: '/admin/people/intros', end: true },
  ],
}

const DEALS_SECTIONS = [
  '/dashboard/deals/mandates',
  '/dashboard/deals/real-estate',
  '/dashboard/deals/rooms',
] as const

const DEALS_SECTION_KEY = 'ba-deals-section'

export function destinationsFor(tone: ShellTone) {
  return tone === 'member' ? MEMBER_DESTINATIONS : STAFF_DESTINATIONS
}

export function secondaryFor(tone: ShellTone) {
  return tone === 'member' ? MEMBER_ACCOUNT : STAFF_SECONDARY
}

export function sectionsForHub(hubId: string): readonly SectionLink[] {
  return MEMBER_SECTIONS[hubId] ?? []
}

export function shellSectionTitle(
  pathname: string,
  destinations: readonly Destination[],
  secondary: readonly SecondaryLink[],
) {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/dashboard/sponsorship') return 'Sponsorship'
  const account = secondary.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
  if (account && (account.id === 'profile' || account.id === 'help' || account.to.startsWith('/dashboard/'))) {
    const hub = destinations.find((item) =>
      item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
    )
    if (!hub) return account.label
  }
  const primary = destinations.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
  if (primary) return primary.label
  return account?.label ?? destinations[0]?.label ?? 'Home'
}

export function dealsBadgeLabel(count: number) {
  if (count <= 0) return 'Deals'
  const shown = count > 9 ? '9+' : String(count)
  const noun = count === 1 ? 'invitation waiting' : 'invitations waiting'
  return `Deals, ${shown} ${noun}`
}

export function rememberDealsSection(pathname: string) {
  const hit = DEALS_SECTIONS.find((item) => pathname === item || pathname.startsWith(`${item}/`))
  if (!hit || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(DEALS_SECTION_KEY, hit)
  } catch {
    // Private mode can block storage. The default section still works.
  }
}

export function lastDealsSection() {
  if (typeof sessionStorage === 'undefined') return DEALS_SECTIONS[0]
  try {
    const value = sessionStorage.getItem(DEALS_SECTION_KEY)
    if (value && (DEALS_SECTIONS as readonly string[]).includes(value)) return value
  } catch {
    // Ignore storage failures.
  }
  return DEALS_SECTIONS[0]
}

export function formatUpdated(date: Date | null) {
  if (!date) return null
  const clock = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `Updated ${clock}`
}

/** Member refresh failure only. Staff keeps formatUpdated. */
export function staleBanner(loadedAt: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(loadedAt)
  const hh = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const mm = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `Could not refresh. Showing what loaded at ${hh}:${mm}. Retry`
}
