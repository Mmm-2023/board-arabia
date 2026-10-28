import { isAvailability, normalizeTags, SECTOR_TAGS, VISION_2030_THEMES } from './profileTags.ts'

/** Exact empty-state line when the member already has weekly intros on. */
export const NO_SUGGESTIONS_THIS_WEEK = 'No suggested introductions this week.'

export type SuggestionProfile = {
  status: 'loading' | 'ready' | 'error'
  sectorSet: boolean
  themeSet: boolean
  locationSet: boolean
  availabilitySet: boolean
}

export function profilePromptStorageKey(userId: string) {
  return `ba-profile-prompt:${userId}`
}

export function isProfilePromptDismissed(stored: string | null) {
  return stored === '1'
}

export function suggestionProfileFromFields(
  row:
    | {
        location?: string | null
        sector_tags?: unknown
        vision_themes?: unknown
        availability?: unknown
      }
    | null
    | undefined,
): Pick<SuggestionProfile, 'sectorSet' | 'themeSet' | 'locationSet' | 'availabilitySet'> {
  if (!row) return { sectorSet: false, themeSet: false, locationSet: false, availabilitySet: false }
  const location = typeof row.location === 'string' ? row.location.trim() : ''
  return {
    sectorSet: normalizeTags(row.sector_tags, SECTOR_TAGS).length > 0,
    themeSet: normalizeTags(row.vision_themes, VISION_2030_THEMES).length > 0,
    locationSet: location.length > 0,
    availabilitySet: isAvailability(row.availability),
  }
}
