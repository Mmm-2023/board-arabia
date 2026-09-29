/** Staff authorization decisions shared by the client guards and Edge functions.
 * Membership (member, founding, sponsor) is never staff. Only a staff_users
 * role of staff or master is. Pass the role read from staff_users for the
 * JWT subject. Do not pass user_metadata or a client-claimed role.
 */

export const STAFF_ROLES = ['staff', 'master'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export function isStaffRole(role: unknown): role is StaffRole {
  return role === 'staff' || role === 'master'
}

export function isLiveMember(status: unknown): boolean {
  return status === 'invited' || status === 'active'
}

/** 401 when there is no verified user. 403 when that user is not staff. */
export function staffApiDecision(input: {
  userId: string | null
  role: unknown
}):
  | { allow: true; role: StaffRole }
  | { allow: false; status: 401 | 403; error: 'Unauthorized' | 'Not staff' } {
  if (!input.userId) return { allow: false, status: 401, error: 'Unauthorized' }
  if (!isStaffRole(input.role)) return { allow: false, status: 403, error: 'Not staff' }
  return { allow: true, role: input.role }
}

/** Signed-out users go to login. Everyone else who is not staff goes to the member dashboard. */
export function clientAdminGate(signedIn: boolean, role: unknown): 'login' | 'dashboard' | 'allow' {
  if (!signedIn) return 'login'
  if (!isStaffRole(role)) return 'dashboard'
  return 'allow'
}

/** The admin/member switch is only for someone who is both staff and a live member. */
export function showRoleSwitch(
  role: unknown,
  memberStatus: unknown,
): { toAdmin: boolean; toMember: boolean } {
  const both = isStaffRole(role) && isLiveMember(memberStatus)
  return { toAdmin: both, toMember: both }
}

export function memberRoomLabel(seat: unknown): 'Founding member' | 'Member' {
  if (seat === 'ksa' || seat === 'intl') return 'Founding member'
  return 'Member'
}

const CONTROL = /[\u0000-\u001f\u007f]/

function pathOnly(value: string): string {
  const cut = value.search(/[?#]/)
  return cut === -1 ? value : value.slice(0, cut)
}

function isAppPath(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`)
}

/** Keep an in-app path, including its query and hash. Reject open redirects. */
export function sanitizeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  const value = raw.trim()
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (CONTROL.test(value)) return fallback
  const path = pathOnly(value)
  if (path.includes('\\') || path.includes('//') || path.split('/').includes('..')) return fallback
  if (path.startsWith('/login') || path.startsWith('/auth')) return fallback
  return value
}

/** Staff land on /admin unless they also have a live member row and asked for /dashboard.
 * A requested in-app path keeps its query and hash.
 */
export function postLoginDestination(input: {
  role: unknown
  memberStatus: unknown
  requested: string | null
}): string {
  const inStaff = isStaffRole(input.role)
  const requested = sanitizeNext(input.requested, inStaff ? '/admin' : '/dashboard')
  const path = pathOnly(requested)
  if (inStaff) {
    if (isLiveMember(input.memberStatus) && isAppPath(path, '/dashboard')) return requested
    if (isAppPath(path, '/ops')) return requested
    if (isAppPath(path, '/admin')) return requested
    return '/admin'
  }
  if (isLiveMember(input.memberStatus) && isAppPath(path, '/dashboard')) return requested
  return '/dashboard'
}
