import { createContext, useContext } from 'react'
import type { MemberRow, ProfileRow } from '../../lib/member'

export type MemberRoom = {
  userId: string
  email: string
  isStaff: boolean
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
