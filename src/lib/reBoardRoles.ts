import { RE_ASSET_CLASSES, type ReAssetClass } from './reRedaction.ts'
import { RE_STORED_CITIES, type ReStoredCity } from './reRegions.ts'

/**
 * Client allowlist for board and NED real estate roles.
 * The server omits the organisation and seat terms until that member is entitled.
 * This layer drops them again before a card can render.
 */

export const RE_BOARD_SEAT_KINDS = ['developer', 'propco'] as const

export type ReBoardSeatKind = (typeof RE_BOARD_SEAT_KINDS)[number]

export const RE_BOARD_SEAT_LABEL: Record<ReBoardSeatKind, string> = {
  developer: 'Developer board',
  propco: 'Property company board',
}

export function reBoardSeatLabel(value: string) {
  return RE_BOARD_SEAT_LABEL[value as ReBoardSeatKind] ?? value
}

export const RE_BOARD_ROLE_SENSITIVE_KEYS = [
  'organisation_name',
  'terms',
  'contact_name',
  'contact_email',
  'contact_phone',
  'narrative',
] as const

export type ReBoardIntroStatus = 'pending' | 'approved' | 'declined'

type ReBoardClear = {
  id: string
  is_demo: boolean
  seat_kind: ReBoardSeatKind
  title: string
  sector: string
  capacity: string
  city: ReStoredCity
  asset_class: ReAssetClass
  unlocked: false
  access: 'locked'
  intro_status: Exclude<ReBoardIntroStatus, 'approved'> | null
}

type ReBoardSecrets = {
  organisation_name: string
  terms: string
  contact_name: string
  contact_email: string
  contact_phone: string
  narrative: string
}

export type ReBoardRoleOpen = Omit<ReBoardClear, 'unlocked' | 'access' | 'intro_status'> &
  ReBoardSecrets & {
    unlocked: true
    access: 'intro'
    intro_status: 'approved'
  }

export type ReBoardRoleInventory = Omit<ReBoardClear, 'unlocked' | 'access' | 'intro_status'> &
  ReBoardSecrets & {
    unlocked: true
    access: 'inventory'
    intro_status: null
    published: boolean
    sort_order: number
  }

export type ReBoardRoleCard = ReBoardClear | ReBoardRoleOpen | ReBoardRoleInventory

export type ReBoardRoleIntroRow = {
  id: string
  title: string
  seat_kind: ReBoardSeatKind
  sector: string
  city: string
  asset_class: string
  organisation_name: string
  member_name: string
}

function text(value: unknown, max = 400): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function introStatus(value: unknown): ReBoardIntroStatus | null {
  if (value === 'pending' || value === 'approved' || value === 'declined') return value
  return null
}

function untainted(value: string, secret: string): string {
  if (!secret) return value
  if (value.toLowerCase().includes(secret.toLowerCase())) return ''
  return value
}

export function reBoardRoleSecretsVisible(row: {
  unlocked?: unknown
  access?: unknown
  intro_status?: unknown
}): boolean {
  if (row.unlocked !== true) return false
  if (row.access === 'inventory') return true
  return row.access === 'intro' && row.intro_status === 'approved'
}

export function reBoardRoleFeedIsForming(cards: readonly { is_demo: boolean }[]) {
  return cards.some((card) => card.is_demo)
}

export function presentReBoardRole(raw: unknown): ReBoardRoleCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const seat = oneOf(row.seat_kind, RE_BOARD_SEAT_KINDS)
  const city = oneOf(row.city, RE_STORED_CITIES)
  const assetClass = oneOf(row.asset_class, RE_ASSET_CLASSES)
  const secretName = text(row.organisation_name, 200)
  const secretEmail = text(row.contact_email, 320)
  const secretPhone = text(row.contact_phone, 40)
  const title = untainted(untainted(untainted(text(row.title, 160), secretName), secretEmail), secretPhone)
  const sector = untainted(untainted(untainted(text(row.sector, 120), secretName), secretEmail), secretPhone)
  const capacity = untainted(untainted(untainted(text(row.capacity, 160), secretName), secretEmail), secretPhone)
  if (!id || !seat || !title || !sector || !capacity || !city || !assetClass) return null

  const clear = {
    id,
    is_demo: row.is_demo === true,
    seat_kind: seat,
    title,
    sector,
    capacity,
    city,
    asset_class: assetClass,
  }
  const status = introStatus(row.intro_status)
  if (!reBoardRoleSecretsVisible(row)) {
    return {
      ...clear,
      unlocked: false,
      access: 'locked',
      intro_status: status === 'approved' ? null : status,
    }
  }
  const secrets: ReBoardSecrets = {
    organisation_name: secretName,
    terms: text(row.terms, 400),
    contact_name: text(row.contact_name, 120),
    contact_email: secretEmail,
    contact_phone: secretPhone,
    narrative: text(row.narrative, 2000),
  }
  if (row.access === 'inventory') {
    return {
      ...clear,
      ...secrets,
      unlocked: true,
      access: 'inventory',
      intro_status: null,
      published: row.published === true,
      sort_order: sortOrder(row.sort_order),
    }
  }
  return {
    ...clear,
    ...secrets,
    unlocked: true,
    access: 'intro',
    intro_status: 'approved',
  }
}

export function presentReBoardRoleList(raw: unknown): ReBoardRoleCard[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentReBoardRole).filter((row): row is ReBoardRoleCard => row != null)
}

export function parseReBoardRoleIntros(raw: unknown): ReBoardRoleIntroRow[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = text(row.id, 80)
    const title = text(row.title, 160)
    const seat = oneOf(row.seat_kind, RE_BOARD_SEAT_KINDS)
    const organisation = text(row.organisation_name, 200)
    if (!id || !title || !seat || !organisation) return []
    const member = text(row.member_name, 120)
    return [
      {
        id,
        title,
        seat_kind: seat,
        sector: text(row.sector, 120),
        city: text(row.city, 80),
        asset_class: text(row.asset_class, 80),
        organisation_name: organisation,
        member_name: member || 'Member',
      },
    ]
  })
}

function sortOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}
