/**
 * Member deal rooms go through the DR-A Edge functions and member RPCs.
 * Do not select rooms or room_participants from the client.
 */
import { schemaMissing } from './demoRows'
import {
  presentDirectoryInvitees,
  presentMyDealRooms,
  presentRoomId,
  presentStaffDealRooms,
  type CreateRoomBody,
  type DirectoryInvitee,
  type MemberDealRoom,
  type StaffDealRoom,
} from './dealRoomView'
import { supabase } from './supabase'

export type DealLoad<T> =
  | { status: 'ready'; rows: T }
  | { status: 'missing' }
  | { status: 'denied'; message: string }
  | { status: 'error'; message: string }

export type DealActionResult =
  | { status: 'ok'; roomId: string | null }
  | { status: 'denied'; message: string }
  | { status: 'error'; message: string }

const SAVE_ERROR = "Couldn't save. Retry."
const REFRESH_ERROR = "Couldn't refresh. Showing last update …"
const DENIED_MEMBER = 'Deal rooms are for active members.'
const DENIED_STAFF = 'This list is for staff.'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const functionsBase = `${url.replace(/\/$/, '')}/functions/v1`

export function fetchMyDealRooms(): Promise<DealLoad<MemberDealRoom[]>> {
  return loadRows(() => supabase.rpc('list_my_deal_rooms'), presentMyDealRooms, DENIED_MEMBER)
}

export function searchDealDirectory(query: string): Promise<DealLoad<DirectoryInvitee[]>> {
  return loadRows(
    () => supabase.rpc('search_deal_room_directory', { p_query: query }),
    presentDirectoryInvitees,
    DENIED_MEMBER,
  )
}

export function createDealRoom(body: CreateRoomBody): Promise<DealActionResult> {
  return postDeal('deal-room-create', body)
}

export function inviteDealRoom(roomId: string, memberId: string): Promise<DealActionResult> {
  return postDeal('deal-room-invite', { room_id: roomId, member_id: memberId })
}

export function respondDealRoom(roomId: string, decision: 'accept' | 'decline'): Promise<DealActionResult> {
  return postDeal('deal-room-respond', { room_id: roomId, decision })
}

export function manageDealRoom(body: {
  roomId: string
  action: 'rename' | 'add' | 'remove' | 'close' | 'archive'
  name?: string | null
  purpose?: string | null
  memberId?: string | null
}): Promise<DealActionResult> {
  return postDeal('deal-room-manage', {
    room_id: body.roomId,
    action: body.action,
    name: body.name ?? null,
    purpose: body.purpose ?? null,
    member_id: body.memberId ?? null,
  })
}

export function listStaffDealRooms(): Promise<DealLoad<StaffDealRoom[]>> {
  return postDealList()
}

export function closeStaffDealRoom(roomId: string): Promise<DealActionResult> {
  return postDeal('deal-room-staff', { action: 'close', room_id: roomId })
}

async function loadRows<T>(
  call: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  present: (data: unknown) => T,
  denied: string,
): Promise<DealLoad<T>> {
  const { data, error } = await call()
  if (error) {
    if (schemaMissing(error.message)) return { status: 'missing' }
    if (isDenied(error.message)) return { status: 'denied', message: denied }
    return { status: 'error', message: REFRESH_ERROR }
  }
  return { status: 'ready', rows: present(data) }
}

async function postDeal(name: string, body: unknown): Promise<DealActionResult> {
  try {
    const headers = await memberHeaders()
    if (!headers) return { status: 'denied', message: 'Sign in to continue.' }
    const res = await fetch(`${functionsBase}/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const payload = (await res.json().catch(() => ({}))) as { error?: unknown }
    if (res.status === 401 || res.status === 403) {
      return { status: 'denied', message: messageOf(payload, 'Not allowed') }
    }
    if (!res.ok) return { status: 'error', message: messageOf(payload, SAVE_ERROR) }
    return { status: 'ok', roomId: presentRoomId(payload) }
  } catch {
    return { status: 'error', message: SAVE_ERROR }
  }
}

async function postDealList(): Promise<DealLoad<StaffDealRoom[]>> {
  try {
    const headers = await memberHeaders()
    if (!headers) return { status: 'denied', message: 'Sign in to continue.' }
    const res = await fetch(`${functionsBase}/deal-room-staff`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'list' }),
    })
    const payload = (await res.json().catch(() => ({}))) as { error?: unknown }
    if (res.status === 401 || res.status === 403) {
      return { status: 'denied', message: messageOf(payload, DENIED_STAFF) }
    }
    if (!res.ok) return { status: 'error', message: REFRESH_ERROR }
    return { status: 'ready', rows: presentStaffDealRooms(payload) }
  } catch {
    return { status: 'error', message: REFRESH_ERROR }
  }
}

async function memberHeaders(): Promise<HeadersInit | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  return {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  }
}

function messageOf(payload: { error?: unknown }, fallback: string): string {
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim().slice(0, 240)
  return fallback
}

function isDenied(message: string): boolean {
  return /not_allowed|not_active_member|not_authenticated|not_staff/i.test(message)
}
