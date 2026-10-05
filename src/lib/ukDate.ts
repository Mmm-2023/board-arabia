const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'] as const

/** UK date and 24 hour time, for example 22 Sept 2026, 14:34. Asia/Riyadh. */
export function formatUkDateTime(iso: string, timeZone = 'Asia/Riyadh'): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const month = MONTHS[Number(pick('month')) - 1]
  const day = String(Number(pick('day')))
  const year = pick('year')
  const hour = pick('hour')
  const minute = pick('minute')
  if (!month || !day || !year || !hour || !minute) return ''
  return `${day} ${month} ${year}, ${hour}:${minute}`
}
