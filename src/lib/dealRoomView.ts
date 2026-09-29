/**
 * Pure shaping for member deal rooms.
 * Drops anything that is not a display field. No fetches.
 */

export type RoomStatus = 'open' | 'closed' | 'archived'
export type OpenedBy = 'admin' | 'member'
export type InviteStatus = 'invited' | 'accepted' | 'declined' | 'removed'
export type RoomRole = 'owner' | 'member'
export type SeatKind = 'ksa' | 'intl' | 'sponsor'
export type SubjectKind = 'none' | 'mandate' | 're'

export type DealParticipant = {
  memberId: string
  role: RoomRole
  inviteStatus: InviteStatus
  fullName: string
}

export type MemberDealRoom = {
  id: string
  name: string
  purpose: string
  status: RoomStatus
  openedBy: 'member'
  ownerMemberId: string
  mandateId: string | null
  reOpportunityId: string | null
  createdAt: string
  myRole: RoomRole
  myInviteStatus: 'invited' | 'accepted'
  participants: DealParticipant[]
}

export type DirectoryInvitee = {
  id: string
  fullName: string
  headline: string
  company: string
  seat: SeatKind
}

export type StaffDealRoom = {
  id: string
  name: string
  purpose: string
  status: RoomStatus
  openedBy: OpenedBy
  acceptedCount: number
  invitedCount: number
}

export type SubjectOption = {
  id: string
  label: string
}

export type CreateRoomBody = {
  name: string
  purpose: string
  mandate_id: string | null
  re_opportunity_id: string | null
}

