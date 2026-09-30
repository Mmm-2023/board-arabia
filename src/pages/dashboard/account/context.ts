import { createContext, useContext } from 'react'

export type AccountRoom = {
  userId: string
  email: string
  fullName: string
  role: string
  region: string
  requestState: string
  reload: () => Promise<void>
}

export const AccountRoomContext = createContext<AccountRoom | null>(null)

export function useAccountRoom() {
  const value = useContext(AccountRoomContext)
  if (!value) throw new Error('Account room is not ready')
  return value
}
