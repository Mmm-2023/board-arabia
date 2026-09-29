/**
 * Client allowlist for real estate opportunity and partner payloads.
 * The server omits counterparty and terms until that member is entitled.
 * This layer drops them again before any later card can render.
 * Inventory access is staff or the owning sponsor. It is not an auto-unblur.
 */

export const RE_ASSET_CLASSES = [
  'residential',
  'hospitality',
  'office',
  'retail',
  'industrial/logistics',
  'mixed-use',
  'land bank',
  'student housing',
  'healthcare RE',
] as const

export const RE_CITIES = [
  'Riyadh',
  'Jeddah',
  'NEOM',
  'Red Sea',
  'Qiddiya',
  'Diriyah',
  'ROSHN',
  'other',
] as const

export const RE_CAPITAL_ROLES = [
  'equity',
  'mezzanine',
  'sukuk/REIT',
  'JV partner',
  'land contribution',
  'offtake',
  'operator',
] as const

export const RE_TICKET_BANDS = [
  'Under $10m',
  '$10-25m',
  '$25-50m',
  '$50-100m',
  '$100m and above',
] as const

export const RE_FOREIGN_OWNERSHIP = [
  'designated_zone',
  'saudi_vehicle',
  'not_available',
  'not_stated',
] as const

export const RE_ESCROW = ['in_place', 'not_off_plan', 'not_stated'] as const

export const RE_TITLE = ['clear', 'in_review', 'not_stated'] as const

export const RE_WHITE_LAND = ['none', 'exposed', 'not_stated'] as const

export const RE_PARTNER_KINDS = [
  'law',
  'valuation',
  'project finance',
  'developer',
  'broker',
] as const

export const RE_CATEGORY_SLUG = 'real_estate'

export const RE_LOCKED_PLACEHOLDERS = {
  counterparty: 'Counterparty name',
  terms: 'Terms of the brief',
} as const

export const RE_LOCKED_NOTE = 'Counterparty and terms stay locked. Request intro to unlock.'

export const RE_SENSITIVE_KEYS = [
  'counterparty_name',
  'terms',
  'contact_name',
  'contact_email',
  'contact_phone',
  'narrative',
] as const

export const RE_PARTNER_SENSITIVE_KEYS = [
  'contact_name',
  'contact_email',
  'contact_phone',
] as const

export type ReIntroStatus = 'pending' | 'approved' | 'declined'

type ReClear = {
  id: string
  is_demo: boolean
  sector: string
  city: (typeof RE_CITIES)[number]
  asset_class: (typeof RE_ASSET_CLASSES)[number]
  capital_role: (typeof RE_CAPITAL_ROLES)[number]
  ticket_band: (typeof RE_TICKET_BANDS)[number]
  one_liner: string
  foreign_ownership_path: (typeof RE_FOREIGN_OWNERSHIP)[number] | null
  escrow_off_plan: (typeof RE_ESCROW)[number] | null
  title_clarity: (typeof RE_TITLE)[number] | null
  white_land_exposure: (typeof RE_WHITE_LAND)[number] | null
  unlocked: false
  access: 'locked'
  intro_status: Exclude<ReIntroStatus, 'approved'> | null
}

type ReSecrets = {
  counterparty_name: string
  terms: string
  contact_name: string
  contact_email: string
  contact_phone: string
  narrative: string
}

export type ReOpportunityOpen = Omit<ReClear, 'unlocked' | 'access' | 'intro_status'> &
  ReSecrets & {
    unlocked: true
    access: 'intro'
    intro_status: 'approved'
  }

export type ReOpportunityInventory = Omit<ReClear, 'unlocked' | 'access' | 'intro_status'> &
  ReSecrets & {
    unlocked: true
    access: 'inventory'
    intro_status: null
    published: boolean
    sponsor_member_id: string | null
  }

export type ReOpportunityCard = ReClear | ReOpportunityOpen | ReOpportunityInventory

export type RePartnerClear = {
  id: string
  is_demo: boolean
  category_slug: typeof RE_CATEGORY_SLUG
  name: string
  kind: (typeof RE_PARTNER_KINDS)[number]
  blurb: string
  unlocked: false
  access: 'locked'
}

export type RePartnerInventory = Omit<RePartnerClear, 'unlocked' | 'access'> & {
  unlocked: true
  access: 'inventory'
  contact_name: string
  contact_email: string
  contact_phone: string
  published: boolean
}

export type RePartnerCard = RePartnerClear | RePartnerInventory

