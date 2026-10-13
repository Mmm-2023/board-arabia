/** Home "Needs you" lines and the three This week previews. Copy is fixed. */

export const NEEDS_YOU_TITLE = 'Needs you'
export const NEEDS_YOU_SUBTITLE = 'A few things to finish so your membership works for you.'
export const NEEDS_YOU_EMPTY = "You're all set. Nothing needs you right now."

export const SEE_MORE_LABEL = 'See more'
export const SEE_LESS_LABEL = 'See less'
export const SEE_MORE_ACCESSIBLE = 'Show more from Board Arabia'
export const THIS_WEEK_SEE_ALL = 'See all'

export const EXPLORE_DEALS_LABEL = 'Explore deals'
export const EXPLORE_DEALS_TO = '/dashboard/deals'

export const TWO_STEP_LABEL = 'Turn on two-step sign-in to protect your account'
export const TWO_STEP_ACTION = 'Turn on'
export const TWO_STEP_TO = '/dashboard/two-step'

export const FINISH_PROFILE_ACTION = 'Finish profile'
export const FINISH_PROFILE_TO = '/dashboard/profile#profile-tags'

export const VIEW_INVITE = 'View invite'
export const VIEW_INVITES = 'View invites'
export const ROOMS_TO = '/dashboard/deals/rooms'

export const SUGGESTED_ACTION = 'Suggested introductions'
export const SUGGESTED_INTROS_TO = '/dashboard/people/intros'

export type NeedsYouItem = {
  id: string
  label: string
  action: string
  to: string
}

export function profileGapCount(profile: {
  status: string
  sectorSet: boolean
  themeSet: boolean
  locationSet: boolean
}): number {
  if (profile.status !== 'ready') return 0
  return Number(!profile.sectorSet) + Number(!profile.themeSet) + Number(!profile.locationSet)
}

export function profileGapLabel(missing: number): string | null {
  if (!Number.isInteger(missing) || missing <= 0) return null
  if (missing === 1) return 'One step left to complete your profile'
  return `Your profile is ${missing} steps from complete`
}

export function roomInviteCopy(count: number, roomName: string): { label: string; action: string } | null {
  if (!Number.isInteger(count) || count <= 0) return null
  if (count === 1) return { label: `You're invited to a deal room: ${roomName}`, action: VIEW_INVITE }
  return { label: `You have ${count} deal room invites`, action: VIEW_INVITES }
}

export function suggestionLabel(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null
  return `${count} suggested introductions for you`
}

export function buildNeedsYou(input: {
  twoStepOff: boolean
  profileGaps: number
  invites: { id: string; name: string }[]
  suggestionCount: number
  attention: { title: string; to: string; cta: string }[]
}): NeedsYouItem[] {
  const items: NeedsYouItem[] = []
  if (input.twoStepOff) {
    items.push({
      id: 'two-step',
      label: TWO_STEP_LABEL,
      action: TWO_STEP_ACTION,
      to: TWO_STEP_TO,
    })
  }
  for (const item of input.attention) {
    if (item.to.includes('#password')) {
      items.push({ id: 'password', label: item.title, action: item.cta, to: item.to })
    }
  }
  const gap = profileGapLabel(input.profileGaps)
  if (gap) {
    items.push({
      id: 'profile',
      label: gap,
      action: FINISH_PROFILE_ACTION,
      to: FINISH_PROFILE_TO,
    })
  } else {
    for (const item of input.attention) {
      if (!item.to.startsWith('/dashboard/profile') || item.to.includes('#password')) continue
      const one = profileGapLabel(1)
      if (!one) continue
      items.push({ id: 'profile', label: one, action: FINISH_PROFILE_ACTION, to: item.to })
    }
  }
  const count = input.invites.length
  const invite = roomInviteCopy(count, input.invites[0]?.name ?? '')
  if (invite) {
    items.push({
      id: 'invites',
      label: invite.label,
      action: invite.action,
      to: count === 1 ? `${ROOMS_TO}/${input.invites[0].id}` : ROOMS_TO,
    })
  }
  const suggestions = suggestionLabel(input.suggestionCount)
  if (suggestions) {
    items.push({
      id: 'suggestions',
      label: suggestions,
      action: SUGGESTED_ACTION,
      to: SUGGESTED_INTROS_TO,
    })
  }
  return items
}

export function homePrimaryAction(cta: { id: string; label: string; to: string } | null): {
  id: string
  label: string
  to: string
} {
  if (cta) return cta
  return { id: 'explore', label: EXPLORE_DEALS_LABEL, to: EXPLORE_DEALS_TO }
}

export type DigestPreviewSource = {
  newMembers: { fullName: string }[]
  newMandates: { oneLiner: string }[]
  upcomingEvents: { title: string }[]
  notes?: { text: string }[]
  introductions: { fullName: string; example?: boolean }[]
}

/** First three member-visible lines, in the same order as the This week page. */
export function digestPreviewLines(digest: DigestPreviewSource, limit = 3): string[] {
  const lines: string[] = []
  for (const member of digest.newMembers) if (member.fullName) lines.push(member.fullName)
  for (const mandate of digest.newMandates) if (mandate.oneLiner) lines.push(mandate.oneLiner)
  for (const event of digest.upcomingEvents) if (event.title) lines.push(event.title)
  for (const note of digest.notes ?? []) if (note.text) lines.push(note.text)
  for (const intro of digest.introductions) {
    if (intro.example) continue
    if (intro.fullName) lines.push(intro.fullName)
  }
  return lines.slice(0, Math.max(0, limit))
}

/** Live partner rows only. Samples never stand in for an empty Partners page. */
export function liveHomePartners<T extends { example?: boolean; is_partner?: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.is_partner === true && row.example !== true)
}
