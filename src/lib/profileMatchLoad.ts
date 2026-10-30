import { CAN_HELP_WITH, LOOKING_FOR, allowedChips } from '../../supabase/functions/_shared/focus_fields.ts'
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
  const wide = await supabase
    .from('profiles')
    .select('availability, sector_tags, can_help_with, looking_for')
    .eq('user_id', userId)
    .maybeSingle()
  if (wide.error && schemaMissing(wide.error.message)) {
    const narrow = await supabase
      .from('profiles')
      .select('availability, sector_tags')
      .eq('user_id', userId)
      .maybeSingle()
    if (narrow.error && !schemaMissing(narrow.error.message)) {
      return { status: 'error', availabilitySet: false, sectorSet: false }
    }
    return {
      status: 'ready',
      availabilitySet: isAvailability(narrow.data?.availability),
      sectorSet: normalizeTags(narrow.data?.sector_tags, SECTOR_TAGS).length > 0,
    }
  }
  if (wide.error) return { status: 'error', availabilitySet: false, sectorSet: false }
  return {
    status: 'ready',
    availabilitySet: isAvailability(wide.data?.availability),
    sectorSet: normalizeTags(wide.data?.sector_tags, SECTOR_TAGS).length > 0,
    helpWith: allowedChips(wide.data?.can_help_with, CAN_HELP_WITH)[0] ?? '',
    lookingFor: allowedChips(wide.data?.looking_for, LOOKING_FOR)[0] ?? '',
  }
}
