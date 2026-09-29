/** True when PostgREST does not know recipient_name yet. The list can fall back to the older columns. */

export function missingRecipientNameColumn(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  const message = (error.message || '').toLowerCase()
  if (!message.includes('recipient_name')) return false
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  )
}
