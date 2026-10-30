import { jsonResponse } from './mail.ts'
import type { MajlisMailEvent, ReminderKind } from './majlis_mail.ts'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const KINDS = new Set<ReminderKind>(['t7', 't1', 't1h', 'live'])

export type DueReminder = {
  rsvp_id: string
  kind: ReminderKind
  member_id: string
  email: string
  event: MajlisMailEvent
  format: string
  meet_ready: boolean
  audience: 'member' | 'guest'
}

export type ReminderWindowInput = {
  kind: ReminderKind
  startsAtMs: number
  nowMs: number
  status: string
  eventStatus: string
  registeredAtMs: number
  claimed: boolean
}

export type ReminderDeps = {
  env: (name: string) => string | undefined
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
  mail: (row: DueReminder) => Promise<{ status: string; detail?: string }>
}

/** Only the exact string true turns sending on. */
export function remindersEnabled(value: string | undefined | null): boolean {
  return value === 'true'
}

/**
 * Fixed clock window. t7 and t1 match the existing bounds.
 * t1h is 45 to 75 minutes before start.
 * live is from start through 15 minutes after start.
 * A t1h or live row registered after that window closed is not due.
 */
export function reminderIsDue(input: ReminderWindowInput): boolean {
  if (input.claimed) return false
  if (input.eventStatus !== 'published') return false
  if (input.status !== 'registered' && input.status !== 'accepted') return false
  if (!Number.isFinite(input.startsAtMs) || !Number.isFinite(input.nowMs) || !Number.isFinite(input.registeredAtMs)) {
    return false
  }
  const until = input.startsAtMs - input.nowMs
  if (input.kind === 't7') return until > DAY_MS && until <= 7 * DAY_MS
  if (input.kind === 't1') return until > 0 && until <= DAY_MS
  if (input.kind === 't1h') {
    return (
      until >= 45 * MINUTE_MS &&
      until <= 75 * MINUTE_MS &&
      input.registeredAtMs <= input.startsAtMs - 45 * MINUTE_MS
    )
  }
  const after = input.nowMs - input.startsAtMs
  return after >= 0 && after <= 15 * MINUTE_MS && input.registeredAtMs <= input.startsAtMs + 15 * MINUTE_MS
}

/** Second claim fails. Waitlist and cancelled rows fail. */
export function claimReminderStamp(input: { status: string; stamp: string | null }): boolean {
  if (input.status !== 'registered' && input.status !== 'accepted') return false
  if (input.stamp) return false
  return true
}

export function countByKind(rows: readonly DueReminder[]): Record<ReminderKind, number> {
  const counts: Record<ReminderKind, number> = { t7: 0, t1: 0, t1h: 0, live: 0 }
  for (const row of rows) counts[row.kind] += 1
  return counts
}

export function normalizeDue(data: unknown): DueReminder[] {
  if (!Array.isArray(data)) return []
  const rows: DueReminder[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const kind = row.kind
    if (typeof kind !== 'string' || !KINDS.has(kind as ReminderKind)) continue
    const rsvpId = text(row.rsvp_id)
    const memberId = text(row.member_id)
    const email = text(row.email).trim()
    const eventId = text(row.event_id) || text(row.id)
    const startsAt = text(row.starts_at)
    const endsAt = text(row.ends_at)
    const title = text(row.title)
    if (!rsvpId || !memberId || !email || !eventId || !startsAt || !endsAt || !title) continue
    rows.push({
      rsvp_id: rsvpId,
      kind: kind as ReminderKind,
      member_id: memberId,
      email,
      format: text(row.format) || 'in_person',
      meet_ready: row.meet_ready === true,
      audience: row.audience === 'guest' ? 'guest' : 'member',
      event: {
        id: eventId,
        title,
        region: text(row.region),
        starts_at: startsAt,
        ends_at: endsAt,
        venue_name: text(row.venue_name),
        venue_address: row.venue_address == null ? null : text(row.venue_address),
        venue_visibility: text(row.venue_visibility),
        capacity: typeof row.capacity === 'number' ? row.capacity : Number(row.capacity) || 0,
      },
    })
  }
  return rows
}

export async function runMajlisReminders(req: Request, deps: ReminderDeps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-majlis-cron',
      },
    })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)
  if (!authorized(req, deps.env)) return jsonResponse(req, { error: 'Unauthorized' }, 401)
  const supabaseUrl = deps.env('SUPABASE_URL') ?? ''
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const enabled = remindersEnabled(deps.env('MAJLIS_REMINDERS_ENABLED'))
  const dueResult = await deps.rpc('majlis_due_reminders')
  if (dueResult.error) return jsonResponse(req, { error: 'Could not read due reminders.' }, 500)
  const due = normalizeDue(dueResult.data)

  if (!enabled) {
    return jsonResponse(req, { enabled: false, would_send: countByKind(due) })
  }

  let t7 = 0
  let t1 = 0
  let t1h = 0
  let live = 0
  let failed = 0
  for (const row of due) {
    const blocked = await deps.rpc('service_event_reminder_blocked', { p_user: row.member_id })
    if (blocked.error || blocked.data !== false) continue
    const claimed = await deps.rpc('majlis_claim_reminder', { p_rsvp: row.rsvp_id, p_kind: row.kind })
    if (claimed.error || claimed.data !== true) continue
    const sent = await deps.mail(row)
    if (sent.detail === 'suppressed') continue
    if (sent.status !== 'sent') {
      failed += 1
      await deps.rpc('majlis_release_reminder', { p_rsvp: row.rsvp_id, p_kind: row.kind })
      continue
    }
    if (row.kind === 't7') t7 += 1
    else if (row.kind === 't1') t1 += 1
    else if (row.kind === 't1h') t1h += 1
    else live += 1
  }

  return jsonResponse(req, { ok: true, t7, t1, t1h, live, failed })
}

function authorized(req: Request, env: ReminderDeps['env']): boolean {
  const cron = env('MAJLIS_CRON_SECRET')?.trim() || ''
  const header = req.headers.get('x-majlis-cron')?.trim() || ''
  if (cron && header && safeEqual(cron, header)) return true
  const service = env('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (service && bearer && safeEqual(service, bearer)) return true
  return false
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
