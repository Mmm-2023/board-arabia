/** Warm intros and the folded unlock list. Contact fields never pass through. */

import { isStoredAvatarStyle, type StoredAvatarStyle } from './avatarStyle.ts'

export const INTRO_REASON_MAX = 280

export const INTRO_KINDS = ['member', 'mandate', 'real_estate', 'partner'] as const
export type IntroKind = (typeof INTRO_KINDS)[number]

export const INTRO_STATUSES = ['pending', 'accepted', 'approved', 'declined'] as const
export type IntroStatus = (typeof INTRO_STATUSES)[number]

export type IntroDirection = 'incoming' | 'outgoing'

export type IntroRow = {
  id: string
  kind: IntroKind
  direction: IntroDirection
  status: IntroStatus
  title: string
  detail: string
  reason: string
  is_demo: boolean
  subject_id: string
  created_at: string
  /** Staff list only. Member payloads leave these empty. */
  requester_name?: string
  target_name?: string
  avatar_style?: StoredAvatarStyle
  avatar_path?: string | null
  ask_desk?: boolean
  desk_status?: 'queued' | 'sent'
  meet_due?: boolean
  meet_outcome?: MeetOutcome
}

export const MEET_OUTCOMES = ['yes', 'not_yet', 'no'] as const
export type MeetOutcome = (typeof MEET_OUTCOMES)[number]

export function meetOutcomeLabel(outcome: MeetOutcome): string {
  if (outcome === 'yes') return 'Yes'
  if (outcome === 'not_yet') return 'Not yet'
  return 'No'
}

export type IntroContact = {
  intro_id: string
  email: string
  linkedin_url: string
  phone: string
  calendar_url: string
}

export type IntroQuota = {
  used: number
  base: number
  allowance: number
  remaining: number
}

export const INTRO_BOOK_SUBJECT = 'Board Arabia introduction'

const AVATAR_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar$/i

export function introHasPortrait(row: Pick<IntroRow, 'kind' | 'avatar_style' | 'avatar_path'>): boolean {
  return row.kind === 'member' || isStoredAvatarStyle(row.avatar_style) || Boolean(row.avatar_path)
}

const LEAK_KEYS = [
  'email',
  'contact_email',
  'contact_phone',
  'phone',
  'linkedin_url',
  'contact_name',
  'deck_url',
  'exact_amount',
  'terms',
  'narrative',
] as const

const PHONE = /\+?\d[\d\s()-]{7,}/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const INTRO_KIND_LABEL: Record<IntroKind, string> = {
  member: 'Member',
  mandate: 'Mandate',
  real_estate: 'Real estate',
  partner: 'Partner',
}

export function introStatusLabel(status: IntroStatus): string {
  if (status === 'pending') return 'Pending'
  if (status === 'accepted') return 'Accepted'
  if (status === 'approved') return 'Approved'
  return 'Declined'
}

export function introDirectionLabel(direction: IntroDirection): string {
  return direction === 'incoming' ? 'To you' : 'You sent'
}

/** Staff rows name who asked. Member rows keep To you / You sent instead. */
export function staffRequestLine(row: Pick<IntroRow, 'kind' | 'requester_name' | 'target_name'>): string | null {
  const requester = cleanName(row.requester_name)
  if (!requester) return null
  if (row.kind === 'member') {
    const target = cleanName(row.target_name)
    if (!target) return null
    return `Requested by ${requester} for ${target}`
  }
  return `Requested by ${requester}`
}

function cleanName(value: string | undefined): string {
  const name = (value ?? '').trim()
  if (!name || name.includes('@') || PHONE.test(name)) return ''
  return name
}

export function cleanIntroReason(raw: string): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = raw.trim()
  if (!reason) return { ok: false, error: 'Write a short reason.' }
  if (reason.length > INTRO_REASON_MAX) return { ok: false, error: 'Keep the reason under 280 characters.' }
  if (reason.includes('@')) return { ok: false, error: 'Leave email addresses out of the reason.' }
  if (PHONE.test(reason)) return { ok: false, error: 'Leave phone numbers out of the reason.' }
  return { ok: true, reason }
}

export function introRequestError(message: string): string {
  if (/sample_blocked/i.test(message)) return 'Sample cards cannot take a request.'
  if (/invalid_reason/i.test(message)) return 'Write a short reason without an email or a phone number.'
  if (/not_found/i.test(message)) return 'That member is not available.'
  if (/not_allowed/i.test(message)) return 'You cannot send that request.'
  if (/intro_limit/i.test(message)) return 'You have used this month\'s introductions.'
  return 'Could not send the request. Retry.'
}

export function introQuotaHint(remaining: number, allowance: number): string {
  const left = Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0
  const cap = Number.isFinite(allowance) ? Math.max(0, Math.floor(allowance)) : 0
  return `${left} of ${cap} left`
}

/** Contacts exist only for an accepted intro, and only for the two parties. */
export function introContactVisible(input: {
  viewerId: string
  requesterId: string
  targetId: string
  status: string
}): boolean {
  if (input.status !== 'accepted') return false
  return input.viewerId === input.requesterId || input.viewerId === input.targetId
}

export function riyadhMonthKey(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  return `${year}-${month}`
}

export function bookCallMailto(email: string): string | null {
  const clean = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return null
  return `mailto:${clean}?subject=${encodeURIComponent(INTRO_BOOK_SUBJECT)}`
}

