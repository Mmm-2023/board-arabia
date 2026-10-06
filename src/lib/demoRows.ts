/** Safe projections for directory, rooms, and trusted partners. */

import { normalizeAvatarStyle, type AvatarStyle } from './avatarStyle.ts'
import { isPartnerLogoPath } from './partnerLogo.ts'
import { isAvailability, normalizeTags, SECTOR_TAGS, VISION_2030_THEMES, type Availability } from './profileTags.ts'

export type DirectoryCard = {
  id: string
  is_demo: boolean
  full_name: string
  headline: string
  company: string
  location: string
  sector: string
  sectors: string[]
  vision_themes: string[]
  availability: Availability | null
  seat: 'ksa' | 'intl' | 'sponsor'
  preferred_partner: boolean
  portrait_asset: string | null
  avatar_path: string | null
  avatar_style: AvatarStyle
  /** Invited people are not admitted peers. Missing means the row did not say. */
  membership_status?: 'invited' | 'active' | null
}

export type RoomCard = {
  id: string
  is_demo: boolean
  name: string
  summary: string
  sector: string
  stage: string
  member_count: number
  host_name: string
}

export type PartnerCard = {
  id: string
  is_demo: boolean
  name: string
  blurb: string
  monogram: string
  logo_path: string | null
  category_slug: string | null
}

export function schemaMissing(message: string): boolean {
  return /does not exist|schema cache|Could not find the/i.test(message)
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function rowsOf(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

export function seatLabel(seat: DirectoryCard['seat']): string {
  if (seat === 'intl') return 'International'
  if (seat === 'sponsor') return 'Sponsor'
  return 'Saudi Arabia'
}

export function presentDirectoryCard(raw: unknown): DirectoryCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const fullName = text(row.full_name, 200)
  const seat = row.seat === 'intl' ? 'intl' : row.seat === 'ksa' ? 'ksa' : row.seat === 'sponsor' ? 'sponsor' : null
  if (!id || !fullName || !seat) return null
  const portrait = text(row.portrait_asset, 160)
  const avatar = text(row.avatar_path, 160)
  const fromList = normalizeTags(row.sectors, SECTOR_TAGS)
  const legacy = text(row.sector, 120)
  const legacyOk = (SECTOR_TAGS as readonly string[]).includes(legacy) ? legacy : ''
  const sectors = fromList.length > 0 ? fromList : legacyOk ? [legacyOk] : []
  return {
    id,
    is_demo: row.is_demo === true,
    full_name: fullName,
    headline: text(row.headline, 160),
    company: text(row.company, 200),
    location: cityName(text(row.location, 120)),
    sector: sectors[0] ?? '',
    sectors,
    vision_themes: normalizeTags(row.vision_themes, VISION_2030_THEMES),
    availability: isAvailability(row.availability) ? row.availability : null,
    seat,
    preferred_partner: row.preferred_partner === true || seat === 'sponsor',
    portrait_asset: portrait.startsWith('/demo/portraits/') ? portrait : null,
    avatar_path: /^[0-9a-f-]{36}\/avatar$/i.test(avatar) ? avatar : null,
    avatar_style: normalizeAvatarStyle(row.avatar_style),
    membership_status: row.membership_status === 'invited' || row.membership_status === 'active'
      ? row.membership_status
      : null,
  }
}

function cityName(value: string): string {
  return value.trim().toLowerCase() === 'riaydh' ? 'Riyadh' : value
}

export function presentDirectoryList(raw: unknown): DirectoryCard[] {
  return rowsOf(raw)
    .map(presentDirectoryCard)
    .filter((row): row is DirectoryCard => row != null)
}

export function presentRoomCard(raw: unknown): RoomCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const name = text(row.name, 160)
  const summary = text(row.summary, 400)
  if (!id || !name || !summary) return null
  const count = typeof row.member_count === 'number' ? row.member_count : Number(row.member_count)
  return {
    id,
    is_demo: row.is_demo === true,
    name,
    summary,
    sector: text(row.sector, 120),
    stage: text(row.stage, 40),
    member_count: Number.isInteger(count) && count >= 0 && count <= 50 ? count : 0,
    host_name: text(row.host_name, 200),
  }
}

export function presentRoomList(raw: unknown): RoomCard[] {
  return rowsOf(raw)
    .map(presentRoomCard)
    .filter((row): row is RoomCard => row != null)
}

export function presentPartnerCard(raw: unknown): PartnerCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const name = text(row.name, 120)
  const blurb = text(row.blurb, 200)
  const monogram = text(row.monogram, 3).toUpperCase()
  if (!id || !name || !blurb || !monogram) return null
  const logo = text(row.logo_path, 80)
  const category = text(row.category_slug, 80)
  return {
    id,
    is_demo: row.is_demo === true,
    name,
    blurb,
    monogram,
    logo_path: isPartnerLogoPath(logo) ? logo : null,
    category_slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category) ? category : null,
  }
}

export function presentPartnerList(raw: unknown): PartnerCard[] {
  return rowsOf(raw)
    .map(presentPartnerCard)
    .filter((row): row is PartnerCard => row != null)
}
