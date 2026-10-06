import { toCsv } from './csv'
import type { MajlisRosterRow } from './supabase'

export function hostRosterCsv(
  rows: Array<Pick<MajlisRosterRow, 'full_name' | 'status' | 'waitlist_position' | 'registered_at'>>,
): string {
  return toCsv(
    ['Name', 'Status', 'Waitlist position', 'Registered at'],
    rows.map((row) => [row.full_name || '', row.status, row.waitlist_position, row.registered_at]),
  )
}
