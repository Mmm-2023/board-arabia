import { staffApiDecision } from '../_shared/staff_auth.ts'

/** Staff role writes for invite-master.
 * The caller role is the staff_users value read with the service role for the
 * verified JWT user. It is never taken from the request body. requestedRole is
 * the role a master asked to set on the target row.
 */

export const MASTER_ONLY_MESSAGE = 'Only a master can add or change an admin.'
export const ROLE_PARAM_MESSAGE = 'Role must be staff or master.'

export type StaffRoleName = 'staff' | 'master'

export type StaffRoleStore = {
  findRole: (userId: string) => Promise<{ role: string | null; error: string | null }>
  insertRole: (row: { userId: string; email: string; role: StaffRoleName }) => Promise<string | null>
  updateRole: (row: { userId: string; email: string; role: StaffRoleName }) => Promise<string | null>
}

export type StaffRoleResult =
  | { ok: false; status: 400 | 403 | 500; error: string }
  | { ok: true; role: StaffRoleName; changed: boolean }

/** requireStaff (aal2) runs first. A master at aal1 never reaches a write.
 * A staff row at aal2 is still refused here.
 */
export function gateInviteMaster(input: {
  userId: string | null
  role: unknown
  aal: string | null
}):
  | { allow: true; role: 'master' }
  | { allow: false; status: 401 | 403; error: string; code?: 'mfa_required' } {
  const staff = staffApiDecision({ userId: input.userId, role: input.role, aal: input.aal })
  if (!staff.allow) return staff
  const master = assertMasterCaller(staff.role)
  if (!master.ok) return { allow: false, status: master.status, error: master.error }
  return { allow: true, role: 'master' }
}

export function assertMasterCaller(
  callerRole: unknown,
): { ok: true } | { ok: false; status: 403; error: string } {
  if (callerRole === 'master') return { ok: true }
  return { ok: false, status: 403, error: MASTER_ONLY_MESSAGE }
}

/** Target role from the JSON body. Absent means "do not set a role". */
export function requestedStaffRole(body: unknown): StaffRoleName | null | 'invalid' {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (!Object.prototype.hasOwnProperty.call(body, 'role')) return null
  const record = body as { role?: unknown }
  return normalizeRequestedRole(record.role)
}

export function normalizeRequestedRole(raw: unknown): StaffRoleName | null | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return null
  if (raw === 'staff' || raw === 'master') return raw
  return 'invalid'
}

/** Apply a staff role change. A non-master returns 403 and does not touch the store. */
export async function writeStaffRole(
  store: StaffRoleStore,
  input: {
    callerRole: unknown
    requestedRole: unknown
    userId: string
    email: string
  },
): Promise<StaffRoleResult> {
  const callerGate = assertMasterCaller(input.callerRole)
  if (!callerGate.ok) return callerGate

  const requested = normalizeRequestedRole(input.requestedRole)
  if (requested === 'invalid') {
    return { ok: false, status: 400, error: ROLE_PARAM_MESSAGE }
  }

  const found = await store.findRole(input.userId)
  if (found.error) return { ok: false, status: 500, error: found.error }

  const existing = found.role
  if (existing == null) {
    const role: StaffRoleName = requested === 'master' ? 'master' : 'staff'
    const error = await store.insertRole({ userId: input.userId, email: input.email, role })
    if (error) return { ok: false, status: 500, error }
    return { ok: true, role, changed: true }
  }

  if (existing !== 'staff' && existing !== 'master') {
    return { ok: false, status: 500, error: 'Staff role could not be read.' }
  }

  if (requested === null || requested === existing) {
    return { ok: true, role: existing, changed: false }
  }

  const error = await store.updateRole({
    userId: input.userId,
    email: input.email,
    role: requested,
  })
  if (error) return { ok: false, status: 500, error }
  return { ok: true, role: requested, changed: true }
}
