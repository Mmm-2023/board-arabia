import { createContext, useContext } from 'react'
import type { StaffRole } from '../../../supabase/functions/_shared/staff_auth.ts'
import type { MemberRow, ProfileRow } from '../../lib/member'

export type MemberRoom = {
  userId: string
  email: string
  staffRole: StaffRole | null
  member: MemberRow
  profile: ProfileRow | null
  reload: () => Promise<void>
}

export const MemberContext = createContext<MemberRoom | null>(null)

export function useMember() {
  const value = useContext(MemberContext)
  if (!value) throw new Error('Member room is not ready')
  return value
}
