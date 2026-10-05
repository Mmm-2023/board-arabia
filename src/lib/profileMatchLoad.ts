import { schemaMissing } from './demoRows'
import type { ProfileMatchInput } from './homeSnapshot'
import type { ProfileRow } from './member'
import { isAvailability, normalizeTags, SECTOR_TAGS } from './profileTags'
import { supabase } from './supabase'

/** Use tags already on the member profile. Null when this session has not loaded them. */
export function profileMatchFromRow(
  profile: Pick<ProfileRow, 'availability' | 'sector_tags'> | null | undefined,
): ProfileMatchInput | null {
  if (!profile) return null
  if (profile.availability === undefined && profile.sector_tags === undefined) return null
  return {
    status: 'ready',
    availabilitySet: isAvailability(profile.availability),
    sectorSet: normalizeTags(profile.sector_tags, SECTOR_TAGS).length > 0,
  }
}

/** Same columns Profile uses. A missing column counts as Needed, matching the checklist. */
export async function loadProfileMatch(userId: string): Promise<ProfileMatchInput> {
  const { data, error } = await supabase
    .from('profiles')
    .select('availability, sector_tags')
    .eq('user_id', userId)
    .maybeSingle()
  if (error && !schemaMissing(error.message)) {
    return { status: 'error', availabilitySet: false, sectorSet: false }
  }
  return {
    status: 'ready',
    availabilitySet: isAvailability(data?.availability),
    sectorSet: normalizeTags(data?.sector_tags, SECTOR_TAGS).length > 0,
  }
}
