import { PUBLIC_MAJLIS_ROLES } from './publicMajlis.ts'

export const MAJLIS_REQUEST_STATUSES = [
  'received',
  'pending',
  'accepted',
  'waitlist',
  'rejected',
  'cancelled',
] as const

export type MajlisRequestStatus = (typeof MAJLIS_REQUEST_STATUSES)[number]

export type MajlisRequestCard = {
  id: string
  eventId: string
  eventTitle: string
  startsAt: string
  endsAt: string
  status: MajlisRequestStatus
  submittedAt: string
  seatHeld: boolean
  emailVerified: boolean
  fullName: string
  phone: string
  company: string
  role: string
  linkedin: string
  why: string
}

export type MajlisMailDraft = {
  kind: 'accept' | 'decline'
  subject: string
  body: string
  sendEnabled: false
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanLine(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.replace(/@/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanWhy(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/@/g, '').trim().slice(0, 1000)
}

export function requestStatusLabel(status: MajlisRequestStatus) {
  if (status === 'pending') return 'Needs a decision'
  if (status === 'received') return 'Email not verified'
  if (status === 'accepted') return 'Accepted'
  if (status === 'waitlist') return 'Waitlist'
  if (status === 'rejected') return 'Rejected'
  return 'Cancelled'
}

export function requestRoleLabel(role: string) {
  return PUBLIC_MAJLIS_ROLES.find((item) => item.id === role)?.label ?? role
}

export function linkedInHref(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== 'linkedin.com' && !url.hostname.endsWith('.linkedin.com')) return null
    return url.toString()
  } catch {
    return null
  }
}

export function presentMajlisRequests(raw: unknown): MajlisRequestCard[] {
  if (!Array.isArray(raw)) return []
  const rows: MajlisRequestCard[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = cleanLine(row.id, 80)
    const eventId = cleanLine(row.event_id, 80)
    const status = cleanLine(row.status, 40)
    if (!UUID.test(id) || !UUID.test(eventId)) continue
    if (!MAJLIS_REQUEST_STATUSES.includes(status as MajlisRequestStatus)) continue
    rows.push({
      id,
      eventId,
      eventTitle: cleanLine(row.event_title, 160) || 'Majlis',
      startsAt: cleanLine(row.starts_at, 40),
      endsAt: cleanLine(row.ends_at, 40),
      status: status as MajlisRequestStatus,
      submittedAt: cleanLine(row.submitted_at, 40),
      seatHeld: row.seat_held === true,
      emailVerified: row.email_verified === true,
      fullName: cleanLine(row.full_name, 200),
      phone: cleanLine(row.phone, 32),
      company: cleanLine(row.company, 200),
      role: cleanLine(row.role, 80),
      linkedin: cleanLine(row.linkedin, 300),
      why: cleanWhy(row.why),
    })
  }
  return rows
}

export function presentMajlisDrafts(raw: unknown): MajlisMailDraft[] {
  if (!Array.isArray(raw)) return []
  const rows: MajlisMailDraft[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const kind = row.kind === 'accept' || row.kind === 'decline' ? row.kind : null
    const subject = cleanLine(row.subject, 160)
    const body = typeof row.body === 'string' ? row.body.replace(/@/g, '').trim().slice(0, 4000) : ''
    if (!kind || !subject || !body) continue
    rows.push({ kind, subject, body, sendEnabled: false })
  }
  return rows
}

