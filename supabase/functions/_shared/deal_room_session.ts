import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { participantState, type DealRoomContext, type DealTarget, type MemberSeat, type MemberStatus, type ParticipantState } from './deal_room.ts'
import type { DealGate } from './deal_room_http.ts'

type MemberRow = { status?: string | null; seat?: string | null } | null
type StaffRow = { role?: string | null } | null
type RoomRow = { status?: string | null; opened_by?: string | null } | null
type ParticipantRow = { role?: string | null; invite_status?: string | null } | null

export async function openDealGate(req: Request): Promise<DealGate | { error: string; status: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const header = req.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!supabaseUrl || !serviceKey || !anonKey || !token) {
    return { error: 'Unauthorized', status: 401 }
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)
  if (userError || !user) return { error: 'Unauthorized', status: 401 }

  const admin = createClient(supabaseUrl, serviceKey)
  const [memberResult, staffResult] = await Promise.all([
    admin.from('members').select('status, seat').eq('user_id', user.id).maybeSingle(),
    admin.from('staff_users').select('role').eq('user_id', user.id).maybeSingle(),
  ])

  const caller = {
    userId: user.id,
    memberStatus: memberStatus(memberResult.data as MemberRow),
    seat: memberSeat(memberResult.data as MemberRow),
    staff: isStaff(staffResult.data as StaffRow),
  }

  return {
    caller,
    loadRoom: (roomId) => loadRoom(admin, roomId),
    loadParticipant: (roomId, userId) => loadParticipant(admin, roomId, userId),
    loadTarget: (memberId) => loadTarget(admin, memberId),
    call: (name, args) => admin.rpc(name, args),
  }
}

function memberStatus(row: MemberRow): MemberStatus {
  if (row?.status === 'invited' || row?.status === 'active' || row?.status === 'suspended') return row.status
  return 'none'
}

function memberSeat(row: MemberRow): MemberSeat | null {
  if (row?.seat === 'ksa' || row?.seat === 'intl' || row?.seat === 'sponsor') return row.seat
  return null
}

function isStaff(row: StaffRow): boolean {
  return row?.role === 'staff' || row?.role === 'master'
}

async function loadRoom(admin: SupabaseClient, roomId: string): Promise<DealRoomContext | null> {
  const { data, error } = await admin
    .from('rooms')
    .select('status, opened_by')
    .eq('id', roomId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as RoomRow
  if (row?.status !== 'open' && row?.status !== 'closed' && row?.status !== 'archived') return null
  if (row.opened_by !== 'admin' && row.opened_by !== 'member') return null
  return { status: row.status, openedBy: row.opened_by }
}

async function loadParticipant(admin: SupabaseClient, roomId: string, userId: string): Promise<ParticipantState> {
  const { data, error } = await admin
    .from('room_participants')
    .select('role, invite_status')
    .eq('room_id', roomId)
    .eq('member_id', userId)
    .maybeSingle()
  if (error || !data) return 'none'
  return participantState(data as ParticipantRow)
}

async function loadTarget(admin: SupabaseClient, memberId: string): Promise<DealTarget | null> {
  const { data, error } = await admin.from('members').select('status, seat').eq('user_id', memberId).maybeSingle()
  if (error || !data) return null
  const row = data as MemberRow
  return {
    userId: memberId,
    memberStatus: memberStatus(row),
    seat: memberSeat(row),
  }
}

