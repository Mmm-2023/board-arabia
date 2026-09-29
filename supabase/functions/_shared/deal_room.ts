/**
 * Member deal room decisions and the invite letter.
 * Gmail uses the shared sender (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
 * GMAIL_REFRESH_TOKEN). When any of those is unset, nothing is sent.
 * No new secret. The invitee mailbox is read from members, never from the client.
 */

import { boardMail, publicSite, sendEmail, type SendResult } from './mail.ts'

export const DEAL_ROOM_FUNCTIONS = [
  'deal-room-create',
  'deal-room-invite',
  'deal-room-respond',
  'deal-room-manage',
  'deal-room-staff',
] as const

export type DealRoomFunction = (typeof DEAL_ROOM_FUNCTIONS)[number]

export type MemberStatus = 'none' | 'invited' | 'active' | 'suspended'
export type MemberSeat = 'ksa' | 'intl' | 'sponsor'
export type ParticipantState = 'none' | 'owner' | 'invited' | 'accepted' | 'declined' | 'removed'
export type RoomStatus = 'open' | 'closed' | 'archived'
export type OpenedBy = 'admin' | 'member'

export type DealAction =
  | 'create'
  | 'read'
  | 'invite'
  | 'accept'
  | 'decline'
  | 'rename'
  | 'add'
  | 'remove'
  | 'close'
  | 'archive'
  | 'list_all'
  | 'staff_close'

export type DealActor = {
  userId: string | null
  memberStatus: MemberStatus
  seat: MemberSeat | null
  staff: boolean
  participant: ParticipantState
}

export type DealRoomContext = {
  status: RoomStatus
  openedBy: OpenedBy
}

export type DealTarget = {
  userId: string
  memberStatus: MemberStatus
  seat: MemberSeat | null
}

export type DealDecision =
  | { allow: true }
  | { allow: false; status: 401 | 403 | 404 | 409; reason: string }

const MEMBER_ACTIONS: DealAction[] = [
  'create',
  'invite',
  'accept',
  'decline',
  'rename',
  'add',
  'remove',
  'close',
  'archive',
]

export function isActiveMember(actor: {
  memberStatus: MemberStatus
  seat: MemberSeat | null
}): boolean {
  return actor.memberStatus === 'active' && (actor.seat === 'ksa' || actor.seat === 'intl' || actor.seat === 'sponsor')
}

/** Active founding member, or a sponsor whose seat is active. Invited sponsors are not approved. */
export function isInvitableMember(target: {
  memberStatus: MemberStatus
  seat: MemberSeat | null
} | null): boolean {
  if (!target) return false
  return isActiveMember(target)
}

export function participantState(row: { role?: string | null; invite_status?: string | null } | null): ParticipantState {
  if (!row) return 'none'
  if (row.role === 'owner' && row.invite_status === 'accepted') return 'owner'
  if (row.invite_status === 'invited') return 'invited'
  if (row.invite_status === 'accepted') return 'accepted'
  if (row.invite_status === 'declined') return 'declined'
  if (row.invite_status === 'removed') return 'removed'
  return 'none'
}

export function canReadDealRoom(actor: DealActor): boolean {
  if (actor.staff) return true
  return actor.participant === 'owner' || actor.participant === 'invited' || actor.participant === 'accepted'
}

export function decideDealRoom(input: {
  actor: DealActor
  action: DealAction
  room?: DealRoomContext | null
  target?: DealTarget | null
  targetParticipant?: ParticipantState
}): DealDecision {
  const { actor, action } = input
  if (!actor.userId) return deny(401, 'not_authenticated')

  if (action === 'list_all' || action === 'staff_close') {
    if (!actor.staff) return deny(403, 'not_staff')
  } else if (MEMBER_ACTIONS.includes(action) && !isActiveMember(actor)) {
    return deny(403, 'not_active_member')
  }

  if (action === 'create') return { allow: true }
  if (action === 'list_all') return { allow: true }
  if (action === 'read') {
    if (!canReadDealRoom(actor)) return deny(403, 'not_participant')
    return { allow: true }
  }

  const room = input.room
  if (action === 'staff_close') {
    if (!room) return deny(404, 'not_found')
    if (room.status !== 'open') return deny(409, 'not_open')
    return { allow: true }
  }

  const owner = actor.participant === 'owner' && isActiveMember(actor)

  if (action === 'invite' || action === 'add') {
    if (!owner) return deny(403, 'not_owner')
    if (!room || room.openedBy !== 'member') return deny(404, 'not_found')
    if (room.status === 'archived') return deny(409, 'room_archived')
    if (room.status !== 'open') return deny(409, 'room_closed')
    if (!input.target) return deny(404, 'not_found')
    if (input.target.userId === actor.userId) return deny(403, 'cannot_invite_self')
    if (!isInvitableMember(input.target)) return deny(403, 'not_invitable')
    return { allow: true }
  }

  if (action === 'accept' || action === 'decline') {
    if (actor.participant !== 'invited') return deny(403, 'not_invitee')
    if (!room) return deny(404, 'not_found')
    if (room.status === 'archived') return deny(409, 'room_archived')
    if (action === 'accept' && room.status !== 'open') return deny(409, 'room_closed')
    return { allow: true }
  }

  if (action === 'rename' || action === 'remove' || action === 'archive') {
    if (!owner) return deny(403, 'not_owner')
    if (!room || room.openedBy !== 'member') return deny(404, 'not_found')
    if (room.status === 'archived') return deny(409, 'room_archived')
    if (action === 'remove') {
      if (!input.target) return deny(404, 'not_found')
      if (input.target.userId === actor.userId || input.targetParticipant === 'owner') {
        return deny(403, 'cannot_remove_owner')
      }
      if (!input.targetParticipant || input.targetParticipant === 'none' || input.targetParticipant === 'removed') {
        return deny(404, 'not_found')
      }
    }
    return { allow: true }
  }

  if (action === 'close') {
    if (!owner) return deny(403, 'not_owner')
    if (!room || room.openedBy !== 'member') return deny(404, 'not_found')
    if (room.status !== 'open') return deny(409, 'not_open')
    return { allow: true }
  }

  return deny(403, 'not_allowed')
}

