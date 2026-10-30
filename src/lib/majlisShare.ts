/**
 * DRAFT LinkedIn post text for a member majlis.
 * The member posts it. This module does not send, post, or call the network.
 * MAJLIS_SHARE_CARDS_ENABLED stays false until the owner approves the draft.
 */
import { isLinkedInShareUrl, linkedInShareUrl } from '../../supabase/functions/_shared/linkedin_share_url.ts'

export const MAJLIS_SHARE_CARDS_ENABLED = false

export const MAJLIS_SHARE_LIMIT = 300

/** One hashtag. The cap is two. */
export const MAJLIS_SHARE_HASHTAGS = ['#BoardArabia'] as const

export const ATTENDING_POST_LEAD = "I'm attending"

export const ATTENDED_POST_LEAD = 'I joined'

export const MAJLIS_SHARE_HOST_LINE = 'hosted by Board Arabia'

const PUBLIC_ORIGIN = 'https://boardarabia.com'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MajlisShareEvent = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  status?: string | null
  format?: string | null
  cancelled_at?: string | null
  my_rsvp_status?: string | null
  venue_address?: string | null
  host_full_name?: string | null
  meet_url?: string | null
}

export type MajlisSharePhase = 'attending' | 'attended'

export type MajlisShareModel = {
  phase: MajlisSharePhase
  text: string
  shareUrl: string
  publicUrl: string | null
}

export function majlisShareDate(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return 'a later date'
  const shifted = new Date(ms + 3 * 60 * 60 * 1000)
  const month = MONTHS[shifted.getUTCMonth()] ?? 'Jan'
  return `${shifted.getUTCDate()} ${month} ${shifted.getUTCFullYear()}`
}

/** Public majlis route. Only a published virtual event has that page. */
export function majlisPublicUrl(event: MajlisShareEvent): string | null {
  if (!UUID.test(event.id)) return null
  if (event.status !== 'published') return null
  if (event.format !== 'virtual') return null
  if (event.cancelled_at) return null
  return `${PUBLIC_ORIGIN}/majlis/${event.id}`
}

export function majlisShareUrl(text: string): string {
  const url = linkedInShareUrl(text)
  return isLinkedInShareUrl(url) ? url : ''
}

export function attendingPostText(event: MajlisShareEvent): string {
  return buildPost(ATTENDING_POST_LEAD, event)
}

export function attendedPostText(event: MajlisShareEvent): string {
  return buildPost(ATTENDED_POST_LEAD, event)
}

export function majlisShareModel(
  event: MajlisShareEvent,
  nowMs: number,
  enabled: boolean = MAJLIS_SHARE_CARDS_ENABLED,
): MajlisShareModel | null {
  if (!enabled) return null
  if (event.my_rsvp_status !== 'registered') return null
  if (event.status !== 'published') return null
  if (event.cancelled_at) return null
  const end = Date.parse(event.ends_at)
  if (Number.isNaN(end)) return null
  const phase: MajlisSharePhase = nowMs < end ? 'attending' : 'attended'
  const text = phase === 'attending' ? attendingPostText(event) : attendedPostText(event)
  const shareUrl = majlisShareUrl(text)
  if (!shareUrl) return null
  return { phase, text, shareUrl, publicUrl: majlisPublicUrl(event) }
}

function buildPost(lead: string, event: MajlisShareEvent): string {
  const title = cleanTitle(event)
  const date = majlisShareDate(event.starts_at)
  const url = majlisPublicUrl(event)
  const withTags = fit(lead, title, date, url, MAJLIS_SHARE_HASHTAGS)
  if (withTags) return scrub(withTags, event)
  const plain = fit(lead, title, date, url, [])
  if (plain) return scrub(plain, event)
  return scrub(fit(lead, 'this majlis', date, null, []) || `${lead} this majlis, ${MAJLIS_SHARE_HOST_LINE}.`, event)
}

function fit(
  lead: string,
  title: string,
  date: string,
  url: string | null,
  hashtags: readonly string[],
): string | null {
  const full = compose(lead, title, date, url, hashtags)
  if (full.length <= MAJLIS_SHARE_LIMIT) return full
  const ellipsis = '...'
  const base = compose(lead, ellipsis, date, url, hashtags)
  if (base.length > MAJLIS_SHARE_LIMIT) return null
  const budget = MAJLIS_SHARE_LIMIT - base.length
  let prefix = title.slice(0, budget).trimEnd()
  const lastSpace = prefix.lastIndexOf(' ')
  if (lastSpace > 12 && prefix.length < title.length) prefix = prefix.slice(0, lastSpace).trimEnd()
  const name = prefix ? `${prefix}...` : ellipsis
  const text = compose(lead, name, date, url, hashtags)
  return text.length <= MAJLIS_SHARE_LIMIT ? text : null
}

function compose(
  lead: string,
  title: string,
  date: string,
  url: string | null,
  hashtags: readonly string[],
): string {
  const lines = [`${lead} ${title} on ${date}, ${MAJLIS_SHARE_HOST_LINE}.`]
  if (url) lines.push(url)
  if (hashtags.length > 0) lines.push(hashtags.slice(0, 2).join(' '))
  return lines.join('\n')
}

function cleanTitle(event: MajlisShareEvent): string {
  let title = event.title || ''
  title = title.replace(/https?:\/\/\S+/gi, ' ')
  title = title.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
  title = title.replace(/\+\d[\d\s().-]{6,}\d/g, ' ')
  title = title.replace(/\b\d{8,}\b/g, ' ')
  title = title.replace(/(?:[$€£]\s?\d[\d,]*)|(?:\b(?:SAR|USD|EUR|GBP)\s?\d[\d,]*)|(?:\b\d[\d,]*\s?(?:SAR|USD|EUR|GBP)\b)/gi, ' ')
  title = title.replace(/\bsponsorship\b/gi, ' ')
  title = title.replace(/\bsponsors\b/gi, ' ')
  title = title.replace(/\bsponsor\b/gi, ' ')
  title = cut(title, event.venue_address)
  title = cut(title, event.meet_url)
  title = cut(title, event.host_full_name, 3)
  title = title.replace(/\bmeet\b/gi, ' ')
  title = title.replace(/\bjoin\b/gi, ' ')
  title = title.replace(/\s+/g, ' ').trim()
  return title || 'this majlis'
}

function cut(value: string, piece: string | null | undefined, min = 4): string {
  const token = piece?.trim()
  if (!token || token.length < min) return value
  return value.split(token).join(' ')
}

function scrub(text: string, event: MajlisShareEvent): string {
  let out = cut(text, event.meet_url)
  out = cut(out, event.venue_address)
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
  out = out.replace(/https?:\/\/meet\.google\.com\S*/gi, '')
  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}
