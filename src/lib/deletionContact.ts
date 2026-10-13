/** A configured contact. A blank value or the pending sentinel renders nothing. */
export function deletionContact(value: string, pending = 'To be confirmed'): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === pending) return null
  return trimmed
}
