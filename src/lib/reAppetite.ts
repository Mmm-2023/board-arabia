import {
  RE_ASSET_CLASSES,
  RE_CAPITAL_ROLES,
  RE_TICKET_BANDS,
  reAssetClassLabel,
  reCapitalRoleLabel,
  type ReAssetClass,
  type ReCapitalRole,
} from './reRedaction.ts'
import { RE_GIGA_PROJECTS, RE_REGIONS, RE_STORED_CITIES, reRegionFor } from './reRegions.ts'

/**
 * Member appetite uses the same stored tags as an opportunity.
 * A card fits only when ticket, asset class, capital role, and place all overlap.
 * Place overlap is the stored city, or the region that city already maps to.
 */

export type ReTicketBand = (typeof RE_TICKET_BANDS)[number]

export type ReAppetite = {
  ticket_band: ReTicketBand
  cities: string[]
  asset_classes: ReAssetClass[]
  capital_roles: ReCapitalRole[]
}

export type ReAppetiteDraft = {
  ticket_band: ReTicketBand | null
  cities: string[]
  asset_classes: ReAssetClass[]
  capital_roles: ReCapitalRole[]
}

export type ReAppetiteFieldErrors = {
  ticket?: string
  places?: string
  assets?: string
  role?: string
}

export type ReAppetiteStaffRow = {
  member_id: string
  member_name: string
  appetite: ReAppetite
}

const PLACE_CHIPS = new Set<string>([...RE_REGIONS, ...RE_GIGA_PROJECTS])

const PLACE_ORDER = [...RE_REGIONS, ...RE_GIGA_PROJECTS, 'Jeddah', 'other']

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function manyOf<T extends string>(value: unknown, allowed: readonly T[], max: number): T[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null
  const out: T[] = []
  for (const item of value) {
    const picked = oneOf(item, allowed)
    if (!picked || out.includes(picked)) return null
    out.push(picked)
  }
  return out
}

export function parseReAppetite(raw: unknown): ReAppetite | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const ticket = oneOf(row.ticket_band, RE_TICKET_BANDS)
  const cities = manyOf(row.cities, RE_STORED_CITIES, RE_STORED_CITIES.length)
  const assetClasses = manyOf(row.asset_classes, RE_ASSET_CLASSES, RE_ASSET_CLASSES.length)
  const capitalRoles = manyOf(row.capital_roles, RE_CAPITAL_ROLES, RE_CAPITAL_ROLES.length)
  if (!ticket || !cities || !assetClasses || !capitalRoles) return null
  return {
    ticket_band: ticket,
    cities,
    asset_classes: assetClasses,
    capital_roles: capitalRoles,
  }
}

export function reAppetiteDraft(appetite: ReAppetite | null): ReAppetiteDraft {
  return {
    ticket_band: appetite?.ticket_band ?? null,
    cities: (appetite?.cities ?? []).filter((city) => PLACE_CHIPS.has(city)),
    asset_classes: appetite ? [...appetite.asset_classes] : [],
    capital_roles: appetite ? [...appetite.capital_roles] : [],
  }
}

export function reAppetiteFieldErrors(
  draft: ReAppetiteDraft,
  copy: { ticketError: string; placeError: string; assetError: string; roleError: string },
): ReAppetiteFieldErrors | null {
  const errors: ReAppetiteFieldErrors = {}
  if (!draft.ticket_band) errors.ticket = copy.ticketError
  if (draft.cities.length === 0) errors.places = copy.placeError
  if (draft.asset_classes.length === 0) errors.assets = copy.assetError
  if (draft.capital_roles.length === 0) errors.role = copy.roleError
  return errors.ticket || errors.places || errors.assets || errors.role ? errors : null
}

function ordered<T extends string>(values: readonly T[], canon: readonly T[]): T[] {
  const set = new Set(values)
  const known = canon.filter((item) => set.has(item))
  const rest = values.filter((item) => !canon.includes(item))
  return [...known, ...rest]
}

export function reAppetiteFromDraft(draft: ReAppetiteDraft): ReAppetite | null {
  if (!draft.ticket_band || draft.cities.length === 0 || draft.asset_classes.length === 0 || draft.capital_roles.length === 0) {
    return null
  }
  const cities = ordered(
    draft.cities.filter((city) => PLACE_CHIPS.has(city)),
    [...RE_REGIONS, ...RE_GIGA_PROJECTS],
  )
  const assetClasses = ordered(draft.asset_classes, RE_ASSET_CLASSES)
  const capitalRoles = ordered(draft.capital_roles, RE_CAPITAL_ROLES)
  if (cities.length === 0 || assetClasses.length === 0 || capitalRoles.length === 0) return null
  return {
    ticket_band: draft.ticket_band,
    cities,
    asset_classes: assetClasses,
    capital_roles: capitalRoles,
  }
}

export function reAppetitePlaceLabels(cities: readonly string[]): string[] {
  return ordered(cities, PLACE_ORDER)
}

export function reAppetiteLine(appetite: ReAppetite): string {
  return [
    appetite.ticket_band,
    reAppetitePlaceLabels(appetite.cities).join(', '),
    appetite.asset_classes.map((value) => reAssetClassLabel(value)).join(', '),
    appetite.capital_roles.map((value) => reCapitalRoleLabel(value)).join(', '),
  ].join('. ')
}

/** Clear overlap: every appetite dimension matches. A region covers its mapped corridors. */
export function reAppetiteFits(
  card: { city: string; one_liner: string; asset_class: string; capital_role: string; ticket_band: string },
  appetite: ReAppetite,
): boolean {
  if (card.ticket_band !== appetite.ticket_band) return false
  if (!appetite.asset_classes.includes(card.asset_class as ReAssetClass)) return false
  if (!appetite.capital_roles.includes(card.capital_role as ReCapitalRole)) return false
  if (appetite.cities.includes(card.city)) return true
  const region = reRegionFor(card.city, card.one_liner)
  return region != null && appetite.cities.includes(region)
}

export function parseReAppetiteStaffList(raw: unknown): ReAppetiteStaffRow[] {
  if (!Array.isArray(raw)) return []
  const rows: ReAppetiteStaffRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const memberId = typeof row.member_id === 'string' ? row.member_id.trim() : ''
    const name = typeof row.member_name === 'string' ? row.member_name.trim() : ''
    const appetite = parseReAppetite(row)
    if (!memberId || memberId.length > 80 || !appetite) continue
    rows.push({
      member_id: memberId,
      member_name: name || 'Member',
      appetite,
    })
  }
  return rows
}

export function readIntroAppetite(value: unknown): ReAppetite | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return parseReAppetite(value)
}
