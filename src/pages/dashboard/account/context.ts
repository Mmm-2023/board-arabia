import { createContext, useContext } from 'react'
import type { ChecklistInput } from '../../../../supabase/functions/_shared/membership_steps.ts'

export type AccountRoom = {
  userId: string
  email: string
  fullName: string
  role: string
  region: string
  requestState: string
  checklist: ChecklistInput
  submittedAt: string | null
  declinedUntil: string | null
  needsQuestion: string
  needsItems: string[]
  emailVerifiedAt: string | null
  reload: () => Promise<void>
}

export const AccountRoomContext = createContext<AccountRoom | null>(null)

export function useAccountRoom() {
  const value = useContext(AccountRoomContext)
  if (!value) throw new Error('Account room is not ready')
  return value
}
