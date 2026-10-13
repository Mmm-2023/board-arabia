/** Owner and Admin labels for staff management. Stored roles stay staff and master. */

export function staffRoleLabel(role: string): 'Owner' | 'Admin' | '' {
  if (role === 'master') return 'Owner'
  if (role === 'staff') return 'Admin'
  return ''
}

export function staffRosterName(row: { display_name?: string | null; email: string }): string {
  const named = row.display_name?.trim() ?? ''
  if (named && !named.includes('@')) return named
  return row.email
}

/** The only remaining owner cannot be demoted or removed. */
export function lastOwnerLocked(role: string, rows: readonly { role: string }[]): boolean {
  if (role !== 'master') return false
  return rows.filter((row) => row.role === 'master').length <= 1
}

export function staffHeadcount(rows: readonly unknown[]): number {
  return rows.length
}

export function staffChangeMessage(raw: string): string {
  const text = raw.toLowerCase()
  if (text.includes('last_owner')) return 'The last owner stays in place.'
  if (text.includes('owner_stays') || text.includes('cannot_demote_master')) {
    return 'This owner stays in place.'
  }
  if (text.includes('not_found')) return 'That staff member was not found.'
  if (text.includes('invalid_role')) return 'Choose Admin or Owner.'
  if (text.includes('not_allowed') || text.includes('permission denied')) {
    return 'Only an owner can change staff.'
  }
  return 'Could not update staff.'
}
