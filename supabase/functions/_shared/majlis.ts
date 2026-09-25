/** Majlis field rules, region geotags, and server-side RSVP decisions. */

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

/** Fixed founding priority. Not a per-event setting. */
export const FOUNDING_PRIORITY_MS = 48 * 60 * 60 * 1000

/** Region centroids used to geotag a majlis. Kept in sync with majlis_region_geotag. */
export const REGION_GEOTAG: Record<MajlisRegion, { lat: number; lng: number }> = {
  Riyadh: { lat: 24.7136, lng: 46.6753 },
  Makkah: { lat: 21.3891, lng: 39.8579 },
  Madinah: { lat: 24.5247, lng: 39.5692 },
  'Eastern Province': { lat: 26.4207, lng: 50.0888 },
  Asir: { lat: 18.2465, lng: 42.5117 },
  Tabuk: { lat: 28.3838, lng: 36.555 },
  Hail: { lat: 27.5114, lng: 41.7208 },
  'Northern Borders': { lat: 30.9753, lng: 41.0381 },
  Jazan: { lat: 16.8892, lng: 42.5611 },
  Najran: { lat: 17.5656, lng: 44.2289 },
  'Al Bahah': { lat: 20.0129, lng: 41.4677 },
  'Al Jawf': { lat: 29.8874, lng: 39.3206 },
  Qassim: { lat: 26.326, lng: 43.975 },
}

export function regionGeotag(region: string): { lat: number; lng: number } | null {
  if (!isMajlisRegion(region)) return null
  return REGION_GEOTAG[region]
}

export type RsvpTier = 'founding' | 'member' | 'sponsor' | 'other'
export type RsvpAction = 'register' | 'cancel' | 'promote'
export type RsvpSeatStatus = 'registered' | 'waitlist' | 'cancelled'

/** ksa and intl are the founding seats. Any other non-sponsor seat is a general member. */
export function rsvpTier(seat: unknown): RsvpTier {
  if (seat === 'ksa' || seat === 'intl') return 'founding'
  if (seat === 'sponsor') return 'sponsor'
  if (typeof seat === 'string' && seat.trim()) return 'member'
  return 'other'
}

export function rsvpDecision(input: {
  action: RsvpAction
  tier: RsvpTier
  isHost: boolean
  nowMs: number
  opensMs: number
  priorityEndsMs: number
  capacity: number
  registeredCount: number
  current: RsvpSeatStatus | null
  waitlistCount: number
}):
  | {
      ok: true
      status: RsvpSeatStatus
      waitlistPosition: number | null
      changed: boolean
      promoteWaitlist: boolean
    }
  | { ok: false; code: string } {
  if (input.action === 'promote') {
    if (input.current !== 'waitlist') return { ok: false, code: 'not_waitlist' }
    if (input.registeredCount >= input.capacity) return { ok: false, code: 'full' }
    return {
      ok: true,
      status: 'registered',
      waitlistPosition: null,
      changed: true,
      promoteWaitlist: false,
    }
  }

  if (input.action === 'cancel') {
    if (input.tier === 'sponsor' || input.tier === 'other') return { ok: false, code: 'not_member' }
    if (!input.current || input.current === 'cancelled') {
      return {
        ok: true,
        status: 'cancelled',
        waitlistPosition: null,
        changed: false,
        promoteWaitlist: false,
      }
    }
    return {
      ok: true,
      status: 'cancelled',
      waitlistPosition: null,
      changed: true,
      promoteWaitlist: input.current === 'registered' && input.waitlistCount > 0,
    }
  }

  if (input.isHost) return { ok: false, code: 'host_cannot_rsvp' }
  if (input.tier === 'sponsor') return { ok: false, code: 'sponsor_cannot_rsvp' }
  if (input.tier === 'other') return { ok: false, code: 'not_member' }
  if (!(input.opensMs <= input.nowMs)) return { ok: false, code: 'not_open' }
  if (input.tier === 'member' && input.nowMs < input.priorityEndsMs) {
    return { ok: false, code: 'founding_window' }
  }
  if (input.current === 'registered') {
    return {
      ok: true,
      status: 'registered',
      waitlistPosition: null,
      changed: false,
      promoteWaitlist: false,
    }
  }
  if (input.registeredCount < input.capacity) {
    return {
      ok: true,
      status: 'registered',
      waitlistPosition: null,
      changed: true,
      promoteWaitlist: false,
    }
  }
  if (input.current === 'waitlist') {
    return {
      ok: true,
      status: 'waitlist',
      waitlistPosition: null,
      changed: false,
      promoteWaitlist: false,
    }
  }
  return {
    ok: true,
    status: 'waitlist',
    waitlistPosition: input.waitlistCount + 1,
    changed: true,
    promoteWaitlist: false,
  }
}

export function utcStamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** datetime-local value in Asia/Riyadh for an admin edit field. */
export function utcToRiyadhWall(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`
}

export function formatRiyadhStamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return `${datePart}, ${clock} Asia/Riyadh`
}

export function googleCalendarUrl(input: {
  title: string
  startsAtUtc: string
  endsAtUtc: string
  details: string
  location: string
}): string {
  const start = utcStamp(input.startsAtUtc)
  const end = utcStamp(input.endsAtUtc)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${start}/${end}`,
    details: input.details,
    location: input.location,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function icsEscape(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\n')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
}

function foldIcs(line: string): string {
  const parts: string[] = []
  let current = ''
  for (const ch of line) {
    if (current.length >= 73) {
      parts.push(current)
      current = ` ${ch}`
    } else {
      current += ch
    }
  }
  if (current) parts.push(current)
  return parts.join('\r\n')
}

/** Session ICS. The UID is event and member ids, never an email address. */
export function buildMajlisIcs(input: {
  eventId: string
  memberId: string
  title: string
  description: string
  location: string
  startsAtUtc: string
  endsAtUtc: string
  nowIso?: string
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Board Arabia//Majlis//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.eventId}-${input.memberId}@boardarabia.com`,
    `DTSTAMP:${utcStamp(input.nowIso || new Date().toISOString())}`,
    `DTSTART:${utcStamp(input.startsAtUtc)}`,
    `DTEND:${utcStamp(input.endsAtUtc)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    `DESCRIPTION:${icsEscape(input.description)}`,
    `LOCATION:${icsEscape(input.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.map(foldIcs).join('\r\n')}\r\n`
}

export function countPublishedByRegion(
  regions: readonly string[],
  events: { region: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const name of regions) counts[name] = 0
  for (const event of events) {
    if (counts[event.region] == null) continue
    counts[event.region] += 1
  }
  return counts
}

export function majlisPageUrl(site: string, eventId: string): string {
  const base = site.replace(/\/$/, '')
  return `${base}/dashboard/majlis?event=${encodeURIComponent(eventId)}`
}