function text(value: unknown, max = 400): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function introStatus(value: unknown): ReIntroStatus | null {
  if (value === 'pending' || value === 'approved' || value === 'declined') return value
  return null
}

function untainted(value: string, secret: string): string {
  if (!secret) return value
  if (value.toLowerCase().includes(secret.toLowerCase())) return ''
  return value
}

export function reOpportunitySecretsVisible(row: {
  unlocked?: unknown
  access?: unknown
  intro_status?: unknown
}): boolean {
  if (row.unlocked !== true) return false
  if (row.access === 'inventory') return true
  return row.access === 'intro' && row.intro_status === 'approved'
}

export function rePartnerSecretsVisible(row: { unlocked?: unknown; access?: unknown }): boolean {
  return row.unlocked === true && row.access === 'inventory'
}

export function presentReOpportunity(raw: unknown): ReOpportunityCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const city = oneOf(row.city, RE_CITIES)
  const assetClass = oneOf(row.asset_class, RE_ASSET_CLASSES)
  const capitalRole = oneOf(row.capital_role, RE_CAPITAL_ROLES)
  const ticket = oneOf(row.ticket_band, RE_TICKET_BANDS)
  const secretName = text(row.counterparty_name, 200)
  const secretEmail = text(row.contact_email, 320)
  const secretPhone = text(row.contact_phone, 40)
  const sector = untainted(untainted(untainted(text(row.sector, 120), secretName), secretEmail), secretPhone)
  const oneLiner = untainted(
    untainted(untainted(text(row.one_liner, 280), secretName), secretEmail),
    secretPhone,
  )
  if (!id || !sector || !city || !assetClass || !capitalRole || !ticket || !oneLiner) return null

  const clear = {
    id,
    is_demo: row.is_demo === true,
    sector,
    city,
    asset_class: assetClass,
    capital_role: capitalRole,
    ticket_band: ticket,
    one_liner: oneLiner,
    foreign_ownership_path: oneOf(row.foreign_ownership_path, RE_FOREIGN_OWNERSHIP),
    escrow_off_plan: oneOf(row.escrow_off_plan, RE_ESCROW),
    title_clarity: oneOf(row.title_clarity, RE_TITLE),
    white_land_exposure: oneOf(row.white_land_exposure, RE_WHITE_LAND),
  }
  const status = introStatus(row.intro_status)
  if (!reOpportunitySecretsVisible(row)) {
    return {
      ...clear,
      unlocked: false,
      access: 'locked',
      intro_status: status === 'approved' ? null : status,
    }
  }
  const secrets: ReSecrets = {
    counterparty_name: secretName,
    terms: text(row.terms, 400),
    contact_name: text(row.contact_name, 120),
    contact_email: secretEmail,
    contact_phone: secretPhone,
    narrative: text(row.narrative, 2000),
  }
  if (row.access === 'inventory') {
    const sponsor = text(row.sponsor_member_id, 80)
    return {
      ...clear,
      ...secrets,
      unlocked: true,
      access: 'inventory',
      intro_status: null,
      published: row.published === true,
      sponsor_member_id: sponsor || null,
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

export function presentReOpportunityList(raw: unknown): ReOpportunityCard[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentReOpportunity).filter((row): row is ReOpportunityCard => row != null)
}

export function presentRePartner(raw: unknown): RePartnerCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const name = text(row.name, 120)
  const kind = oneOf(row.kind, RE_PARTNER_KINDS)
  const blurb = text(row.blurb, 400)
  if (!id || !name || !kind || !blurb) return null
  if (row.category_slug !== RE_CATEGORY_SLUG) return null
  const clear: Omit<RePartnerClear, 'unlocked' | 'access'> = {
    id,
    is_demo: row.is_demo === true,
    category_slug: RE_CATEGORY_SLUG,
    name,
    kind,
    blurb,
  }
  if (!rePartnerSecretsVisible(row)) {
    return { ...clear, unlocked: false, access: 'locked' }
  }
  return {
    ...clear,
    unlocked: true,
    access: 'inventory',
    contact_name: text(row.contact_name, 120),
    contact_email: text(row.contact_email, 320),
    contact_phone: text(row.contact_phone, 40),
    published: row.published === true,
  }
}

export function presentRePartnerList(raw: unknown): RePartnerCard[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentRePartner).filter((row): row is RePartnerCard => row != null)
}

export function sensitiveKeysIn(value: unknown, keys: readonly string[]): string[] {
  if (!value || typeof value !== 'object') return []
  const row = value as Record<string, unknown>
  return keys.filter((key) => {
    const found = row[key]
    return typeof found === 'string' && found.trim().length > 0
  })
}
