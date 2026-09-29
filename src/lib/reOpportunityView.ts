import {
  RE_ASSET_CLASSES,
  RE_CAPITAL_ROLES,
  RE_CITIES,
  RE_ESCROW,
  RE_FOREIGN_OWNERSHIP,
  RE_TITLE,
  RE_WHITE_LAND,
  type ReOpportunityCard,
} from './reRedaction.ts'

export type ReOpportunityFilters = {
  assetClass: (typeof RE_ASSET_CLASSES)[number] | null
  city: (typeof RE_CITIES)[number] | null
  capitalRole: (typeof RE_CAPITAL_ROLES)[number] | null
}

export const EMPTY_RE_FILTERS: ReOpportunityFilters = {
  assetClass: null,
  city: null,
  capitalRole: null,
}

export function reFiltersActive(filters: ReOpportunityFilters) {
  return filters.assetClass != null || filters.city != null || filters.capitalRole != null
}

export function filterReOpportunities(cards: readonly ReOpportunityCard[], filters: ReOpportunityFilters) {
  return cards.filter((card) => {
    if (filters.assetClass && card.asset_class !== filters.assetClass) return false
    if (filters.city && card.city !== filters.city) return false
    if (filters.capitalRole && card.capital_role !== filters.capitalRole) return false
    return true
  })
}

export function reFeedIsForming(cards: readonly { is_demo: boolean }[]) {
  return cards.some((card) => card.is_demo)
}

const FOREIGN_LABEL: Record<(typeof RE_FOREIGN_OWNERSHIP)[number], string> = {
  designated_zone: 'Foreign ownership: designated zone',
  saudi_vehicle: 'Foreign ownership: Saudi vehicle',
  not_available: 'Foreign ownership: not available',
  not_stated: 'Foreign ownership: not stated',
}

const ESCROW_LABEL: Record<(typeof RE_ESCROW)[number], string> = {
  in_place: 'Escrow: in place',
  not_off_plan: 'Escrow: not off-plan',
  not_stated: 'Escrow: not stated',
}

const TITLE_LABEL: Record<(typeof RE_TITLE)[number], string> = {
  clear: 'Title: clear',
  in_review: 'Title: in review',
  not_stated: 'Title: not stated',
}

const WHITE_LAND_LABEL: Record<(typeof RE_WHITE_LAND)[number], string> = {
  none: 'White Land: none',
  exposed: 'White Land: exposed',
  not_stated: 'White Land: not stated',
}

export function readinessLines(card: {
  foreign_ownership_path: (typeof RE_FOREIGN_OWNERSHIP)[number] | null
  escrow_off_plan: (typeof RE_ESCROW)[number] | null
  title_clarity: (typeof RE_TITLE)[number] | null
  white_land_exposure: (typeof RE_WHITE_LAND)[number] | null
}) {
  const lines: string[] = []
  if (card.foreign_ownership_path) lines.push(FOREIGN_LABEL[card.foreign_ownership_path])
  if (card.escrow_off_plan) lines.push(ESCROW_LABEL[card.escrow_off_plan])
  if (card.title_clarity) lines.push(TITLE_LABEL[card.title_clarity])
  if (card.white_land_exposure) lines.push(WHITE_LAND_LABEL[card.white_land_exposure])
  return lines
}
