/**
 * Seat suggestion copy and parsers.
 * Rules run in Postgres (20270113120000_seat_matching.sql). This file does not score or rank.
 * Reason text is one stored chip at a time.
 */

import { BOARD_EXPERTISE, BOARD_SEAT_TYPES, BOARD_SEAT_WHERE } from './boardroom.ts'
import { BOARD_SEAT_KINDS, type BoardSeatKind } from './boardSeats.ts'
import { SECTOR_TAGS } from './profileTags.ts'
import { INTRO_REASON_MAX } from './memberIntros.ts'

export const SEAT_REASON_CODES = [
  'looking_for',
  'help_with',
  'expertise',
  'sector',
  'role',
  'seat_type',
  'where',
] as const

export type SeatReasonCode = (typeof SEAT_REASON_CODES)[number]

export type SeatReason = {
  code: SeatReasonCode
  value: string
}

export const SEAT_SUGGESTION_COPY = {
  heading: 'May fit you',
  helper: 'Based on your Focus and board fields. Only you see this list.',
  how: 'How suggestions work',
  viewSeat: 'View seat',
  notAFit: 'Not a fit',
  seeAll: 'See all seats',
  disclaimer: 'Suggestions only, based on what members fill in. Do your own due diligence.',
  whyTitle: 'Why this may fit you',
  peopleHeading: 'People who may fit',
  peopleHelper: 'Members who chose to be open to seats. Only you see this list.',
  requestIntro: 'Request an introduction',
  requestSent: 'Request sent',
  howTitle: 'How suggestions work',
  howBody1:
    'We compare the seat with the fields you filled in: what you are looking for, the seat types and places you are open to, your sectors and your expertise.',
  howBody2: 'Every suggestion shows its reasons. There are no scores or rankings.',
  howBody3: 'Do your own due diligence.',
  gotIt: 'Got it',
  askTitle: 'Ask for an introduction',
  askBody: 'chooses whether to accept. Contact details are shared only if they do.',
  askLabel: 'Add a short note (optional)',
  askPlaceholder: 'Why this seat may suit them',
  askHint: 'Leave out email addresses and phone numbers.',
  sendRequest: 'Send request',
  cancel: 'Cancel',
  sentDone: 'will choose whether to accept.',
  loading: 'Looking for seats that fit',
  notOpenTitle: 'Turn on seat suggestions',
  notOpenBody: 'Say you are open to new board seats and we will suggest seats that fit. You choose who sees you.',
  notOpenButton: 'Set open to seats',
  hiddenTitle: 'You are not suggested',
  hiddenBody: 'Hidden from the directory? Then you are not suggested.',
  hiddenLink: 'Your privacy',
  noFitTitle: 'No suggested seats right now',
  noFitBody: 'Nothing published fits your choices yet. You can browse every seat below, or update your Focus.',
  noFitButton: 'See all seats',
  noFitLink: 'Update your Focus',
  errorTitle: 'We could not load your suggestions',
  errorBody: 'The seat list below still works. Try again in a moment.',
  errorButton: 'Try again',
  posterNoneTitle: 'No suggested people yet',
  posterNoneBody: 'Members who are open to seats and fit this seat appear here. Check back later.',
  posterNoneButton: 'Open the directory',
  posterPendingTitle: 'Suggestions start once admin publishes this seat',
  posterPendingBody: 'Until then only you and admin can see it.',
  posterPendingButton: 'Back to board seats',
  toastSeeker: 'Removed from your suggestions',
  toastPoster: "Removed from this seat's suggestions",
  undo: 'Undo',
  skillsLabel: 'Skills wanted (optional)',
  skillsHint: 'Pick up to 3. Members with this expertise may be suggested.',
  openTitle: 'Open to new board seats',
  openBody:
    'Yes means members who post a seat can see you as a match, with your card and the reasons. They never see your email or phone.',
  openNo: 'No',
  openYes: 'Yes',
  typesHeading: 'Seat types you are open to',
  whereHeading: 'Where',
  hiddenNote: 'Hidden from the directory? Then you are not suggested.',
  privacyLink: 'Your privacy',
  save: 'Save',
  placeError: 'Pick at least one seat type and one place.',
  savedYes: 'Saved. Seat suggestions are on.',
  savedNo: 'Saved. You are not suggested for seats.',
  switchLabel: 'Seat suggestions',
  switchHelper: 'Members see suggested seats and posters see suggested people only while this is on.',
} as const

const ROLE_TITLES = [
  'Chair',
  'Vice chair',
  'Independent director',
  'Non-executive director',
  'Committee chair',
  'Adviser',
] as const

const VALUE_LISTS: Record<SeatReasonCode, readonly string[]> = {
  looking_for: ['Board seat'],
  help_with: ['Board experience'],
  expertise: BOARD_EXPERTISE,
  sector: SECTOR_TAGS,
  role: ROLE_TITLES,
  seat_type: BOARD_SEAT_TYPES,
  where: BOARD_SEAT_WHERE,
}