export type RoomPowers = {
  rename: boolean
  invite: boolean
  remove: boolean
  close: boolean
  archive: boolean
  accept: boolean
  decline: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEAK = /email|token|phone|secret|password/i

export const DEAL_COPY = {
  invalidName: 'Enter a room name.',
  invalidPurpose: 'Enter a purpose.',
  invalidSubject: 'Link a mandate or a real estate opportunity, not both.',
  saveError: "Couldn't save. Retry.",
  notAvailable: 'This room is not available to you.',
  noMatches: 'No matches. Try another name.',
  searchHint: 'Active members and approved sponsors only. The server checks each invite.',
  readOnly: 'You can view this room. Only the owner can change it.',
  archived: 'This room is archived.',
  closed: 'This room is closed.',
  inviteDenied: 'Search is for active members.',
  yourRoomsIntro: 'Rooms you open or join. Admin rooms stay in the list below.',
  createIntro: 'Name the room, say what it is for, and link one mandate or one real estate opportunity if you want.',
  staffIntro: 'Every room. You can close any room that is still open.',
} as const

export function cleanRoomLine(value: string, max: number): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function createRoomBody(input: {
  name: string
  purpose: string
  mandateId: string | null
  reOpportunityId: string | null
}): { ok: true; body: CreateRoomBody } | { ok: false; error: string } {
  const name = cleanRoomLine(input.name, 160)
  const purpose = cleanRoomLine(input.purpose, 400)
  if (!name) return { ok: false, error: DEAL_COPY.invalidName }
  if (input.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().length > 160) {
    return { ok: false, error: DEAL_COPY.invalidName }
  }
  if (!purpose) return { ok: false, error: DEAL_COPY.invalidPurpose }
  if (input.purpose.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().length > 400) {
    return { ok: false, error: DEAL_COPY.invalidPurpose }
  }
  const mandateId = blankToNull(input.mandateId)
  const reOpportunityId = blankToNull(input.reOpportunityId)
  if (mandateId && reOpportunityId) return { ok: false, error: DEAL_COPY.invalidSubject }
  if (mandateId && !UUID.test(mandateId)) return { ok: false, error: 'Not found' }
  if (reOpportunityId && !UUID.test(reOpportunityId)) return { ok: false, error: 'Not found' }
  return { ok: true, body: { name, purpose, mandate_id: mandateId, re_opportunity_id: reOpportunityId } }
}

export function roomPowers(room: MemberDealRoom): RoomPowers {
  const owner = room.myRole === 'owner'
  const archived = room.status === 'archived'
  const open = room.status === 'open'
  const invited = room.myInviteStatus === 'invited'
  return {
    rename: owner && !archived,
    invite: owner && open,
    remove: owner && !archived,
    close: owner && open,
    archive: owner && !archived,
    accept: invited && open,
    decline: invited && !archived,
  }
}

export function pendingInvites(rooms: MemberDealRoom[]): MemberDealRoom[] {
  return rooms.filter((room) => room.myInviteStatus === 'invited' && room.status !== 'archived')
}

export function blockingParticipantIds(room: MemberDealRoom): Set<string> {
  return new Set(
    room.participants
      .filter((person) => person.inviteStatus === 'invited' || person.inviteStatus === 'accepted')
      .map((person) => person.memberId),
  )
}

export function filterInvitees(
  rows: DirectoryInvitee[],
  selfId: string,
  blocked: ReadonlySet<string>,
): DirectoryInvitee[] {
  const seen = new Set<string>()
  const out: DirectoryInvitee[] = []
  for (const row of rows) {
    if (!UUID.test(row.id) || row.id === selfId || blocked.has(row.id) || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

export function ownerName(room: MemberDealRoom): string {
  const owner = room.participants.find((person) => person.role === 'owner')
  return owner?.fullName || 'A member'
}

export function peopleLine(room: MemberDealRoom): string {
  const count = room.participants.filter(
    (person) => person.inviteStatus === 'invited' || person.inviteStatus === 'accepted',
  ).length
  return count === 1 ? '1 person' : `${count} people`
}

export function statusLabel(status: RoomStatus): string {
  if (status === 'closed') return 'Closed'
  if (status === 'archived') return 'Archived'
  return 'Open'
}

export function inviteStatusLabel(status: InviteStatus): string {
  if (status === 'accepted') return 'Accepted'
  if (status === 'declined') return 'Declined'
  if (status === 'removed') return 'Removed'
  return 'Invited'
}

export function openedByLabel(openedBy: OpenedBy): string {
  return openedBy === 'admin' ? 'Opened by admin' : 'Opened by a member'
}

export function linkedSubject(
  room: Pick<MemberDealRoom, 'mandateId' | 'reOpportunityId'>,
  mandates: SubjectOption[],
  opportunities: SubjectOption[],
): string | null {
  if (room.mandateId && room.reOpportunityId) return null
  if (room.mandateId) {
    return mandates.find((item) => item.id === room.mandateId)?.label ?? 'Linked mandate'
  }
  if (room.reOpportunityId) {
    return opportunities.find((item) => item.id === room.reOpportunityId)?.label ?? 'Linked real estate opportunity'
  }
  return null
}

export function mandateOptions(
  rows: { id: string; is_demo: boolean; sector: string; one_liner: string }[],
): SubjectOption[] {
  return rows.filter((row) => !row.is_demo && UUID.test(row.id)).map((row) => ({
    id: row.id,
    label: joinLabel(row.sector, row.one_liner, 'Mandate'),
  }))
}

export function opportunityOptions(
  rows: { id: string; is_demo: boolean; city: string; one_liner: string }[],
): SubjectOption[] {
  return rows.filter((row) => !row.is_demo && UUID.test(row.id)).map((row) => ({
    id: row.id,
    label: joinLabel(row.city, row.one_liner, 'Opportunity'),
  }))
}

export function presentMyDealRooms(raw: unknown): MemberDealRoom[] {
  return rowsOf(raw)
    .map(presentMyDealRoom)
    .filter((row): row is MemberDealRoom => row != null)
}

export function presentDirectoryInvitees(raw: unknown): DirectoryInvitee[] {
  return rowsOf(raw)
    .map(presentDirectoryInvitee)
    .filter((row): row is DirectoryInvitee => row != null)
}

export function presentStaffDealRooms(raw: unknown): StaffDealRoom[] {
  const rooms = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>).rooms
    : raw
  return rowsOf(rooms)
    .map(presentStaffDealRoom)
    .filter((row): row is StaffDealRoom => row != null)
}

export function presentRoomId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text((raw as Record<string, unknown>).room_id, 80)
  return UUID.test(id) ? id : null
}

function presentMyDealRoom(raw: unknown): MemberDealRoom | null {
  const row = record(raw)
  if (!row) return null
  const id = text(row.id, 80)
  const name = text(row.name, 160)
  const ownerMemberId = text(row.owner_member_id, 80)
  const status = roomStatus(row.status)
  const myRole = row.my_role === 'owner' || row.my_role === 'member' ? row.my_role : null
  const myInviteStatus = row.my_invite_status === 'invited' || row.my_invite_status === 'accepted'
    ? row.my_invite_status
    : null
  if (!UUID.test(id) || !name || !UUID.test(ownerMemberId) || !status || !myRole || !myInviteStatus) return null
  if (row.opened_by != null && row.opened_by !== 'member') return null
  const mandateId = optionalId(row.mandate_id)
  const reOpportunityId = optionalId(row.re_opportunity_id)
  if (mandateId === false || reOpportunityId === false) return null
  if (mandateId && reOpportunityId) return null
  return {
    id,
    name,
    purpose: text(row.purpose, 400),
    status,
    openedBy: 'member',
    ownerMemberId,
    mandateId,
    reOpportunityId,
    createdAt: text(row.created_at, 40),
    myRole,
    myInviteStatus,
    participants: rowsOf(row.participants)
      .map(presentParticipant)
      .filter((person): person is DealParticipant => person != null),
  }
}

function presentParticipant(raw: unknown): DealParticipant | null {
  const row = record(raw)
  if (!row) return null
  const memberId = text(row.member_id, 80)
  const role = row.role === 'owner' || row.role === 'member' ? row.role : null
  const inviteStatus = inviteStatusOf(row.invite_status)
  if (!UUID.test(memberId) || !role || !inviteStatus) return null
  const fullName = text(row.full_name, 200) || 'Member'
  return { memberId, role, inviteStatus, fullName }
}

function presentDirectoryInvitee(raw: unknown): DirectoryInvitee | null {
  const row = record(raw)
  if (!row) return null
  const id = text(row.id, 80)
  const fullName = text(row.full_name, 200)
  const seat = row.seat === 'ksa' || row.seat === 'intl' || row.seat === 'sponsor' ? row.seat : null
  if (!UUID.test(id) || !fullName || !seat) return null
  if (row.is_demo === true) return null
  if (row.status != null && row.status !== 'active') return null
  return {
    id,
    fullName,
    headline: text(row.headline, 160),
    company: text(row.company, 200),
    seat,
  }
}

function presentStaffDealRoom(raw: unknown): StaffDealRoom | null {
  const row = record(raw)
  if (!row) return null
  const id = text(row.id, 80)
  const name = text(row.name, 160)
  const status = roomStatus(row.status)
  const openedBy = row.opened_by === 'admin' || row.opened_by === 'member' ? row.opened_by : null
  if (!UUID.test(id) || !name || !status || !openedBy) return null
  let acceptedCount = 0
  let invitedCount = 0
  for (const person of rowsOf(row.participants)) {
    const item = record(person)
    if (!item) continue
    if (item.invite_status === 'accepted') acceptedCount += 1
    if (item.invite_status === 'invited') invitedCount += 1
  }
  return {
    id,
    name,
    purpose: text(row.purpose, 400),
    status,
    openedBy,
    acceptedCount,
    invitedCount,
  }
}

function joinLabel(lead: string, line: string, fallback: string): string {
  const left = lead.trim()
  const right = line.trim()
  const joined = left && right ? `${left}: ${right}` : left || right || fallback
  return joined.slice(0, 180)
}

function blankToNull(value: string | null): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function roomStatus(value: unknown): RoomStatus | null {
  if (value === 'open' || value === 'closed' || value === 'archived') return value
  return null
}

function inviteStatusOf(value: unknown): InviteStatus | null {
  if (value === 'invited' || value === 'accepted' || value === 'declined' || value === 'removed') return value
  return null
}

function optionalId(value: unknown): string | null | false {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !UUID.test(value)) return false
  return value
}

function rowsOf(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

function record(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (LEAK.test(key)) continue
    out[key] = value
  }
  return out
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}
