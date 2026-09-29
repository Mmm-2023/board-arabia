/**
 * Client allowlist for mandate payloads.
 * The server omits sensitive keys until an admin approves that member.
 * This layer drops them again before any card renders.
 */

export const MANDATE_CLEAR_KEYS = [
  'id',
  'is_demo',
  'sector',
  'deal_type',
  'ticket_band',
  'geography',
  'stage',
  'one_liner',
  'unlocked',
  'intro_status',
] as const

export const MANDATE_SENSITIVE_KEYS = [
  'company_name',
  'exact_amount',
  'terms',
  'contact_name',
  'contact_email',
  'contact_phone',
  'deck_url',
  'narrative',
] as const

export const LOCKED_PLACEHOLDERS = {
  company: 'Company name',
  amount: 'Exact amount and terms',
  contact: 'Contact',
  deck: 'Deck or data room',
  narrative: 'Confidential narrative',
} as const

export const LOCKED_NOTE = 'Locked details. Request intro to unlock.'

export type IntroStatus = 'pending' | 'approved' | 'declined'

export type MandateClear = {
  id: string
  is_demo: boolean
  sector: string
  deal_type: string
  ticket_band: string
  geography: string
  stage: string
  one_liner: string
  unlocked: false
  intro_status: Exclude<IntroStatus, 'approved'> | null
}

export type MandateOpen = Omit<MandateClear, 'unlocked' | 'intro_status'> & {
  unlocked: true
  intro_status: 'approved'
  company_name: string
  exact_amount: string
  terms: string
  contact_name: string
  contact_email: string
  contact_phone: string
  deck_url: string | null
  narrative: string
}

export type MandateCardModel = MandateClear | MandateOpen

function text(value: unknown, max = 400): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function introStatus(value: unknown): IntroStatus | null {
  if (value === 'pending' || value === 'approved' || value === 'declined') return value
  return null
}

export function presentMandate(raw: unknown): MandateCardModel | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const sector = text(row.sector, 120)
  const dealType = text(row.deal_type, 80)
  const ticket = text(row.ticket_band, 40)
  const geography = text(row.geography, 40)
  const stage = text(row.stage, 40)
  const oneLiner = text(row.one_liner, 280)
  if (!id || !sector || !dealType || !ticket || !geography || !stage || !oneLiner) return null

  const status = introStatus(row.intro_status)
  const unlocked = row.unlocked === true && status === 'approved'
  const clear = {
    id,
    is_demo: row.is_demo === true,
    sector,
    deal_type: dealType,
    ticket_band: ticket,
    geography,
    stage,
    one_liner: oneLiner,
  }
  if (!unlocked) {
    return {
      ...clear,
      unlocked: false,
      intro_status: status === 'approved' ? null : status,
    }
  }
  return {
    ...clear,
    unlocked: true,
    intro_status: 'approved',
    company_name: text(row.company_name, 200),
    exact_amount: text(row.exact_amount, 120),
    terms: text(row.terms, 400),
    contact_name: text(row.contact_name, 120),
    contact_email: text(row.contact_email, 320),
    contact_phone: text(row.contact_phone, 40),
    deck_url: text(row.deck_url, 500) || null,
    narrative: text(row.narrative, 2000),
  }
}

export function presentMandateList(raw: unknown): MandateCardModel[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentMandate).filter((row): row is MandateCardModel => row != null)
}

export function sensitiveKeysIn(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const row = value as Record<string, unknown>
  return MANDATE_SENSITIVE_KEYS.filter((key) => {
    const found = row[key]
    return typeof found === 'string' && found.trim().length > 0
  })
}
