import { useEffect, useState } from 'react'
import { schemaMissing } from './demoRows'
import { suggestionProfileFromFields, type SuggestionProfile } from './suggestionProfile'
import { supabase } from './supabase'

const EMPTY: SuggestionProfile = {
  status: 'loading',
  sectorSet: false,
  themeSet: false,
  locationSet: false,
}

/** Own profile row only. Column grants already allow location, sector_tags, and vision_themes. */
export async function loadOwnSuggestionProfile(userId: string): Promise<SuggestionProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('location, sector_tags, vision_themes')
    .eq('user_id', userId)
    .maybeSingle()
  if (error && !schemaMissing(error.message)) {
    return { status: 'error', sectorSet: false, themeSet: false, locationSet: false }
  }
  return { status: 'ready', ...suggestionProfileFromFields(data) }
}

export function useOwnSuggestionProfile(userId: string) {
  const [seenUser, setSeenUser] = useState(userId)
  const [profile, setProfile] = useState<SuggestionProfile>(EMPTY)
  if (seenUser !== userId) {
    setSeenUser(userId)
    setProfile(EMPTY)
  }

  useEffect(() => {
    let cancelled = false
    void loadOwnSuggestionProfile(userId).then((next) => {
      if (!cancelled) setProfile(next)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  return profile
}
