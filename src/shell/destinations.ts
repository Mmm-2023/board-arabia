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

/** Locked member primaries. Sidebar and bottom tabs use this order. */
export const MEMBER_DESTINATIONS: readonly Destination[] = [
  { id: 'home', label: 'Home', to: '/dashboard', end: true },
  { id: 'directory', label: 'Directory', to: '/dashboard/directory', end: false },
  { id: 'mandates', label: 'Mandates', to: '/dashboard/mandates', end: false },
  { id: 'network', label: 'Network', to: '/dashboard/network', end: false },
  { id: 'profile', label: 'Profile', to: '/dashboard/profile', end: false },
]

/** Locked staff primaries. Sidebar and bottom tabs use this order. */
export const STAFF_DESTINATIONS: readonly Destination[] = [
  { id: 'home', label: 'Home', to: '/admin', end: true },
  { id: 'applications', label: 'Applications', to: '/admin/applications', end: false },
  { id: 'people', label: 'People', to: '/admin/people', end: false },
  { id: 'capacity', label: 'Capacity', to: '/admin/capacity', end: false },
  { id: 'settings', label: 'Settings', to: '/admin/settings', end: false },
]

/** Not a sixth tab. Sidebar footer on desktop, More sheet on mobile. */
export const MEMBER_SECONDARY: readonly SecondaryLink[] = [
  { id: 'majlis', label: 'Majlis', to: '/dashboard/majlis' },
  { id: 'rooms', label: 'Rooms', to: '/dashboard/rooms' },
  { id: 'help', label: 'Help', to: '/dashboard/help' },
]

export const STAFF_SECONDARY: readonly SecondaryLink[] = [
  { id: 'majlis', label: 'Majlis', to: '/admin/majlis' },
  { id: 'email', label: 'Email', to: '/admin/email' },
]

export function destinationsFor(tone: ShellTone) {
  return tone === 'member' ? MEMBER_DESTINATIONS : STAFF_DESTINATIONS
}

export function secondaryFor(tone: ShellTone) {
  return tone === 'member' ? MEMBER_SECONDARY : STAFF_SECONDARY
}

export function shellSectionTitle(
  pathname: string,
  destinations: readonly Destination[],
  secondary: readonly SecondaryLink[],
) {
  const primary = destinations.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
  if (primary) return primary.label
  const extra = secondary.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
  return extra?.label ?? destinations[0]?.label ?? 'Home'
}

export function formatUpdated(date: Date | null) {
  if (!date) return null
  const clock = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `Updated ${clock}`
}
