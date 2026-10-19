export type FreeMajlisStatus = 'received' | 'pending' | 'accepted' | 'waitlist' | 'rejected' | 'cancelled'

export type FreeMajlisRow = {
  id: string
  eventId: string
  title: string
  startsAt: string
  endsAt: string
  status: FreeMajlisStatus
  joinUrl: string | null
}

const STATUSES = new Set<FreeMajlisStatus>(['received', 'pending', 'accepted', 'waitlist', 'rejected', 'cancelled'])

export function safeJoinUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return null
    if (url.hostname === 'meet.google.com') return url.toString()
    if (url.hostname === 'boardarabia.com' || url.hostname === 'www.boardarabia.com') return url.toString()
    return null
  } catch {
    return null
  }
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.replace(/@/g, '').trim().slice(0, max)
}

export function presentFreeMajlis(raw: unknown, joins: Record<string, unknown> = {}): FreeMajlisRow[] {
  if (!Array.isArray(raw)) return []
  const rows: FreeMajlisRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const status = row.status
    if (typeof status !== 'string' || !STATUSES.has(status as FreeMajlisStatus)) continue
    const eventId = text(row.event_id, 80)
    const id = text(row.id, 80)
    if (!id || !eventId) continue
    rows.push({
      id,
      eventId,
      title: text(row.title, 160) || 'Majlis',
      startsAt: text(row.starts_at, 40),
      endsAt: text(row.ends_at, 40),
      status: status as FreeMajlisStatus,
      joinUrl: status === 'accepted' ? safeJoinUrl(joins[eventId]) : null,
    })
  }
  return rows
}

export function formatMajlisWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function statusLabel(status: FreeMajlisStatus) {
  if (status === 'received') return 'Waiting for email confirmation'
  if (status === 'pending') return 'In review'
  if (status === 'accepted') return 'Accepted'
  if (status === 'waitlist') return 'Waitlist'
  if (status === 'rejected') return 'Not accepted'
  return 'Cancelled'
}
