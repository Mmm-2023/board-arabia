/**
 * Deal room HTTP. Each endpoint checks the caller before it writes.
 * Member endpoints require an active member. The staff endpoint requires staff.
 * Invite mail is scheduled after the row is saved and is never awaited.
 */

import { corsHeaders, jsonResponse } from './mail.ts'
import {
  decideDealRoom,
  type DealAction,
  type DealActor,
  type DealRoomContext,
  type DealTarget,
  type MemberSeat,
  type MemberStatus,
  type ParticipantState,
} from './deal_room.ts'

export type DealEndpoint = 'create' | 'invite' | 'respond' | 'manage' | 'staff'

export type DealCaller = {
  userId: string
  memberStatus: MemberStatus
  seat: MemberSeat | null
  staff: boolean
  /** Present when the Edge session read aal from the verified token. */
  aal?: string | null
}

export type DealGate = {
  caller: DealCaller
  loadRoom: (roomId: string) => Promise<DealRoomContext | null>
  loadParticipant: (roomId: string, userId: string) => Promise<ParticipantState>
  loadTarget: (memberId: string) => Promise<DealTarget | null>
  call: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
}

export type DealOpenFailure = { error: string; status: number; code?: string }

export type DealRoomDeps = {
  open: (req: Request) => Promise<DealGate | DealOpenFailure>
  deliverInvite: (job: { to: string; roomName: string; purpose: string; ownerName: string }) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REASONS: Record<string, { status: number; error: string }> = {
  not_authenticated: { status: 401, error: 'Unauthorized' },
  forbidden: { status: 403, error: 'Not allowed' },
  not_allowed: { status: 403, error: 'Not allowed' },
  not_active_member: { status: 403, error: 'Only an active member can do this.' },
  not_owner: { status: 403, error: 'Only the room owner can do this.' },
  not_invitee: { status: 403, error: 'Only the invited member can respond.' },
  not_staff: { status: 403, error: 'Not staff' },
  not_participant: { status: 403, error: 'Not allowed' },
  not_invitable: { status: 403, error: 'That person cannot be invited.' },
  cannot_invite_self: { status: 400, error: 'You cannot invite yourself.' },
  cannot_remove_owner: { status: 400, error: 'The owner stays on the room.' },
  not_found: { status: 404, error: 'Not found' },
  invalid_name: { status: 400, error: 'Enter a room name.' },
  invalid_purpose: { status: 400, error: 'Enter a purpose.' },
  invalid_subject: { status: 400, error: 'Link a mandate or a real estate opportunity, not both.' },
  invalid_action: { status: 400, error: 'That action is not available.' },
  invalid_decision: { status: 400, error: 'Choose accept or decline.' },
  already_participant: { status: 409, error: 'That person is already in the room.' },
  room_closed: { status: 409, error: 'This room is closed.' },
  room_archived: { status: 409, error: 'This room is archived.' },
  not_open: { status: 409, error: 'This room is not open.' },
  room_full: { status: 409, error: 'This room is full.' },
  room_origin_locked: { status: 409, error: 'This room cannot change origin.' },
}

export async function handleDealRoom(req: Request, endpoint: DealEndpoint, deps: DealRoomDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const opened = await deps.open(req)
  if ('error' in opened) {
    const code = 'code' in opened ? opened.code : undefined
    return jsonResponse(req, code ? { error: opened.error, code } : { error: opened.error }, opened.status)
  }

  const early = endpointGate(endpoint, opened.caller)
  if (!early.allow) return jsonResponse(req, reasonBody(early.reason), early.status)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (endpoint === 'create') return createRoom(req, opened, body)
  if (endpoint === 'invite') return inviteRoom(req, opened, body, deps)
  if (endpoint === 'respond') return respondRoom(req, opened, body)
  if (endpoint === 'manage') return manageRoom(req, opened, body, deps)
  return staffRoom(req, opened, body)
}

function endpointGate(endpoint: DealEndpoint, caller: DealCaller): { allow: true } | { allow: false; status: 401 | 403; reason: string } {
  if (!caller.userId) return { allow: false, status: 401, reason: 'not_authenticated' }
  if (endpoint === 'staff') {
    if (!caller.staff) return { allow: false, status: 403, reason: 'not_staff' }
    return { allow: true }
  }
  const decision = decideDealRoom({
    actor: { ...caller, participant: 'none' },
    action: 'create',
  })
  if (!decision.allow) return { allow: false, status: decision.status === 401 ? 401 : 403, reason: decision.reason }
  return { allow: true }
}

async function createRoom(req: Request, gate: DealGate, body: unknown): Promise<Response> {
  const parsed = parseCreate(body)
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status)
  const decision = decideDealRoom({ actor: actorOf(gate, 'none'), action: 'create' })
  if (!decision.allow) return jsonResponse(req, reasonBody(decision.reason), decision.status)
  const result = await gate.call('create_member_deal_room', {
    p_actor: gate.caller.userId,
    p_name: parsed.name,
    p_purpose: parsed.purpose,
    p_mandate_id: parsed.mandateId,
    p_re_opportunity_id: parsed.reOpportunityId,
  })
  return rpcResponse(req, result)
}

