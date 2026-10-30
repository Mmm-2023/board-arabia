import { boardMail } from './mail.ts'
import {
  buildMajlisIcs,
  formatMajlisWhen,
  formatRiyadhStamp,
  googleCalendarUrl,
  majlisPageUrl,
} from './majlis.ts'

export type MajlisLetter = {
  subject: string
  text: string
  html: string
}

export type MajlisMailEvent = {
  id: string
  title: string
  region: string
  starts_at: string
  ends_at: string
  venue_name: string
  venue_address: string | null
  venue_visibility: string
  capacity: number
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function letter(subject: string, textParagraphs: string[], htmlParts: string[]): MajlisLetter {
  const wrapped = boardMail(textParagraphs.join('\n\n'), htmlParts.join('\n'))
  return { subject, text: wrapped.text, html: wrapped.html }
}

function p(value: string): string {
  return `<p>${escapeHtml(value)}</p>`
}

function link(href: string, label: string): string {
  return `<p><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></p>`
}

function whenLine(event: MajlisMailEvent): string {
  return `When: ${formatMajlisWhen(event.starts_at, event.ends_at)}`
}

function regionLine(event: MajlisMailEvent): string {
  return `Region: ${event.region}`
}

/** Address follows venue visibility. Waitlist guests do not receive a members_on_rsvp address. */
export function includeVenueAddress(event: MajlisMailEvent, registered: boolean): boolean {
  if (!event.venue_address) return false
  if (event.venue_visibility === 'members_always') return true
  return event.venue_visibility === 'members_on_rsvp' && registered
}

function venueLine(event: MajlisMailEvent, registered: boolean): string {
  if (includeVenueAddress(event, registered) && event.venue_address) {
    return `Venue: ${event.venue_name}, ${event.venue_address}`
  }
  return `Venue: ${event.venue_name}`
}

function locationFor(event: MajlisMailEvent, registered: boolean): string {
  if (includeVenueAddress(event, registered) && event.venue_address) {
    return `${event.venue_name}, ${event.venue_address}`
  }
  return event.venue_name
}

export function confirmationPack(
  site: string,
  event: MajlisMailEvent,
  memberId: string,
  registered: boolean,
) {
  const page = majlisPageUrl(site, event.id)
  const location = locationFor(event, registered)
  const details = `${event.title}. ${regionLine(event)}. ${whenLine(event)}.`
  const googleUrl = googleCalendarUrl({
    title: event.title,
    startsAtUtc: event.starts_at,
    endsAtUtc: event.ends_at,
    details,
    location,
  })
  const ics = buildMajlisIcs({
    eventId: event.id,
    memberId,
    title: event.title,
    description: `${details} Asia/Riyadh.`,
    location,
    startsAtUtc: event.starts_at,
    endsAtUtc: event.ends_at,
  })
  return { page, googleUrl, ics, location }
}

export function guestRegisteredLetter(
  site: string,
  event: MajlisMailEvent,
  memberId: string,
): MajlisLetter & { ics: string; googleUrl: string } {
  const pack = confirmationPack(site, event, memberId, true)
  const lines = [
    `You are registered for ${event.title}.`,
    regionLine(event),
    whenLine(event),
    venueLine(event, true),
    'The calendar file is attached.',
    `Add to Google Calendar: ${pack.googleUrl}`,
    `Open your registration: ${pack.page}`,
  ]
  const built = letter(`Board Arabia: you are registered for ${event.title}`, lines, [
    p(lines[0]),
    p(lines[1]),
    p(lines[2]),
    p(lines[3]),
    p(lines[4]),
    link(pack.googleUrl, 'Add to Google Calendar'),
    link(pack.page, 'Open your registration'),
  ])
  return { ...built, ics: pack.ics, googleUrl: pack.googleUrl }
}

export function guestWaitlistLetter(
  site: string,
  event: MajlisMailEvent,
  position: number,
): MajlisLetter {
  const page = majlisPageUrl(site, event.id)
  const lines = [
    `${event.title} is full. You are on the waitlist at position ${position}.`,
    regionLine(event),
    whenLine(event),
    'We will write if a seat opens. You can leave the waitlist from the majlis page.',
    page,
  ]
  return letter(`Board Arabia: waitlist for ${event.title}`, lines, [
    p(lines[0]),
    p(lines[1]),
    p(lines[2]),
    p(lines[3]),
    link(page, 'Open the majlis'),
  ])
}

export function guestPromotedLetter(
  site: string,
  event: MajlisMailEvent,
  memberId: string,
): MajlisLetter & { ics: string; googleUrl: string } {
  const pack = confirmationPack(site, event, memberId, true)
  const lines = [
    `A seat opened for ${event.title}. You are now registered.`,
    regionLine(event),
    whenLine(event),
    venueLine(event, true),
    'The calendar file is attached.',
    `Add to Google Calendar: ${pack.googleUrl}`,
    `Open your registration: ${pack.page}`,
  ]
  const built = letter(`Board Arabia: a seat opened for ${event.title}`, lines, [
    p(lines[0]),
    p(lines[1]),
    p(lines[2]),
    p(lines[3]),
    p(lines[4]),
    link(pack.googleUrl, 'Add to Google Calendar'),
    link(pack.page, 'Open your registration'),
  ])
  return { ...built, ics: pack.ics, googleUrl: pack.googleUrl }
}

export function guestCancelledLetter(site: string, event: MajlisMailEvent): MajlisLetter {
  const page = majlisPageUrl(site, event.id)
  const lines = [
    `Your registration for ${event.title} is cancelled.`,
    regionLine(event),
    whenLine(event),
    'You can register again from the majlis page if a seat is open.',
    page,
  ]
  return letter(`Board Arabia: registration cancelled for ${event.title}`, lines, [
    p(lines[0]),
    p(lines[1]),
    p(lines[2]),
    p(lines[3]),
    link(page, 'Open the majlis'),
  ])
}

/** Name only. A host notification must not carry another member's email. */
export function hostGuestLabel(fullName: string | null | undefined): string {
  const name = (fullName || '').trim()
  return name || 'A member'
}

export function hostRsvpLetter(
  site: string,
  event: MajlisMailEvent,
  guestLabel: string,
  change: 'registered' | 'waitlist' | 'cancelled' | 'promoted',
  registeredCount: number,
  waitlistCount: number,
): MajlisLetter {
  const page = majlisPageUrl(site, event.id)
  const verb =
    change === 'registered'
      ? 'registered'
      : change === 'waitlist'
        ? 'joined the waitlist'
        : change === 'promoted'
          ? 'moved from the waitlist to a seat'
          : 'cancelled'
  const lines = [
    `${guestLabel} ${verb} for ${event.title}.`,
    `Registered seats: ${registeredCount} of ${event.capacity}.`,
    `Waitlist: ${waitlistCount}.`,
    `Open the roster: ${page}`,
  ]
  return letter(`Board Arabia: RSVP update for ${event.title}`, lines, [
    p(lines[0]),
    p(lines[1]),
    p(lines[2]),
    link(page, 'Open the roster'),
  ])
}

export type ReminderKind = 't7' | 't1' | 't1h' | 'live'

export type ReminderLetterOptions = {
  registered?: boolean
  audience?: 'member' | 'guest'
  meetReady?: boolean
  format?: string | null
}

/** Copied from the member majlis page. Do not invent a second sentence. */
export const MEET_LINK_NOT_READY = 'The Meet link is not ready yet.'

/** Copied from the free account majlis page. Do not invent a second sentence. */
export const GUEST_JOIN_NOT_READY = 'Your place is confirmed. The Join link appears here when it is ready.'

function reminderParagraph(value: string): string {
  return `<p style="font-size:16px;line-height:1.5">${escapeHtml(value)}</p>`
}

function reminderLink(href: string, label: string): string {
  return `<p style="font-size:16px;line-height:1.5"><a href="${escapeHtml(href)}" style="display:inline-block;min-height:44px;min-width:44px;box-sizing:border-box;padding:10px 16px;font-size:16px;line-height:24px">${escapeHtml(label)}</a></p>`
}

/**
 * DRAFT wording for t1h and live. Sending stays off until the owner approves
 * the words, the cron, and the first send.
 */
export function reminderLetter(
  site: string,
  event: MajlisMailEvent,
  kind: ReminderKind,
  options?: ReminderLetterOptions,
): MajlisLetter {
  const page = majlisPageUrl(site, event.id)
  const registered = options?.registered !== false
  const lead =
    kind === 't7'
      ? `${event.title} is one week away.`
      : kind === 't1'
        ? `${event.title} is one day away.`
        : kind === 't1h'
          ? `${event.title} starts in about one hour.`
          : `${event.title} is starting now.`
  const subject =
    kind === 't7'
      ? `Board Arabia: ${event.title} is one week away`
      : kind === 't1'
        ? `Board Arabia: ${event.title} is tomorrow`
        : kind === 't1h'
          ? `Board Arabia: ${event.title} starts in about one hour`
          : `Board Arabia: ${event.title} is starting now`
  const lines = [lead, regionLine(event), whenLine(event), venueLine(event, registered)]
  if (options?.format === 'virtual' && options.meetReady !== true) {
    lines.push(options.audience === 'guest' ? GUEST_JOIN_NOT_READY : MEET_LINK_NOT_READY)
  }
  lines.push(page)
  const html = lines.slice(0, -1).map((line) => reminderParagraph(line))
  html.push(reminderLink(page, 'Open the majlis'))
  return letter(subject, lines, html)
}

export function eventCancelledLetter(
  site: string,
  event: MajlisMailEvent,
  reason: string,
): MajlisLetter {
  const page = majlisPageUrl(site, event.id)
  const lines = [
    `${event.title} has been cancelled.`,
    reason.trim(),
    regionLine(event),
    whenLine(event),
    page,
  ]
  return letter(`Board Arabia: ${event.title} is cancelled`, lines, [
    p(lines[0]),
    p(lines[1]),
    p(lines[2]),
    p(lines[3]),
    link(page, 'Open the majlis'),
  ])
}

export function eventUpdatedLetter(site: string, event: MajlisMailEvent, registered: boolean): MajlisLetter {
  const page = majlisPageUrl(site, event.id)
  const lines = [
    `${event.title} has an updated time, region, or venue.`,
    regionLine(event),
    whenLine(event),
    venueLine(event, registered),
    page,
  ]
  return letter(`Board Arabia: ${event.title} was updated`, lines, [
    p(lines[0]),
    p(lines[1]),
    p(lines[2]),
    p(lines[3]),
    link(page, 'Open the majlis'),
  ])
}

export function priorityLabel(endsAtIso: string, nowMs: number): string {
  if (nowMs < new Date(endsAtIso).getTime()) {
    return `Founding priority until ${formatRiyadhStamp(endsAtIso)}`
  }
  return 'Open to all members'
}
