import {
  RE_PARTNER_KINDS,
  type RePartnerCard,
  type RePartnerInventory,
} from './reRedaction.ts'
import { RE_REGIONS, reRegionFor, type ReRegion } from './reRegions.ts'

export const RE_PARTNER_KIND_LABEL = {
  law: 'Law',
  valuation: 'Valuation',
  'project finance': 'Project finance',
  developer: 'Developers',
  broker: 'FO-grade brokers',
} as const

export const RE_PARTNER_STAFF = {
  title: 'Real estate partners',
  lead: 'Add, edit, hide, or reorder vetted firms. They stay in the Real estate sponsor category. Example firms stay locked. Members do not see admin contacts.',
  demo: 'Example firms stay as seeded.',
  saved: 'Partner saved.',
  error: 'Could not save. Retry.',
  empty: 'No partners yet. Add a firm when one is vetted.',
  denied: 'This page is for admin.',
  unavailable: 'Partner editing is not available yet.',
  loadError: "Couldn't refresh. Showing last update …",
  retry: 'Retry',
  loading: 'Loading partners',
  add: 'Add partner',
  save: 'Save partner',
  saving: 'Saving',
  visible: 'Visible to members',
  up: 'Move up',
  down: 'Move down',
  hidden: 'Hidden from members',
  queue: 'Partner intros',
  queueError: 'Could not load partner intro requests.',
  approve: 'Approve intro',
  decline: 'Decline intro',
  declineTitle: 'Decline this intro?',
  declineBody: 'The member keeps the firm name and city. Admin contacts stay off the member page.',
  decideError: 'Could not save that decision. Retry.',
} as const

export type RePartnerDraft = {
  id: string | null
  published: boolean
  name: string
  kind: (typeof RE_PARTNER_KINDS)[number] | ''
  city: ReRegion | ''
  blurb: string
  contact_name: string
  contact_email: string
  contact_phone: string
  sort_order: number
}

export function rePartnerFeedIsForming(cards: readonly { is_demo: boolean }[]) {
  return cards.some((card) => card.is_demo)
}

export function rePartnerGroups(cards: readonly RePartnerCard[]) {
  return RE_PARTNER_KINDS.flatMap((kind) => {
    const rows = cards.filter((card) => card.kind === kind)
    if (rows.length === 0) return []
    return [{ kind, label: RE_PARTNER_KIND_LABEL[kind], rows }]
  })
}

export function emptyPartnerDraft(sortOrder: number): RePartnerDraft {
  return {
    id: null,
    published: false,
    name: '',
    kind: '',
    city: '',
    blurb: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    sort_order: sortOrder,
  }
}

export function draftFromPartner(card: RePartnerInventory, sortOrder = card.sort_order): RePartnerDraft {
  return {
    id: card.id,
    published: card.published,
    name: card.name,
    kind: card.kind,
    city: reRegionFor(card.city, card.blurb) ?? '',
    blurb: card.blurb,
    contact_name: card.contact_name,
    contact_email: card.contact_email,
    contact_phone: card.contact_phone,
    sort_order: sortOrder,
  }
}

export function partnerSaveArgs(draft: RePartnerDraft) {
  const name = draft.name.trim()
  const blurb = draft.blurb.trim()
  const contactName = draft.contact_name.trim()
  const email = draft.contact_email.trim().toLowerCase()
  const phone = draft.contact_phone.trim()
  if (!name || !blurb || !contactName || !email || !phone) return null
  if (!draft.kind || !draft.city) return null
  if (!(RE_PARTNER_KINDS as readonly string[]).includes(draft.kind)) return null
  if (!(RE_REGIONS as readonly string[]).includes(draft.city)) return null
  if (name.includes('@') || blurb.includes('@') || email.includes(' ') || !email.includes('@')) return null
  if (blurb.toLowerCase().includes(contactName.toLowerCase())) return null
  if (blurb.toLowerCase().includes(email)) return null
  return {
    p_id: draft.id,
    p_published: draft.published,
    p_name: name,
    p_kind: draft.kind,
    p_city: draft.city,
    p_blurb: blurb,
    p_contact_name: contactName,
    p_contact_email: email,
    p_contact_phone: phone,
    p_sort_order: Math.max(0, Math.floor(draft.sort_order)),
  }
}

export function partnerMoveOrders<T extends { id: string; is_demo: boolean; sort_order: number }>(
  cards: readonly T[],
  id: string,
  direction: -1 | 1,
) {
  const live = cards.filter((card) => !card.is_demo)
  const index = live.findIndex((card) => card.id === id)
  const next = index + direction
  if (index < 0 || next < 0 || next >= live.length) return null
  const order = live.slice()
  const [item] = order.splice(index, 1)
  if (!item) return null
  order.splice(next, 0, item)
  return order.map((card, position) => ({ id: card.id, sort_order: position + 1 }))
}

export type RePartnerIntroRow = {
  id: string
  name: string
  kind: string
  city: string
  member_name: string
}

export function parseRePartnerIntros(raw: unknown): RePartnerIntroRow[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const kind = typeof row.kind === 'string' ? row.kind.trim() : ''
    const city = typeof row.city === 'string' ? row.city.trim() : ''
    const member = typeof row.member_name === 'string' ? row.member_name.trim() : ''
    if (!id || !name) return []
    return [{ id, name, kind, city, member_name: member || 'Member' }]
  })
}