async function inviteRoom(req: Request, gate: DealGate, body: unknown, deps: DealRoomDeps): Promise<Response> {
  const parsed = parseInvite(body)
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status)
  const allowed = await ownerInviteDecision(gate, parsed.roomId, parsed.memberId, 'invite')
  if (!allowed.allow) return jsonResponse(req, reasonBody(allowed.reason), allowed.status)
  const result = await gate.call('invite_member_deal_room', {
    p_actor: gate.caller.userId,
    p_room_id: parsed.roomId,
    p_member_id: parsed.memberId,
  })
  return inviteResponse(req, result, deps)
}

async function respondRoom(req: Request, gate: DealGate, body: unknown): Promise<Response> {
  const parsed = parseRespond(body)
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status)
  const room = await gate.loadRoom(parsed.roomId)
  const participant = await gate.loadParticipant(parsed.roomId, gate.caller.userId)
  const decision = decideDealRoom({
    actor: actorOf(gate, participant),
    action: parsed.decision,
    room,
  })
  if (!decision.allow) return jsonResponse(req, reasonBody(decision.reason), decision.status)
  const result = await gate.call('respond_member_deal_room', {
    p_actor: gate.caller.userId,
    p_room_id: parsed.roomId,
    p_decision: parsed.decision,
  })
  return rpcResponse(req, result)
}

async function manageRoom(req: Request, gate: DealGate, body: unknown, deps: DealRoomDeps): Promise<Response> {
  const parsed = parseManage(body)
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status)
  const room = await gate.loadRoom(parsed.roomId)
  const participant = await gate.loadParticipant(parsed.roomId, gate.caller.userId)
  const target = parsed.memberId ? await gate.loadTarget(parsed.memberId) : null
  const targetParticipant = parsed.memberId
    ? await gate.loadParticipant(parsed.roomId, parsed.memberId)
    : undefined
  const action: DealAction = parsed.action === 'add' ? 'add' : parsed.action
  const decision = decideDealRoom({
    actor: actorOf(gate, participant),
    action,
    room,
    target,
    targetParticipant,
  })
  if (!decision.allow) return jsonResponse(req, reasonBody(decision.reason), decision.status)
  const result = await gate.call('manage_member_deal_room', {
    p_actor: gate.caller.userId,
    p_room_id: parsed.roomId,
    p_action: parsed.action,
    p_name: parsed.name,
    p_purpose: parsed.purpose,
    p_member_id: parsed.memberId,
  })
  if (parsed.action === 'add') return inviteResponse(req, result, deps)
  return rpcResponse(req, result)
}

