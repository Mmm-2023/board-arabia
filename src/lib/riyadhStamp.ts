const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function riyadhParts(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const monthIndex = Number(pick('month')) - 1
  const month = MONTHS[monthIndex]
  if (!month || !pick('year') || !pick('day')) return null
  return {
    day: String(Number(pick('day'))),
    month,
    year: pick('year'),
    hour: pick('hour'),
    minute: pick('minute'),
  }
}

/** "Pending, sent 25 Sep 2026, 16:33" in Asia/Riyadh. No seconds. */
export function formatInviteSent(iso: string, status: string) {
  const stamp = riyadhParts(iso)
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Sent'
  if (!stamp) return label
  return `${label}, sent ${stamp.day} ${stamp.month} ${stamp.year}, ${stamp.hour}:${stamp.minute}`
}

/** "Figures as of 29 Sep 2026" when platform_stats.updated_at is present. */
export function figuresAsOfLabel(iso: string | null | undefined) {
  if (!iso) return null
  const stamp = riyadhParts(iso)
  if (!stamp) return null
  return `Figures as of ${stamp.day} ${stamp.month} ${stamp.year}`
}
