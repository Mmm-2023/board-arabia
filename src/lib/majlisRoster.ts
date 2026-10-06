import { toCsv } from './csv'
import type { MajlisRosterRow } from './supabase'

export const ROSTER_GROUPS = [
  { status: 'registered', label: 'Yes' },
  { status: 'waitlist', label: 'Waitlist' },
  { status: 'maybe', label: 'Maybe' },
  { status: 'declined', label: 'No' },
] as const

export function groupMajlisRoster<T extends { status: string }>(rows: readonly T[]) {
  return ROSTER_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => row.status === group.status),
  }))
}

export function hostRosterCsv(
  rows: Array<Pick<MajlisRosterRow, 'full_name' | 'status' | 'waitlist_position' | 'registered_at'>>,
): string {
  return toCsv(
    ['Name', 'Status', 'Waitlist position', 'Registered at'],
    rows.map((row) => [row.full_name || '', row.status, row.waitlist_position, row.registered_at]),
  )
}
