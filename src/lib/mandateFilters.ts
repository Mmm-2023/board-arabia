import { optionsInCatalog, uniqueValues } from './filterOptions.ts'
import type { MandateCardModel } from './mandateRedaction.ts'
import { SECTOR_TAGS } from './profileTags.ts'

export const MANDATE_SIZE_BANDS = ['$5-10m', '$10-25m', '$25-50m', '$50-100m', '$100m and above'] as const

export const MANDATE_GEOGRAPHIES = ['KSA', 'GCC', 'International'] as const

export type MandateFilters = {
  sector: string | null
  size: string | null
  geography: string | null
}

export const EMPTY_MANDATE_FILTERS: MandateFilters = {
  sector: null,
  size: null,
  geography: null,
}

export function mandateFiltersActive(filters: MandateFilters) {
  return filters.sector != null || filters.size != null || filters.geography != null
}

export function mandateFilterChoices(cards: readonly Pick<MandateCardModel, 'sector' | 'ticket_band' | 'geography'>[]) {
  return {
    sector: optionsInCatalog(uniqueValues(cards.map((card) => card.sector)), SECTOR_TAGS),
    size: optionsInCatalog(uniqueValues(cards.map((card) => card.ticket_band)), MANDATE_SIZE_BANDS),
    geography: optionsInCatalog(uniqueValues(cards.map((card) => card.geography)), MANDATE_GEOGRAPHIES),
  }
}

export function filterMandates(cards: readonly MandateCardModel[], filters: MandateFilters) {
  return cards.filter((card) => {
    if (filters.sector && card.sector !== filters.sector) return false
    if (filters.size && card.ticket_band !== filters.size) return false
    if (filters.geography && card.geography !== filters.geography) return false
    return true
  })
}
