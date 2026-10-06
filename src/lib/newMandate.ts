/**
 * Staff create a mandate. Limits match the staff create RPC.
 * A saved mandate is never an Example. is_demo is not an input.
 */
import { SECTOR_TAGS, VISION_2030_THEMES } from './profileTags.ts'

export const NEW_MANDATE_LIMITS = {
  sector: 120,
  dealType: 80,
  ticketBand: 40,
  geography: 80,
  stage: 80,
  oneLiner: 280,
  companyName: 200,
  exactAmount: 120,
  terms: 400,
  contactName: 120,
  contactEmail: 200,
  contactPhone: 40,
  deckUrl: 300,
  narrative: 2000,
} as const

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DECK_RE = /^https:\/\/[a-z0-9.-]+\//

export type NewMandateDraft = {
  published: boolean
  sector: string
  dealType: string
  ticketBand: string
  geography: string
  stage: string
  oneLiner: string
  companyName: string
  exactAmount: string
  terms: string
  contactName: string
  contactEmail: string
  contactPhone: string
  deckUrl: string
  narrative: string
  sectorTags: string[]
  visionThemes: string[]
}

export type NewMandateField = keyof NewMandateDraft

type TextField = {
  key: Exclude<NewMandateField, 'published' | 'sectorTags' | 'visionThemes'>
  label: string
  max: number
  required: boolean
  publicField: boolean
}

const TEXT_FIELDS: readonly TextField[] = [
  { key: 'sector', label: 'Sector', max: NEW_MANDATE_LIMITS.sector, required: true, publicField: true },
  { key: 'dealType', label: 'Deal type', max: NEW_MANDATE_LIMITS.dealType, required: true, publicField: true },
  { key: 'ticketBand', label: 'Ticket band', max: NEW_MANDATE_LIMITS.ticketBand, required: true, publicField: true },
  { key: 'geography', label: 'Geography', max: NEW_MANDATE_LIMITS.geography, required: true, publicField: true },
  { key: 'stage', label: 'Stage', max: NEW_MANDATE_LIMITS.stage, required: true, publicField: true },
  { key: 'oneLiner', label: 'One liner', max: NEW_MANDATE_LIMITS.oneLiner, required: true, publicField: true },
  { key: 'companyName', label: 'Company name', max: NEW_MANDATE_LIMITS.companyName, required: true, publicField: false },
  { key: 'exactAmount', label: 'Exact amount', max: NEW_MANDATE_LIMITS.exactAmount, required: true, publicField: false },
  { key: 'terms', label: 'Terms', max: NEW_MANDATE_LIMITS.terms, required: true, publicField: false },
  { key: 'contactName', label: 'Contact name', max: NEW_MANDATE_LIMITS.contactName, required: true, publicField: false },
  { key: 'contactEmail', label: 'Contact email', max: NEW_MANDATE_LIMITS.contactEmail, required: true, publicField: false },
  { key: 'contactPhone', label: 'Contact phone', max: NEW_MANDATE_LIMITS.contactPhone, required: true, publicField: false },
  { key: 'deckUrl', label: 'Deck link', max: NEW_MANDATE_LIMITS.deckUrl, required: false, publicField: false },
  { key: 'narrative', label: 'Narrative', max: NEW_MANDATE_LIMITS.narrative, required: true, publicField: false },
]

export function emptyNewMandate(): NewMandateDraft {
  return {
    published: false,
    sector: '',
    dealType: '',
    ticketBand: '',
    geography: '',
    stage: '',
    oneLiner: '',
    companyName: '',
    exactAmount: '',
    terms: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    deckUrl: '',
    narrative: '',
    sectorTags: [],
    visionThemes: [],
  }
}

export type MandateFieldError = {
  field: NewMandateField
  message: string
}

function cleanTags(values: readonly string[], allowed: readonly string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values) {
    const item = value.trim()
    if (!item || seen.has(item) || !allowed.includes(item)) return null
    seen.add(item)
    next.push(item)
  }
  return next
}

export function validateNewMandate(draft: NewMandateDraft): MandateFieldError | null {
  const trimmed = {} as Record<TextField['key'], string>
  for (const field of TEXT_FIELDS) {
    const value = draft[field.key].trim()
    trimmed[field.key] = field.key === 'contactEmail' ? value.toLowerCase() : value
    if (field.required && value.length < 1) {
      return { field: field.key, message: `${field.label} is required.` }
    }
    if (value.length > field.max) {
      return { field: field.key, message: `${field.label} is too long.` }
    }
    if (field.key !== 'contactEmail' && value.includes('@')) {
      return {
        field: field.key,
        message: field.publicField ? 'Public fields cannot include @.' : 'This field cannot include @.',
      }
    }
  }

  const email = trimmed.contactEmail
  if (email.length < 3 || !EMAIL_RE.test(email)) {
    return { field: 'contactEmail', message: 'Enter a valid contact email.' }
  }

  const deck = trimmed.deckUrl
  if (deck && (deck.length < 12 || !DECK_RE.test(deck))) {
    return { field: 'deckUrl', message: 'Deck link must be an https link.' }
  }

  const company = trimmed.companyName.toLowerCase()
  if (company && trimmed.oneLiner.toLowerCase().includes(company)) {
    return { field: 'oneLiner', message: 'The one liner cannot include the company name.' }
  }

  const sectors = cleanTags(draft.sectorTags, SECTOR_TAGS)
  if (!sectors || sectors.length > 3) {
    return { field: 'sectorTags', message: 'Choose at most 3 sector tags.' }
  }
  const themes = cleanTags(draft.visionThemes, VISION_2030_THEMES)
  if (!themes || themes.length > 3) {
    return { field: 'visionThemes', message: 'Choose at most 3 Vision 2030 themes.' }
  }

  return null
}

export function newMandateRpcArgs(draft: NewMandateDraft) {
  const sectorTags = cleanTags(draft.sectorTags, SECTOR_TAGS) ?? []
  const visionThemes = cleanTags(draft.visionThemes, VISION_2030_THEMES) ?? []
  return {
    p_published: draft.published,
    p_sector: draft.sector.trim(),
    p_deal_type: draft.dealType.trim(),
    p_ticket_band: draft.ticketBand.trim(),
    p_geography: draft.geography.trim(),
    p_stage: draft.stage.trim(),
    p_one_liner: draft.oneLiner.trim(),
    p_company_name: draft.companyName.trim(),
    p_exact_amount: draft.exactAmount.trim(),
    p_terms: draft.terms.trim(),
    p_contact_name: draft.contactName.trim(),
    p_contact_email: draft.contactEmail.trim().toLowerCase(),
    p_contact_phone: draft.contactPhone.trim(),
    p_deck_url: draft.deckUrl.trim() ? draft.deckUrl.trim() : null,
    p_narrative: draft.narrative.trim(),
    p_sector_tags: sectorTags,
    p_vision_themes: visionThemes,
  }
}