async function staffRoom(req: Request, gate: DealGate, body: unknown): Promise<Response> {
  const parsed = parseStaff(body)
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status)
  if (parsed.action === 'list') {
    const decision = decideDealRoom({ actor: actorOf(gate, 'none'), action: 'list_all' })
    if (!decision.allow) return jsonResponse(req, reasonBody(decision.reason), decision.status)
    const result = await gate.call('list_all_deal_rooms', {
      p_actor: gate.caller.userId,
      p_aal: gate.caller.aal || '',
    })
    return rpcResponse(req, result)
  }
  const room = await gate.loadRoom(parsed.roomId)
  const decision = decideDealRoom({
    actor: actorOf(gate, 'none'),
    action: 'staff_close',
    room,
  })
  if (!decision.allow) return jsonResponse(req, reasonBody(decision.reason), decision.status)
  const result = await gate.call('close_any_deal_room', {
    p_actor: gate.caller.userId,
    p_aal: gate.caller.aal || '',
    p_room_id: parsed.roomId,
  })
  return rpcResponse(req, result)
}

async function ownerInviteDecision(
  gate: DealGate,
  roomId: string,
  memberId: string,
  action: 'invite' | 'add',
) {
  const room = await gate.loadRoom(roomId)
  const participant = await gate.loadParticipant(roomId, gate.caller.userId)
  const target = await gate.loadTarget(memberId)
  return decideDealRoom({
    actor: actorOf(gate, participant),
    action,
    room,
    target,
  })
}

function actorOf(gate: DealGate, participant: ParticipantState): DealActor {
  return { ...gate.caller, participant }
}

function inviteResponse(
  req: Request,
  result: { data: unknown; error: { message: string } | null },
  deps: DealRoomDeps,
): Response {
  if (result.error) return jsonResponse(req, reasonBody(reasonFrom(result.error.message)), statusFrom(result.error.message))
  const job = inviteJob(result.data)
  if (job) {
    try {
      deps.deliverInvite(job)
    } catch {
      console.warn('deal_room_invite warning: invite mail was not scheduled')
    }
  }
  return jsonResponse(req, publicPayload(result.data))
}

function rpcResponse(req: Request, result: { data: unknown; error: { message: string } | null }): Response {
  if (result.error) return jsonResponse(req, reasonBody(reasonFrom(result.error.message)), statusFrom(result.error.message))
  return jsonResponse(req, publicPayload(result.data))
}

export function inviteJob(data: unknown): { to: string; roomName: string; purpose: string; ownerName: string } | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  const to = typeof row.invitee_email === 'string' ? row.invitee_email.trim() : ''
  if (!to) return null
  return {
    to,
    roomName: typeof row.room_name === 'string' ? row.room_name : 'Deal room',
    purpose: typeof row.purpose === 'string' ? row.purpose : '',
    ownerName: typeof row.owner_name === 'string' ? row.owner_name : 'A Board Arabia member',
  }
}

export function publicPayload(data: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { ok: true }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (/email/i.test(key)) continue
    out[key] = value
  }
  return out
}

function reasonFrom(message: string): string {
  for (const reason of Object.keys(REASONS)) {
    if (message.includes(reason)) return reason
  }
  return 'forbidden'
}

function statusFrom(message: string): number {
  return REASONS[reasonFrom(message)]?.status ?? 403
}

function reasonBody(reason: string): { error: string } {
  return { error: REASONS[reason]?.error || 'Not allowed' }
}

function parseCreate(body: unknown):
  | { ok: true; name: string; purpose: string; mandateId: string | null; reOpportunityId: string | null }
  | { ok: false; status: number; error: string } {
  const row = record(body)
  if (!row) return { ok: false, status: 400, error: 'Invalid JSON' }
  const name = cleanLine(row.name, 1, 160)
  const purpose = cleanLine(row.purpose, 1, 400)
  if (!name) return { ok: false, status: 400, error: REASONS.invalid_name.error }
  if (!purpose) return { ok: false, status: 400, error: REASONS.invalid_purpose.error }
  const mandateId = optionalUuid(row.mandate_id)
  const reOpportunityId = optionalUuid(row.re_opportunity_id)
  if (mandateId === false || reOpportunityId === false) return { ok: false, status: 400, error: 'Not found' }
  if (mandateId && reOpportunityId) return { ok: false, status: 400, error: REASONS.invalid_subject.error }
  return { ok: true, name, purpose, mandateId, reOpportunityId }
}