export function seatReasonText(reason: SeatReason, side: 'seeker' | 'poster'): string {
  const value = reason.value
  if (side === 'seeker') {
    if (reason.code === 'looking_for') return `Matches what you are looking for: ${value}`
    if (reason.code === 'expertise') return `Matches your expertise: ${value}`
    if (reason.code === 'sector') return `Shares a sector with you: ${value}`
    if (reason.code === 'seat_type') return `Matches the seat type you are open to: ${value}`
    return `Matches where you are open to seats: ${value}`
  }
  if (reason.code === 'looking_for') return `Matches what they are looking for: ${value}`
  if (reason.code === 'help_with') return `They can help with: ${value}`
  if (reason.code === 'expertise') return `Has expertise you asked for: ${value}`
  if (reason.code === 'sector') return `Shares a sector with this seat: ${value}`
  if (reason.code === 'role') return `Has held a role as: ${value}`
  if (reason.code === 'seat_type') return `Open to this seat type: ${value}`
  return `Open to seats in: ${value}`
}

export function parseSeatReasons(raw: unknown): SeatReason[] {
  if (!Array.isArray(raw)) return []
  const reasons: SeatReason[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const code = row.code
    const value = row.value
    if (typeof code !== 'string' || typeof value !== 'string') continue
    if (!(SEAT_REASON_CODES as readonly string[]).includes(code)) continue
    const allowed = VALUE_LISTS[code as SeatReasonCode]
    if (!allowed.includes(value)) continue
    reasons.push({ code: code as SeatReasonCode, value })
  }
  return reasons
}

export type SuggestedSeat = {
  id: string
  title: string
  organisationName: string
  seatKind: BoardSeatKind
  sectorTag: string
  region: string
  reasons: SeatReason[]
}

export type SuggestedPerson = {
  userId: string
  name: string
  headline: string
  company: string
  introStatus: 'pending' | 'accepted' | 'declined' | null
  reasons: SeatReason[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanLine(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  const text = value.trim().slice(0, max)
  if (!text || text.includes('@') || /[0-9](?:[0-9]|[\s\-().]){6,}[0-9]/.test(text)) return ''
  return text
}

export function presentSuggestedSeats(raw: unknown): SuggestedSeat[] {
  const seats = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { seats?: unknown }).seats : raw
  if (!Array.isArray(seats)) return []
  const rows: SuggestedSeat[] = []
  for (const item of seats) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' && UUID.test(row.id) ? row.id : ''
    const title = cleanLine(row.title, 160)
    const organisationName = cleanLine(row.organisation_name, 200)
    const seatKind = BOARD_SEAT_KINDS.find((kind) => kind === row.seat_kind) ?? null
    const reasons = parseSeatReasons(row.reasons)
    if (!id || !title || !organisationName || !seatKind || reasons.length === 0) continue
    const sectorTag = SECTOR_TAGS.find((tag) => tag === row.sector_tag) ?? ''
    const region = typeof row.region === 'string' ? row.region.trim().slice(0, 80) : ''
    rows.push({ id, title, organisationName, seatKind, sectorTag, region, reasons })
  }
  return rows
}

export function presentSuggestedPeople(raw: unknown): SuggestedPerson[] {
  const people = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { people?: unknown }).people : raw
  if (!Array.isArray(people)) return []
  const rows: SuggestedPerson[] = []
  for (const item of people) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const userId = typeof row.user_id === 'string' && UUID.test(row.user_id) ? row.user_id : ''
    const name = cleanLine(row.name, 120) || 'Member'
    const reasons = parseSeatReasons(row.reasons)
    if (!userId || reasons.length === 0) continue
    const status = row.intro_status
    const introStatus = status === 'pending' || status === 'accepted' || status === 'declined' ? status : null
    rows.push({
      userId,
      name,
      headline: cleanLine(row.headline, 160),
      company: cleanLine(row.company, 160),
      introStatus,
      reasons,
    })
  }
  return rows
}

export function suggestionState(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'error'
  const state = (raw as { state?: unknown }).state
  return typeof state === 'string' ? state : 'error'
}

export function suggestionsEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  return (raw as { enabled?: unknown }).enabled === true
}

/** Names the seat inside the existing introduction reason. The note stays optional. */
export function seatIntroReason(title: string, note: string): { ok: true; reason: string } | { ok: false; error: string } {
  const seat = title.trim().replace(/\s+/g, ' ')
  const extra = note.trim()
  if (!seat || seat.includes('@')) return { ok: false, error: 'That seat cannot be named in a request.' }
  const prefix = `Board seat: ${seat}`
  const reason = extra ? `${prefix}. ${extra}` : prefix
  if (reason.length > INTRO_REASON_MAX) return { ok: false, error: 'Shorten the note so the seat name still fits.' }
  if (reason.includes('@') || /[0-9](?:[0-9]|[\s\-().]){6,}[0-9]/.test(reason)) {
    return { ok: false, error: 'Leave email addresses and phone numbers out of the note.' }
  }
  return { ok: true, reason }
}

export function riyadhStamp(when: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(when)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `Last updated ${pick('weekday')} ${pick('day')} ${pick('month')}, ${pick('hour')}:${pick('minute')} Riyadh time`
}
