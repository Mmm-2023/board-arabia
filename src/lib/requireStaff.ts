import {
  isStaffRole,
  type StaffRole,
} from '../../supabase/functions/_shared/staff_auth.ts'
import { supabase } from './supabase'

export type CallerAccess = {
  userId: string
  role: StaffRole | null
  memberStatus: string | null
}

/** Reads staff_users and members for this user id. A query error is not staff. */
export async function readCallerAccess(userId: string): Promise<CallerAccess> {
  const [staffRes, memberRes] = await Promise.all([
    supabase.from('staff_users').select('role').eq('user_id', userId).maybeSingle(),
    supabase.from('members').select('status').eq('user_id', userId).maybeSingle(),
  ])
  const role = !staffRes.error && isStaffRole(staffRes.data?.role) ? staffRes.data.role : null
  const status = memberRes.error ? null : (memberRes.data?.status ?? null)
  return { userId, role, memberStatus: status }
}
