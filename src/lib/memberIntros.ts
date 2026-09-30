/** Warm intros and the folded unlock list. Contact fields never pass through. */

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
  avatar_style?: 'male' | 'female'
  avatar_path?: string | null
}

const AVATAR_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar$/i

export function introHasPortrait(row: Pick<IntroRow, 'kind' | 'avatar_style' | 'avatar_path'>): boolean {
  return row.kind === 'member' || row.avatar_style === 'male' || row.avatar_style === 'female' || Boolean(row.avatar_path)
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
  return 'Could not send the request. Retry.'
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
    avatar_style: row.avatar_style === 'female' ? 'female' : row.avatar_style === 'male' ? 'male' : undefined,
    avatar_path: typeof row.avatar_path === 'string' && AVATAR_PATH.test(row.avatar_path) ? row.avatar_path : null,
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

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}
