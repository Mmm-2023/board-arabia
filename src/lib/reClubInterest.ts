/**
 * Club interest shaping. No fetches. Names only. No mailboxes.
 */
import { RE_ASSET_CLASSES, reAssetClassLabel } from './reRedaction.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ReClubMember = {
  member_id: string
  member_name: string
}

export type ReClubGroup = {
  opportunity_id: string
  sector: string
  city: string
  asset_class: string
  one_liner: string
  room_id: string | null
  room_name: string | null
  room_status: string | null
  members: ReClubMember[]
}

export function parseMyReClubInterest(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const ids: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string' || !UUID.test(value) || ids.includes(value)) continue
    ids.push(value)
  }
  return ids
}

export function parseReClubGroups(raw: unknown): ReClubGroup[] {
  if (!Array.isArray(raw)) return []
  const groups: ReClubGroup[] = []
  for (const value of raw) {
    const group = parseGroup(value)
    if (group) groups.push(group)
  }
  return groups
}

export function clubStaffError(message: string): 'denied' | 'linked' | 'closed' | 'full' | 'owner' | 'link' | 'save' {
  if (/not_allowed|not_staff/i.test(message)) return 'denied'
  if (/already_linked/i.test(message)) return 'linked'
  if (/room_closed|not_open/i.test(message)) return 'closed'
  if (/room_full/i.test(message)) return 'full'
  if (/no_active_member/i.test(message)) return 'owner'
  if (/not_found|invalid_subject/i.test(message)) return 'link'
  return 'save'
}

export function isRoomId(value: string): boolean {
  return UUID.test(value.trim())
}

function parseGroup(value: unknown): ReClubGroup | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const opportunityId = text(row.opportunity_id, 80)
  const sector = plain(row.sector, 120)
  const city = plain(row.city, 80)
  const oneLiner = plain(row.one_liner, 280)
  if (!UUID.test(opportunityId) || !sector || !city || !oneLiner) return null
  const asset = text(row.asset_class, 80)
  const known = (RE_ASSET_CLASSES as readonly string[]).includes(asset)
  const roomId = text(row.room_id, 80)
  const roomName = plain(row.room_name, 160)
  const roomStatus = text(row.room_status, 20)
  return {
    opportunity_id: opportunityId,
    sector,
    city,
    asset_class: known ? reAssetClassLabel(asset as (typeof RE_ASSET_CLASSES)[number]) : '',
    one_liner: oneLiner,
    room_id: UUID.test(roomId) ? roomId : null,
    room_name: roomName,
    room_status: roomStatus === 'open' || roomStatus === 'closed' || roomStatus === 'archived' ? roomStatus : null,
    members: parseMembers(row.members),
  }
}

function parseMembers(value: unknown): ReClubMember[] {
  if (!Array.isArray(value)) return []
  const members: ReClubMember[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const id = text(row.member_id, 80)
    if (!UUID.test(id) || members.some((member) => member.member_id === id)) continue
    members.push({ member_id: id, member_name: displayName(row.member_name) })
  }
  return members
}

function displayName(value: unknown): string {
  const name = plain(value, 200)
  if (!name) return 'Member'
  return name
}

function plain(value: unknown, max: number): string {
  const clean = text(value, max)
  if (!clean || clean.includes('@')) return ''
  return clean
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}
