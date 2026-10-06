import { normalizeTags, SECTOR_TAGS, VISION_2030_THEMES } from './profileTags.ts'

/** Exact empty-state line when sectors or themes are missing. */
export const ADD_SECTORS_AND_THEMES = 'Add your sectors and themes to get suggested introductions.'

/** Exact empty-state line when the member already has sectors and themes. */
export const NO_SUGGESTIONS_THIS_WEEK = 'No suggested introductions this week.'

/** Home prompt. Intro suggestions use these fields. */
export const PROFILE_PROMPT_LINE =
  'Add your sectors, themes, and location. Intro suggestions depend on them.'

export const SUGGESTION_PROFILE_HREF = '/dashboard/profile#profile-tags'

export type SuggestionProfile = {
  status: 'loading' | 'ready' | 'error'
  sectorSet: boolean
  themeSet: boolean
  locationSet: boolean
}

export function profilePromptStorageKey(userId: string) {
  return `ba-profile-prompt:${userId}`
}

export function isProfilePromptDismissed(stored: string | null) {
  return stored === '1'
}

/** Weekly suggestions need at least one sector and one theme. Location is prompted separately. */
export function suggestionTagsReady(profile: Pick<SuggestionProfile, 'sectorSet' | 'themeSet'>) {
  return profile.sectorSet && profile.themeSet
}

export function suggestionProfileNeedsPrompt(
  profile: Pick<SuggestionProfile, 'sectorSet' | 'themeSet' | 'locationSet'>,
) {
  return !profile.sectorSet || !profile.themeSet || !profile.locationSet
}

export function suggestionProfileFromFields(
  row: { location?: string | null; sector_tags?: unknown; vision_themes?: unknown } | null | undefined,
): Pick<SuggestionProfile, 'sectorSet' | 'themeSet' | 'locationSet'> {
  if (!row) return { sectorSet: false, themeSet: false, locationSet: false }
  const location = typeof row.location === 'string' ? row.location.trim() : ''
  return {
    sectorSet: normalizeTags(row.sector_tags, SECTOR_TAGS).length > 0,
    themeSet: normalizeTags(row.vision_themes, VISION_2030_THEMES).length > 0,
    locationSet: location.length > 0,
  }
}
