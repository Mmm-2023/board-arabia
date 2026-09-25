/** Majlis slice 1 field rules. No mail, RSVP, or map behavior. */

export const MAJLIS_REGIONS = [
  'Riyadh',
  'Makkah',
  'Madinah',
  'Eastern Province',
  'Asir',
  'Tabuk',
  'Hail',
  'Northern Borders',
  'Jazan',
  'Najran',
  'Al Bahah',
  'Al Jawf',
  'Qassim',
] as const

export type MajlisRegion = (typeof MAJLIS_REGIONS)[number]
export type MajlisStatus = 'pending_approval' | 'published' | 'rejected'

const REGION_SET = new Set<string>(MAJLIS_REGIONS)

export type MajlisApplication = {
  title: string
  description: string
  region: MajlisRegion
  focusTags: string[]
  startsAtUtc: string
  endsAtUtc: string
  capacity: number
  venueName: string
  venueAddress: string
}

export function isMajlisRegion(value: string): value is MajlisRegion {
  return REGION_SET.has(value)
}

/** Treat a datetime-local value as Asia/Riyadh wall time (UTC+3, no DST). */
export function riyadhWallToUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}:00+03:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function formatMajlisWhen(startsAtUtc: string, endsAtUtc: string): string {
  const start = new Date(startsAtUtc)
  const end = new Date(endsAtUtc)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return `${date.format(start)}, ${clock.format(start)} to ${clock.format(end)} Asia/Riyadh`
}

export function parseFocusTags(raw: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of raw.split(',')) {
    const tag = part.trim().replace(/\s+/g, ' ')
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}

export function validateMajlisApplication(input: {
  title: string
  description: string
  region: string
  focusTags: string[]
  startsAtUtc: string
  endsAtUtc: string
  capacity: number
  venueName: string
  venueAddress: string
}): { ok: true; value: MajlisApplication } | { ok: false; error: string } {
  const title = input.title.trim()
  const description = input.description.trim()
  const venueName = input.venueName.trim()
  const venueAddress = input.venueAddress.trim()
  if (title.length < 1 || title.length > 160) {
    return { ok: false, error: 'Add a title (160 characters or fewer).' }
  }
  if (description.length < 1 || description.length > 2000) {
    return { ok: false, error: 'Add a description (2000 characters or fewer).' }
  }
  if (!isMajlisRegion(input.region)) {
    return { ok: false, error: 'Choose one region.' }
  }
  if (input.focusTags.length < 1 || input.focusTags.length > 8) {
    return { ok: false, error: 'Add 1 to 8 focus tags.' }
  }
  if (input.focusTags.some((tag) => tag.length < 1 || tag.length > 40)) {
    return { ok: false, error: 'Each focus tag must be 40 characters or fewer.' }
  }
  const starts = new Date(input.startsAtUtc)
  const ends = new Date(input.endsAtUtc)
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    return { ok: false, error: 'Enter a start and end time.' }
  }
  if (ends.getTime() <= starts.getTime()) {
    return { ok: false, error: 'End time must be after the start time.' }
  }
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 500) {
    return { ok: false, error: 'Capacity must be a whole number from 1 to 500.' }
  }
  if (venueName.length < 1 || venueName.length > 200) {
    return { ok: false, error: 'Add a venue name (200 characters or fewer).' }
  }
  if (venueAddress.length < 1 || venueAddress.length > 500) {
    return { ok: false, error: 'Add a venue address (500 characters or fewer).' }
  }
  return {
    ok: true,
    value: {
      title,
      description,
      region: input.region,
      focusTags: input.focusTags,
      startsAtUtc: starts.toISOString(),
      endsAtUtc: ends.toISOString(),
      capacity: input.capacity,
      venueName,
      venueAddress,
    },
  }
}

export function rejectionFeedbackError(raw: string): string | null {
  const feedback = raw.trim()
  if (feedback.length < 1) return 'Rejection feedback is required.'
  if (feedback.length > 2000) return 'Rejection feedback must be 2000 characters or fewer.'
  return null
}