function deny(status: 401 | 403 | 404 | 409, reason: string): DealDecision {
  return { allow: false, status, reason }
}

const OAUTH_SECRETS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const

const MAILBOX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type DealRoomInviteJob = {
  to: string
  roomName: string
  purpose: string
  ownerName: string
}

export type DealRoomInviteOutcome = {
  status: 'sent' | 'skipped' | 'error'
  detail: string
}

function readEnv(name: string): string {
  const runtime = globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }
  const fromDeno = runtime.Deno?.env?.get?.(name)
  if (fromDeno && fromDeno.trim()) return fromDeno.trim()
  const fromNode = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return fromNode?.trim() || ''
}

/** Secret names that are missing. Values are never returned. */
export function missingDealRoomMailSecrets(): string[] {
  const missing: string[] = []
  for (const name of OAUTH_SECRETS) {
    if (!readEnv(name)) missing.push(name)
  }
  return missing
}

function clip(value: string, max: number): string {
  const clean = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 3)}...`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function dealRoomInviteMail(job: DealRoomInviteJob): { subject: string; text: string; html: string } {
  const roomName = clip(job.roomName, 160) || 'Deal room'
  const purpose = clip(job.purpose, 400) || 'A private conversation.'
  const ownerName = clip(job.ownerName, 200) || 'A Board Arabia member'
  const href = `${publicSite()}/dashboard/rooms`
  const subject = 'You are invited to a Board Arabia deal room'
  const letter = boardMail(
    [
      'Hello,',
      '',
      `${ownerName} invited you to the deal room "${roomName}".`,
      '',
      `Purpose: ${purpose}`,
      '',
      'Open your rooms:',
      href,
    ].join('\n'),
    [
      '<p>Hello,</p>',
      `<p>${escapeHtml(ownerName)} invited you to the deal room "${escapeHtml(roomName)}".</p>`,
      `<p>Purpose: ${escapeHtml(purpose)}</p>`,
      `<p><a href="${escapeHtml(href)}">Open your rooms</a></p>`,
    ].join('\n'),
  )
  return { subject, text: letter.text, html: letter.html }
}

export function redactDealRoomDetail(detail: string): string {
  return detail.replace(/[\w.+-]+@[\w.-]+/g, '[redacted]').slice(0, 200)
}

export async function sendDealRoomInvite(
  job: DealRoomInviteJob,
  options?: {
    send?: (opts: { to: string; subject: string; html: string; text: string }) => Promise<SendResult>
    log?: (line: string) => void
  },
): Promise<DealRoomInviteOutcome> {
  const log = options?.log ?? ((line: string) => {
    console.warn(line)
  })
  const missing = missingDealRoomMailSecrets()
  if (missing.length > 0) {
    const detail = `${missing.join(', ')} unset`
    log(`deal_room_invite warning: ${detail}`)
    return { status: 'skipped', detail }
  }
  const to = job.to.trim()
  if (!MAILBOX.test(to) || to.length > 320) {
    log('deal_room_invite warning: invitee mailbox missing')
    return { status: 'skipped', detail: 'invitee mailbox missing' }
  }
  try {
    const message = dealRoomInviteMail({ ...job, to })
    const send = options?.send ?? sendEmail
    const result = await send({ to, subject: message.subject, text: message.text, html: message.html })
    if (result.status !== 'sent') {
      const detail = redactDealRoomDetail(result.detail || 'Deal room invite was not sent.')
      log(`deal_room_invite warning: ${detail}`)
      return { status: result.status === 'dry_run' ? 'skipped' : 'error', detail }
    }
    return { status: 'sent', detail: '' }
  } catch (err) {
    const detail = redactDealRoomDetail(err instanceof Error ? err.message : 'Deal room invite failed.')
    log(`deal_room_invite warning: ${detail}`)
    return { status: 'error', detail }
  }
}

let tail: Promise<void> = Promise.resolve()

/** Fire and forget. The caller does not wait, and a mail failure does not change the invite. */
export function deliverDealRoomInvite(work: Promise<unknown>): void {
  const task = Promise.resolve(work).then(
    () => undefined,
    (err: unknown) => {
      const detail = redactDealRoomDetail(err instanceof Error ? err.message : 'Deal room invite failed.')
      console.warn(`deal_room_invite warning: ${detail}`)
    },
  )
  const current = tail
  tail = current.then(() => task).then(
    () => undefined,
    () => undefined,
  )
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }).EdgeRuntime
  try {
    runtime?.waitUntil?.(task)
  } catch {
    // The invite result is already decided.
  }
}

export function dealRoomInviteSettled(): Promise<void> {
  return tail
}