function parseInvite(body: unknown):
  | { ok: true; roomId: string; memberId: string }
  | { ok: false; status: number; error: string } {
  const row = record(body)
  if (!row) return { ok: false, status: 400, error: 'Invalid JSON' }
  const roomId = requiredUuid(row.room_id)
  const memberId = requiredUuid(row.member_id)
  if (!roomId || !memberId) return { ok: false, status: 400, error: 'room_id and member_id are required.' }
  return { ok: true, roomId, memberId }
}

function parseRespond(body: unknown):
  | { ok: true; roomId: string; decision: 'accept' | 'decline' }
  | { ok: false; status: number; error: string } {
  const row = record(body)
  if (!row) return { ok: false, status: 400, error: 'Invalid JSON' }
  const roomId = requiredUuid(row.room_id)
  const decision = row.decision === 'accept' || row.decision === 'decline' ? row.decision : null
  if (!roomId) return { ok: false, status: 400, error: 'room_id is required.' }
  if (!decision) return { ok: false, status: 400, error: REASONS.invalid_decision.error }
  return { ok: true, roomId, decision }
}

function parseManage(body: unknown):
  | {
      ok: true
      roomId: string
      action: 'rename' | 'add' | 'remove' | 'close' | 'archive'
      name: string | null
      purpose: string | null
      memberId: string | null
    }
  | { ok: false; status: number; error: string } {
  const row = record(body)
  if (!row) return { ok: false, status: 400, error: 'Invalid JSON' }
  const roomId = requiredUuid(row.room_id)
  const action = row.action
  if (!roomId) return { ok: false, status: 400, error: 'room_id is required.' }
  if (action !== 'rename' && action !== 'add' && action !== 'remove' && action !== 'close' && action !== 'archive') {
    return { ok: false, status: 400, error: REASONS.invalid_action.error }
  }
  const name = row.name == null || row.name === '' ? null : cleanLine(row.name, 1, 160)
  const purpose = row.purpose == null || row.purpose === '' ? null : cleanLine(row.purpose, 1, 400)
  if (action === 'rename' && !name) return { ok: false, status: 400, error: REASONS.invalid_name.error }
  if ((action === 'rename' || action === 'add' || action === 'remove') && row.purpose != null && row.purpose !== '' && !purpose) {
    return { ok: false, status: 400, error: REASONS.invalid_purpose.error }
  }
  const memberId = row.member_id == null || row.member_id === '' ? null : requiredUuid(row.member_id)
  if ((action === 'add' || action === 'remove') && !memberId) {
    return { ok: false, status: 400, error: 'member_id is required.' }
  }
  if (row.member_id != null && row.member_id !== '' && memberId === null && (action === 'add' || action === 'remove')) {
    return { ok: false, status: 400, error: 'member_id is required.' }
  }
  return { ok: true, roomId, action, name, purpose, memberId }
}

function parseStaff(body: unknown):
  | { ok: true; action: 'list'; roomId: '' }
  | { ok: true; action: 'close'; roomId: string }
  | { ok: false; status: number; error: string } {
  const row = record(body)
  if (!row) return { ok: false, status: 400, error: 'Invalid JSON' }
  if (row.action === 'list') return { ok: true, action: 'list', roomId: '' }
  if (row.action === 'close') {
    const roomId = requiredUuid(row.room_id)
    if (!roomId) return { ok: false, status: 400, error: 'room_id is required.' }
    return { ok: true, action: 'close', roomId }
  }
  return { ok: false, status: 400, error: REASONS.invalid_action.error }
}

function record(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  return body as Record<string, unknown>
}

function cleanLine(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length < min || clean.length > max) return null
  return clean
}

function requiredUuid(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID.test(value)) return null
  return value
}

function optionalUuid(value: unknown): string | null | false {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !UUID.test(value)) return false
  return value
}
