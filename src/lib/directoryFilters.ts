import type { DirectoryCard } from './demoRows.ts'
import { seatLabel } from './demoRows.ts'
import { optionsInCatalog, uniqueValues } from './filterOptions.ts'
import {
  AVAILABILITY_LABEL,
  SECTOR_TAGS,
  availabilityLabel,
  type Availability,
} from './profileTags.ts'

export type DirectoryFilters = {
  query: string
  seat: DirectoryCard['seat'] | null
  sector: string | null
  availability: Availability | null
}

export const EMPTY_DIRECTORY_FILTERS: DirectoryFilters = {
  query: '',
  seat: null,
  sector: null,
  availability: null,
}

export const DIRECTORY_SEAT_OPTIONS = [
  { value: 'ksa', label: 'Saudi Arabia' },
  { value: 'intl', label: 'International' },
] as const

export function directoryFiltersActive(filters: DirectoryFilters) {
  return filters.query.trim() !== '' || filters.seat != null || filters.sector != null || filters.availability != null
}

export function directorySectorOptions(cards: readonly Pick<DirectoryCard, 'sector' | 'sectors'>[]) {
  const present: string[] = []
  for (const card of cards) {
    const tags = card.sectors.length > 0 ? card.sectors : card.sector ? [card.sector] : []
    for (const tag of tags) {
      if (!present.includes(tag)) present.push(tag)
    }
  }
  return optionsInCatalog(uniqueValues(present), SECTOR_TAGS)
}

export function filterDirectory(cards: readonly DirectoryCard[], filters: DirectoryFilters) {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return cards.filter((card) => {
    if (filters.seat && card.seat !== filters.seat) return false
    const sectors = card.sectors.length > 0 ? card.sectors : card.sector ? [card.sector] : []
    if (filters.sector && !sectors.includes(filters.sector)) return false
    if (filters.availability && card.availability !== filters.availability) return false
    if (terms.length === 0) return true
    const haystack = [
      card.full_name,
      card.headline,
      card.company,
      card.location,
      card.sector,
      ...sectors,
      ...card.vision_themes,
      seatLabel(card.seat),
      availabilityLabel(card.availability),
    ]
      .join(' ')
      .toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

export const DIRECTORY_AVAILABILITY_OPTIONS = (
  Object.entries(AVAILABILITY_LABEL) as [Availability, string][]
).map(([value, label]) => ({ value, label }))
