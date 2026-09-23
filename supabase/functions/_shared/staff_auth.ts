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

export function sanitizeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (raw.startsWith('/login') || raw.startsWith('/auth')) return fallback
  return raw
}

/** Staff land on /admin unless they also have a live member row and asked for /dashboard. */
export function postLoginDestination(input: {
  role: unknown
  memberStatus: unknown
  requested: string | null
}): string {
  const inStaff = isStaffRole(input.role)
  const requested = sanitizeNext(input.requested, inStaff ? '/admin' : '/dashboard')
  if (inStaff) {
    if (isLiveMember(input.memberStatus) && requested.startsWith('/dashboard')) return requested
    if (requested === '/ops' || requested.startsWith('/ops/')) return '/ops'
    if (requested === '/admin' || requested.startsWith('/admin/')) return requested
    return '/admin'
  }
  if (isLiveMember(input.memberStatus) && requested.startsWith('/dashboard')) return requested
  return '/dashboard'
}