export function safeProfileLink(value: string): string | null {
  const clean = value.trim()
  if (!/^https:\/\/\S+$/.test(clean)) return null
  if (clean.includes('@')) return null
  return clean
}

export function presentIntroContact(raw: unknown): IntroContact | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const introId = text(row.intro_id, 80)
  if (!UUID.test(introId)) return null
  const email = text(row.email, 320)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  const phone = text(row.phone, 40)
  if (phone && (phone.includes('@') || !PHONE.test(phone))) return null
  return {
    intro_id: introId,
    email,
    linkedin_url: safeProfileLink(text(row.linkedin_url, 500)) ?? '',
    phone,
    calendar_url: safeProfileLink(text(row.calendar_url, 500)) ?? '',
  }
}

export function presentIntroContacts(raw: unknown): IntroContact[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentIntroContact).filter((row): row is IntroContact => row != null)
}

export function contactsByIntro(rows: readonly IntroContact[]): Record<string, IntroContact> {
  const map: Record<string, IntroContact> = {}
  for (const row of rows) map[row.intro_id] = row
  return map
}

export function presentIntroQuota(raw: unknown): IntroQuota | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const used = countOf(row.used)
  const base = countOf(row.base)
  const allowance = countOf(row.allowance)
  const remaining = countOf(row.remaining)
  if (used == null || base == null || allowance == null || remaining == null) return null
  return { used, base, allowance, remaining }
}

export function cleanDeskIntroNote(raw: string): { ok: true; note: string } | { ok: false; error: string } {
  const note = raw.trim()
  if (note.length > 280) return { ok: false, error: 'Keep the note under 280 characters.' }
  return { ok: true, note }
}

export function deskIntroLine(
  row: Pick<IntroRow, 'kind' | 'status' | 'direction' | 'ask_desk' | 'desk_status'>,
  audience: 'member' | 'staff' = 'member',
): string | null {
  if (row.kind !== 'member' || !row.ask_desk || row.status === 'declined') return null
  if (audience === 'staff') {
    if (row.desk_status === 'sent') return 'Intro sent'
    if (row.status === 'accepted') return 'Desk intro queued'
    return 'Desk intro if accepted'
  }
  if (row.desk_status === 'sent') return 'Intro sent by the desk.'
  if (row.status === 'accepted') return 'The desk will introduce you.'
  if (row.direction === 'outgoing') return 'You asked the desk to introduce you.'
  return 'They asked the desk to introduce you.'
}

export function presentIntroRow(raw: unknown): IntroRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  for (const key of LEAK_KEYS) {
    const value = row[key]
    if (typeof value === 'string' && value.trim().length > 0) return null
  }
  const id = text(row.id, 80)
  const title = text(row.title, 200)
  const kind = isKind(row.kind) ? row.kind : null
  const status = isStatus(row.status) ? row.status : null
  const direction = row.direction === 'incoming' || row.direction === 'outgoing' ? row.direction : null
  const subject = text(row.subject_id, 80)
  const created = text(row.created_at, 40)
  if (!id || !title || !kind || !status || !direction || !UUID.test(subject)) return null
  const reason = text(row.reason, INTRO_REASON_MAX)
  if (reason.includes('@') || PHONE.test(reason)) return null
  const detail = text(row.detail, 240)
  if (detail.includes('@') || PHONE.test(detail)) return null
  if (title.includes('@')) return null
  const requester = cleanName(text(row.requester_name, 200))
  const target = cleanName(text(row.target_name, 200))
  if ((typeof row.requester_name === 'string' && row.requester_name.trim() && !requester) || (typeof row.target_name === 'string' && row.target_name.trim() && !target)) {
    return null
  }
  return {
    id,
    kind,
    direction,
    status,
    title,
    detail,
    reason,
    is_demo: row.is_demo === true,
    subject_id: subject,
    created_at: created,
    requester_name: requester || undefined,
    target_name: target || undefined,
    avatar_style: isStoredAvatarStyle(row.avatar_style) ? row.avatar_style : undefined,
    avatar_path: typeof row.avatar_path === 'string' && AVATAR_PATH.test(row.avatar_path) ? row.avatar_path : null,
    ask_desk: row.ask_desk === true,
    desk_status: row.desk_status === 'queued' || row.desk_status === 'sent' ? row.desk_status : undefined,
    meet_due: row.meet_due === true ? true : undefined,
    meet_outcome: isMeetOutcome(row.meet_outcome) ? row.meet_outcome : undefined,
  }
}

export function presentIntroList(raw: unknown): IntroRow[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentIntroRow).filter((row): row is IntroRow => row != null)
}

export function filterIntros(rows: readonly IntroRow[], kind: IntroKind | null): IntroRow[] {
  if (!kind) return [...rows]
  return rows.filter((row) => row.kind === kind)
}

export function outgoingMemberStatus(
  rows: readonly IntroRow[],
  targetId: string,
): IntroStatus | null {
  const hit = rows.find(
    (row) => row.kind === 'member' && row.direction === 'outgoing' && row.subject_id === targetId && !row.is_demo,
  )
  return hit?.status ?? null
}

function isKind(value: unknown): value is IntroKind {
  return typeof value === 'string' && (INTRO_KINDS as readonly string[]).includes(value)
}

function isStatus(value: unknown): value is IntroStatus {
  return typeof value === 'string' && (INTRO_STATUSES as readonly string[]).includes(value)
}

function isMeetOutcome(value: unknown): value is MeetOutcome {
  return typeof value === 'string' && (MEET_OUTCOMES as readonly string[]).includes(value)
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function countOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}
