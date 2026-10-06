/** Staff display name for the access log. No email address, 1 to 80 characters. */

export function cleanStaffDisplayName(value: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = value.trim()
  if (value.includes('@') || name.includes('@') || name.length < 1 || name.length > 80) {
    return { ok: false, error: 'Use 1 to 80 characters, with no @.' }
  }
  return { ok: true, name }
}

export function ownStaffRowLabel(
  email: string,
  role: 'Admin' | 'Master',
  self: boolean,
  displayName: string,
): string {
  const cleaned = cleanStaffDisplayName(displayName)
  if (self && cleaned.ok) return `${cleaned.name}, ${role}`
  return email
}

export function showStaffNameCard(savedName: string, ready: boolean): boolean {
  return ready && !cleanStaffDisplayName(savedName).ok
}
